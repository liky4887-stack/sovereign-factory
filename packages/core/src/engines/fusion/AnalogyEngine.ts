/**
 * AnalogyEngine — matches an Abstraction against the KnowledgeGraph.
 *
 * Scoring is additive and inspectable:
 *   + base 0.5
 *   + 0.12 per matching feature
 *   + 0.05 * (matches / total appliesWhen)
 *   - 0.20 per conflicting contraindication
 *   - 0.15 if intensity exceeds the ceiling
 *   - 0.5 if domain is not in allowedDomains (unless allowedDomains empty)
 *
 * Every result carries matchingFeatures and conflictingFeatures so the
 * caller can explain why a mechanism was chosen or rejected.
 */

import type {
  Abstraction,
  Analogy,
  Domain,
  Mechanism,
  StructuralFeature,
} from './types';
import { KnowledgeGraph, knowledgeGraph } from './KnowledgeGraph';

const INTENSITY_ORDER: Record<Mechanism['intensity'], number> = {
  light: 1,
  moderate: 2,
  aggressive: 3,
};

export interface AnalogyOptions {
  allowedDomains?: Domain[];
  intensityCeiling?: Mechanism['intensity'];
  minFitScore?: number;
  maxResults?: number;
}

export class AnalogyEngine {
  private readonly graph: KnowledgeGraph;

  constructor(graph?: KnowledgeGraph) {
    this.graph = graph ?? knowledgeGraph;
  }

  match(abstraction: Abstraction, opts: AnalogyOptions = {}): Analogy[] {
    const allowedDomains = opts.allowedDomains && opts.allowedDomains.length > 0
      ? new Set(opts.allowedDomains)
      : null;
    const ceiling = opts.intensityCeiling
      ? INTENSITY_ORDER[opts.intensityCeiling]
      : 3;
    const minFit = opts.minFitScore ?? 0.55;
    const maxResults = opts.maxResults ?? 10;

    const featureSet = new Set(abstraction.features);

    const scored: Analogy[] = [];

    for (const m of this.graph.all()) {
      if (allowedDomains && !allowedDomains.has(m.domain)) continue;

      const matching: StructuralFeature[] = [];
      const conflicting: StructuralFeature[] = [];

      for (const f of m.appliesWhen) {
        if (featureSet.has(f)) matching.push(f);
      }
      for (const f of m.contraindications) {
        if (featureSet.has(f)) conflicting.push(f);
      }

      // Skip mechanisms with zero match unless they have a special hook
      if (matching.length === 0) continue;

      let score = 0.5;
      score += matching.length * 0.12;
      score += (matching.length / Math.max(m.appliesWhen.length, 1)) * 0.05;
      score -= conflicting.length * 0.20;
      if (INTENSITY_ORDER[m.intensity] > ceiling) score -= 0.15;

      // Boost high-signal feature combinations
      if (matching.includes('adversarial') && matching.includes('real_time')) score += 0.05;
      if (matching.includes('high_reliability') && matching.includes('safety_critical')) score += 0.05;

      if (score < minFit) continue;

      scored.push({
        mechanismId: m.id,
        mechanismName: m.name,
        domain: m.domain,
        tactic: m.tactic,
        summary: m.summary,
        fitScore: Math.round(score * 100) / 100,
        matchingFeatures: matching,
        conflictingFeatures: conflicting,
        rationale: this.buildRationale(m, matching, conflicting, score),
        intensity: m.intensity,
      });
    }

    scored.sort((a, b) => b.fitScore - a.fitScore);
    return scored.slice(0, maxResults);
  }

  private buildRationale(
    m: Mechanism,
    matching: StructuralFeature[],
    conflicting: StructuralFeature[],
    score: number,
  ): string {
    const parts: string[] = [];
    if (matching.length > 0) {
      parts.push('Matches ' + matching.length + ' structural feature(s): ' + matching.join(', '));
    }
    if (conflicting.length > 0) {
      parts.push('Conflicts with ' + conflicting.length + ' contraindication(s): ' + conflicting.join(', '));
    }
    if (score >= 0.8) {
      parts.push('Strong fit.');
    } else if (score >= 0.65) {
      parts.push('Moderate fit.');
    } else {
      parts.push('Weak fit — consider but verify applicability.');
    }
    return parts.join(' ');
  }
}

export const analogyEngine = new AnalogyEngine();
