/**
 * PersonaEvaluator — runs a single persona's checks against a goal.
 *
 * For each check, the evaluator:
 *   1. Scans the goal text for any `triggersOn.keywords`
 *   2. Scans abstraction features for any `triggersOn.features`
 *   3. If either matches, adds a risk (or opportunity) to the review
 *   4. Tallies severities and computes a confidence score
 *
 * No LLM. Every decision is traceable to a specific check rule.
 */

import type {
  Persona,
  PersonaReview,
  Severity,
} from './types';

export interface EvaluationContext {
  goal: string;
  features: string[];
  constraints: string[];
}

const SEVERITY_ORDER: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export class PersonaEvaluator {
  evaluate(persona: Persona, ctx: EvaluationContext): PersonaReview {
    const lowerGoal = (ctx.goal + ' ' + ctx.constraints.join(' ')).toLowerCase();
    const featureSet = new Set(ctx.features.map((f) => f.toLowerCase()));

    const risks: PersonaReview['risks'] = [];
    const opportunities: string[] = [];
    const recommendations: string[] = [];
    const severities: Record<Severity, number> = { low: 0, medium: 0, high: 0, critical: 0 };

    let checksFired = 0;

    for (const check of persona.checks) {
      let fired = false;

      if (check.triggersOn.keywords) {
        for (const kw of check.triggersOn.keywords) {
          if (lowerGoal.includes(kw.toLowerCase())) {
            fired = true;
            break;
          }
        }
      }

      if (!fired && check.triggersOn.features) {
        for (const f of check.triggersOn.features) {
          if (featureSet.has(f.toLowerCase())) {
            fired = true;
            break;
          }
        }
      }

      if (!fired) continue;

      checksFired += 1;
      severities[check.severity] += 1;

      risks.push({
        text: check.risk,
        severity: check.severity,
        blocking: check.blocking ?? false,
      });

      if (check.opportunity) opportunities.push(check.opportunity);
      recommendations.push(check.recommendation);
    }

    const confidence = this.computeConfidence(persona, checksFired, severities);
    const summary = this.buildSummary(persona, checksFired, risks.length);

    return {
      personaId: persona.id,
      personaName: persona.name,
      domain: persona.domain,
      riskProfile: persona.riskProfile,
      summary,
      risks,
      opportunities,
      recommendations,
      severities,
      confidence,
      checksRun: persona.checks.length,
      checksFired,
    };
  }

  private computeConfidence(
    persona: Persona,
    checksFired: number,
    severities: Record<Severity, number>,
  ): number {
    if (checksFired === 0) return 0.2;

    const totalChecks = persona.checks.length;
    const fireRate = checksFired / totalChecks;

    // Confidence is higher when more checks fire AND severity distribution
    // includes at least one high/critical finding.
    const hasHighSeverity = severities.high > 0 || severities.critical > 0;

    let confidence = 0.4 + fireRate * 0.4;
    if (hasHighSeverity) confidence += 0.15;
    if (checksFired >= 3) confidence += 0.05;

    return Math.min(Math.round(confidence * 100) / 100, 0.98);
  }

  private buildSummary(persona: Persona, checksFired: number, riskCount: number): string {
    if (checksFired === 0) {
      return persona.name + ' found no applicable concerns for this goal.';
    }
    if (riskCount === 0) {
      return persona.name + ' raised ' + checksFired + ' opportunity-only finding(s).';
    }
    return persona.name + ' raised ' + riskCount + ' risk(s) across ' + checksFired + ' triggered check(s).';
  }

  /** Higher severities sort first when computing panel weights. */
  static severityWeight(sev: Severity): number {
    return SEVERITY_ORDER[sev];
  }
}

export const personaEvaluator = new PersonaEvaluator();
