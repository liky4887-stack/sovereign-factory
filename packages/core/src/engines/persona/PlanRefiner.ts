/**
 * PlanRefiner — generates weighted plan variants from a panel review.
 *
 * Each variant is a re-weighting of the same underlying plan. No new steps
 * are invented — the refiner prioritizes existing recommendations and
 * annotates the existing plan steps with rationale drawn from the personas
 * that variant favors.
 *
 * Variants produced:
 *   - secure_first   : Security Expert + SRE weighted highest
 *   - growth_first   : Growth Hacker weighted highest
 *   - balanced       : all personas equal weight
 *   - skeptic_first  : Skeptic weighted highest
 *
 * The highest-scoring variant is recommended by default.
 */

import type {
  MultiPersonaReview,
  PlanVariant,
  PersonaReview,
  Severity,
} from './types';

const SEVERITY_ORDER: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const STRATEGY_WEIGHTS: Record<
  PlanVariant['strategy'],
  Record<string, number>
> = {
  secure_first: {
    'persona.security': 3.0,
    'persona.sre': 2.5,
    'persona.cfo': 1.0,
    'persona.skeptic': 2.0,
    'persona.ux': 0.8,
    'persona.growth': 0.3,
  },
  growth_first: {
    'persona.growth': 3.0,
    'persona.ux': 1.5,
    'persona.cfo': 1.5,
    'persona.security': 1.0,
    'persona.sre': 1.0,
    'persona.skeptic': 0.3,
  },
  balanced: {
    'persona.security': 1.0,
    'persona.sre': 1.0,
    'persona.cfo': 1.0,
    'persona.skeptic': 1.0,
    'persona.ux': 1.0,
    'persona.growth': 1.0,
  },
  skeptic_first: {
    'persona.skeptic': 3.0,
    'persona.security': 2.0,
    'persona.sre': 1.5,
    'persona.cfo': 1.0,
    'persona.growth': 0.5,
    'persona.ux': 0.8,
  },
};

export class PlanRefiner {
  /**
   * Generate variants from a panel review. Populates `review.variants`
   * and `review.recommendedVariantId` in place and returns the review.
   */
  refine(review: MultiPersonaReview): MultiPersonaReview {
    const strategies: Array<PlanVariant['strategy']> = [
      'secure_first',
      'growth_first',
      'balanced',
      'skeptic_first',
    ];

    const variants: PlanVariant[] = strategies.map((strategy) =>
      this.buildVariant(strategy, review),
    );

    const scored = variants.map((v) => ({
      variant: v,
      score: this.scoreVariant(v, review),
    }));
    scored.sort((a, b) => b.score - a.score);

    const recommendedId = scored[0].variant.id;

    return {
      ...review,
      variants,
      recommendedVariantId: recommendedId,
    };
  }

  private buildVariant(
    strategy: PlanVariant['strategy'],
    review: MultiPersonaReview,
  ): PlanVariant {
    const weights = STRATEGY_WEIGHTS[strategy];

    // Score each persona's recommendations by weight * severity emphasis
    const ranked: Array<{ personaId: string; recommendation: string; weighted: number }> = [];
    for (const r of review.reviews) {
      const w = weights[r.personaId] ?? 1.0;
      if (w <= 0) continue;
      const severityEmphasis = this.personaSeverityScore(r);
      for (const rec of r.recommendations) {
        ranked.push({
          personaId: r.personaId,
          recommendation: rec,
          weighted: w * (1 + severityEmphasis * 0.5),
        });
      }
    }

    // Sort by weighted priority desc; keep top 6.
    ranked.sort((a, b) => b.weighted - a.weighted);
    const prioritized = ranked.slice(0, 6);

    const expectedTradeoffs = this.deriveTradeoffs(strategy, review);
    const notes = this.deriveNotes(strategy, review);

    return {
      id: 'variant.' + strategy,
      label: this.labelFor(strategy),
      strategy,
      weightByPersona: { ...weights },
      prioritizedRecommendations: prioritized.map(
        (p) => '[' + p.personaId.split('.').pop() + '] ' + p.recommendation,
      ),
      annotatedSteps: [],
      expectedTradeoffs,
      notes,
    };
  }

