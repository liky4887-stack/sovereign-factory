/**
 * MultiPersonaPanel — runs multiple personas and aggregates the results.
 *
 * Responsibilities:
 *   1. Evaluate each selected persona against the goal + abstraction.
 *   2. Detect conflicts between personas whose `opposes` lists overlap.
 *   3. Extract consensus points where 2+ personas share a recommendation.
 *   4. Surface blocking issues (severity >= threshold OR check.blocking).
 *   5. Rank blocking issues so the caller sees the most severe first.
 *
 * The panel produces a MultiPersonaReview. Plan refinement (PlanRefiner)
 * consumes that review to produce variants.
 */

import { personaRegistry, PersonaRegistry } from './PersonaRegistry';
import { personaEvaluator, PersonaEvaluator, EvaluationContext } from './PersonaEvaluator';
import { log } from '../core/logger';
import type {
  MultiPersonaReview,
  Persona,
  PersonaConflict,
  PersonaReview,
  Severity,
} from './types';

const SEVERITY_ORDER: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export interface PanelOptions {
  registry?: PersonaRegistry;
  evaluator?: PersonaEvaluator;
  minSeverityForBlocking?: Severity;
}

export class MultiPersonaPanel {
  private readonly registry: PersonaRegistry;
  private readonly evaluator: PersonaEvaluator;
  private readonly defaultBlockingThreshold: Severity;

  constructor(opts?: PanelOptions) {
    this.registry = opts?.registry ?? personaRegistry;
    this.evaluator = opts?.evaluator ?? personaEvaluator;
    this.defaultBlockingThreshold = opts?.minSeverityForBlocking ?? 'high';
  }

  /**
   * Run a full panel review.
   *
   * @param goal           The raw goal string.
   * @param options        Optional: personaIds subset, abstraction features,
   *                       constraints, blocking threshold.
   */
  review(
    goal: string,
    options?: {
      personaIds?: string[];
      features?: string[];
      constraints?: string[];
      minSeverityForBlocking?: Severity;
    },
  ): MultiPersonaReview {
    const threshold = options?.minSeverityForBlocking ?? this.defaultBlockingThreshold;

    // Select personas
    const selected: Persona[] = options?.personaIds && options.personaIds.length > 0
      ? options.personaIds.map((id) => this.registry.get(id)).filter((p): p is Persona => p !== null)
      : this.registry.list();

    const ctx: EvaluationContext = {
      goal,
      features: options?.features ?? [],
      constraints: options?.constraints ?? [],
    };

    // Evaluate each persona
    const reviews: PersonaReview[] = selected.map((p) => this.evaluator.evaluate(p, ctx));

    // Detect conflicts
    const conflicts = this.detectConflicts(reviews, selected);

    // Consensus: recommendations that appear in 2+ personas' recommendation lists
    const consensusPoints = this.findConsensus(reviews);

    // Blocking issues: severity >= threshold OR check.blocking flag
    const blockingIssues: MultiPersonaReview['blockingIssues'] = [];
    for (const r of reviews) {
      for (const risk of r.risks) {
        const severity = SEVERITY_ORDER[risk.severity];
        const thresholdSeverity = SEVERITY_ORDER[threshold];
        if (risk.blocking || severity >= thresholdSeverity) {
          blockingIssues.push({
            personaId: r.personaId,
            text: risk.text,
            severity: risk.severity,
          });
        }
      }
    }

    // Sort blocking issues by severity desc
    blockingIssues.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);

    const summary = this.buildPanelSummary(reviews, conflicts, blockingIssues);

    log.info('persona.panel.review', {
      goal: goal.slice(0, 80),
      personas: selected.length,
      totalRisks: reviews.reduce((s, r) => s + r.risks.length, 0),
      conflicts: conflicts.length,
      blocking: blockingIssues.length,
    });

    return {
      goal,
      personasInvoked: selected.map((p) => p.id),
      reviews,
      conflicts,
      consensusPoints,
      blockingIssues,
      variants: [], // populated by PlanRefiner
      recommendedVariantId: '',
      summary,
      panelCompletedAt: new Date().toISOString(),
    };
  }

  /**
   * Detect conflicts between two personas whose `opposes` lists reference
   * each other's objectives. A conflict is only emitted if both personas
   * have a fired check on the same conceptual topic (roughly: keyword
   * overlap in their risks).
   */
  private detectConflicts(
    reviews: PersonaReview[],
    personas: Persona[],
  ): PersonaConflict[] {
    const byId = new Map<string, Persona>();
    for (const p of personas) byId.set(p.id, p);

    const conflicts: PersonaConflict[] = [];

    for (let i = 0; i < reviews.length; i++) {
      for (let j = i + 1; j < reviews.length; j++) {
        const a = reviews[i];
        const b = reviews[j];
        const pa = byId.get(a.personaId);
        const pb = byId.get(b.personaId);
        if (!pa || !pb) continue;

        // Do they oppose each other?
        const aOpposesB = pa.opposes.some((topic) =>
          pb.objectives.some((obj) => obj.toLowerCase().includes(topic.toLowerCase())) ||
          topic.toLowerCase().includes(pb.domain),
        );
        const bOpposesA = pb.opposes.some((topic) =>
          pa.objectives.some((obj) => obj.toLowerCase().includes(topic.toLowerCase())) ||
          topic.toLowerCase().includes(pa.domain),
        );

        if (!aOpposesB && !bOpposesA) continue;

        // They both must have actually fired checks to be a real conflict
        if (a.checksFired === 0 || b.checksFired === 0) continue;

        // Find a topic: use the first risk from each as the stance
        const aRisk = a.risks[0];
        const bRisk = b.risks[0];
        if (!aRisk || !bRisk) continue;

        conflicts.push({
          personaA: a.personaId,
          personaB: b.personaId,
          topic: this.deriveConflictTopic(a, b),
          personaAStance: aRisk.text,
          personaBStance: bRisk.text,
          resolution:
            'Weigh both stances explicitly. Neither persona is wrong — ' +
            a.personaName + ' optimizes ' + pa.objectives[0] + ', ' +
            b.personaName + ' optimizes ' + pb.objectives[0] + '. ' +
            'Choose based on which objective dominates this goal.',
        });
      }
    }

    return conflicts;
  }

  private deriveConflictTopic(a: PersonaReview, b: PersonaReview): string {
    return a.domain + ' vs ' + b.domain;
  }

  private findConsensus(reviews: PersonaReview[]): string[] {
    // Recommendations are structural strings; find any that appear in 2+.
    const counts = new Map<string, number>();
    for (const r of reviews) {
      const unique = new Set(r.recommendations);
      for (const rec of unique) {
        counts.set(rec, (counts.get(rec) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .filter(([, c]) => c >= 2)
      .map(([rec]) => rec);
  }

  private buildPanelSummary(
    reviews: PersonaReview[],
    conflicts: PersonaConflict[],
    blocking: MultiPersonaReview['blockingIssues'],
  ): string {
    const active = reviews.filter((r) => r.checksFired > 0);
    const parts: string[] = [];
    parts.push(active.length + ' of ' + reviews.length + ' personas raised concerns.');
    if (blocking.length > 0) parts.push(blocking.length + ' blocking issue(s) must be resolved.');
    if (conflicts.length > 0) parts.push(conflicts.length + ' conflict(s) require a tradeoff decision.');
    if (blocking.length === 0 && conflicts.length === 0) parts.push('No blockers. Panel is advisory only.');
    return parts.join(' ');
  }
}

export const multiPersonaPanel = new MultiPersonaPanel();