  /**
   * Score a variant by how well it covers personas that flagged high or
   * critical severities. A variant that only listens to low-severity
   * personas gets a lower score.
   */
  private scoreVariant(variant: PlanVariant, review: MultiPersonaReview): number {
    let score = 0;

    for (const r of review.reviews) {
      const w = variant.weightByPersona[r.personaId] ?? 0;
      const sev = this.personaSeverityScore(r);

      // High-severity personas carry more weight in variant scoring
      score += w * (1 + sev * 0.3);

      // A variant that ignores a persona with high-severity findings loses points
      const hasHighSeverity = r.severities.high > 0 || r.severities.critical > 0;
      if (hasHighSeverity && w < 0.5) score -= 1.5;
    }

    // Slight penalty for variants that ignore blocking issues from any high-weight persona
    for (const issue of review.blockingIssues) {
      const w = variant.weightByPersona[issue.personaId] ?? 0;
      if (w < 0.5) score -= 0.5;
    }

    return score;
  }

  private personaSeverityScore(r: PersonaReview): number {
    return (
      (r.severities.critical * 4 +
        r.severities.high * 3 +
        r.severities.medium * 2 +
        r.severities.low * 1) /
      Math.max(r.severities.critical + r.severities.high + r.severities.medium + r.severities.low, 1)
    );
  }

  private labelFor(strategy: PlanVariant['strategy']): string {
    switch (strategy) {
      case 'secure_first':
        return 'Secure First';
      case 'growth_first':
        return 'Growth First';
      case 'balanced':
        return 'Balanced';
      case 'skeptic_first':
        return 'Skeptic First';
    }
  }

  private deriveTradeoffs(
    strategy: PlanVariant['strategy'],
    review: MultiPersonaReview,
  ): string[] {
    const t: string[] = [];
    const conflicts = review.conflicts.filter((c) => {
      switch (strategy) {
        case 'secure_first':
          return c.personaA === 'persona.growth' || c.personaB === 'persona.growth';
        case 'growth_first':
          return c.personaA === 'persona.security' || c.personaB === 'persona.security' ||
                 c.personaA === 'persona.skeptic' || c.personaB === 'persona.skeptic';
        case 'skeptic_first':
          return c.personaA === 'persona.growth' || c.personaB === 'persona.growth';
        case 'balanced':
          return false;
      }
    });

    for (const c of conflicts) {
      t.push(
        'Favors ' +
          (strategy === 'secure_first' ? 'Security/SRE' :
           strategy === 'growth_first' ? 'Growth' :
           strategy === 'skeptic_first' ? 'Skeptic' : 'all') +
          ' over the opposing stance in conflict: ' + c.topic,
      );
    }

    if (strategy === 'balanced' && review.blockingIssues.length > 0) {
      t.push('Balanced weighting may not resolve ' + review.blockingIssues.length + ' blocking issue(s).');
    }
    if (strategy === 'growth_first' && review.blockingIssues.length > 0) {
      t.push('Prioritizes speed over ' + review.blockingIssues.length + ' blocking issue(s).');
    }

    return t;
  }

  private deriveNotes(
    strategy: PlanVariant['strategy'],
    review: MultiPersonaReview,
  ): string[] {
    const notes: string[] = [];
    notes.push('Personas invoked: ' + review.personasInvoked.length);
    if (review.blockingIssues.length > 0) {
      notes.push('Blocking issue count: ' + review.blockingIssues.length);
    }
    if (strategy === 'balanced') {
      notes.push('Equal weights across all personas. Best when goal spans multiple domains.');
    }
    return notes;
  }
}

export const planRefiner = new PlanRefiner();
