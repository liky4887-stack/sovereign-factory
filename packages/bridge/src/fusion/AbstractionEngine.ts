/**
 * AbstractionEngine — converts a raw goal + constraints into structural
 * features that the AnalogyEngine can match against mechanisms.
 *
 * Uses keyword heuristics only. No LLM. Every feature gets a numeric score
 * derived from explicit keyword hits so the mapping is inspectable.
 */

import type { Abstraction, StructuralFeature } from './types';

interface FeatureRule {
  feature: StructuralFeature;
  keywords: string[];
  weight: number;
}

const FEATURE_RULES: FeatureRule[] = [
  { feature: 'distributed',         keywords: ['distributed', 'multi-region', 'shard', 'federated', 'p2p', 'peer-to-peer', 'mesh'], weight: 2 },
  { feature: 'centralized',         keywords: ['centralized', 'single-server', 'monolith', 'single-tenant'], weight: 2 },
  { feature: 'real_time',           keywords: ['real-time', 'realtime', 'live', 'streaming', 'instant', 'interactive'], weight: 2 },
  { feature: 'batch',               keywords: ['batch', 'nightly', 'scheduled', 'cron', 'etl', 'offline'], weight: 2 },
  { feature: 'adversarial',         keywords: ['adversarial', 'attack', 'threat', 'secure', 'hardening', 'game', 'compete', 'rival'], weight: 2 },
  { feature: 'cooperative',         keywords: ['collaborate', 'cooperative', 'share', 'community', 'multi-tenant', 'partnership'], weight: 2 },
  { feature: 'high_uncertainty',    keywords: ['uncertain', 'volatile', 'unpredictable', 'unknown', 'speculative', 'research', 'experiment'], weight: 2 },
  { feature: 'high_volume',         keywords: ['high-volume', 'scale', 'millions', 'billions', 'bulk', 'throughput', 'load'], weight: 2 },
  { feature: 'low_latency',         keywords: ['low-latency', 'fast', 'sub-second', 'p99', 'latency', 'tick', 'hft'], weight: 2 },
  { feature: 'high_reliability',    keywords: ['reliable', 'uptime', 'sla', 'availability', 'resilient', 'fault-tolerant', 'redundan'], weight: 2 },
  { feature: 'cost_sensitive',      keywords: ['cheap', 'cost', 'budget', 'affordable', 'price', 'economics', 'frugal'], weight: 2 },
  { feature: 'human_in_loop',       keywords: ['human', 'review', 'approval', 'manual', 'operator', 'user', 'ux', 'onboarding'], weight: 2 },
  { feature: 'fully_automated',     keywords: ['automated', 'autonomous', 'agent', 'unattended', 'headless', 'self-driving'], weight: 2 },
  { feature: 'long_horizon',        keywords: ['long-term', 'years', 'sustainable', 'compounding', 'retention', 'ecosystem'], weight: 2 },
  { feature: 'short_horizon',       keywords: ['quick', 'mvp', 'prototype', 'sprint', 'short-term', 'throwaway'], weight: 2 },
  { feature: 'single_actor',        keywords: ['single-user', 'personal', 'solo', 'individual', 'one operator'], weight: 2 },
  { feature: 'multi_actor',         keywords: ['multi-user', 'team', 'marketplace', 'community', 'many-to-many', 'network'], weight: 2 },
  { feature: 'resource_constrained',keywords: ['limited', 'constrained', 'scarce', 'budget', 'small', 'phone', 'embedded', 'termux'], weight: 2 },
  { feature: 'safety_critical',     keywords: ['critical', 'safety', 'financial', 'medical', 'regulated', 'compliance', 'audit'], weight: 2 },
  { feature: 'experimental',        keywords: ['experimental', 'prototype', 'research', 'poc', 'proof-of-concept', 'sandbox'], weight: 2 },
];

const CONSTRAINT_FEATURES: Array<{ match: RegExp; feature: StructuralFeature }> = [
  { match: /no cloud|self-host|local only|on-device|offline/i, feature: 'resource_constrained' },
  { match: /must not|never|forbid|prohibited/i,                feature: 'safety_critical' },
  { match: /regulat|hipaa|gdpr|pci|sox/i,                      feature: 'safety_critical' },
  { match: /prototype|poc|experiment/i,                        feature: 'experimental' },
  { match: /sla|uptime|reliability/i,                          feature: 'high_reliability' },
];

export class AbstractionEngine {
  abstract(goal: string, constraints: string[] = []): Abstraction {
    const haystack = (goal + ' ' + constraints.join(' ')).toLowerCase();

    const featureScores: Partial<Record<StructuralFeature, number>> = {};

    for (const rule of FEATURE_RULES) {
      let hits = 0;
      for (const k of rule.keywords) {
        if (haystack.includes(k.toLowerCase())) hits += 1;
      }
      if (hits > 0) {
        featureScores[rule.feature] = (featureScores[rule.feature] ?? 0) + hits * rule.weight;
      }
    }

    for (const c of constraints) {
      for (const rule of CONSTRAINT_FEATURES) {
        if (rule.match.test(c)) {
          featureScores[rule.feature] = (featureScores[rule.feature] ?? 0) + 3;
        }
      }
    }

    // Sort features by score descending; keep those with score >= 2.
    const ranked = (Object.entries(featureScores) as Array<[StructuralFeature, number]>)
      .filter(([, score]) => score >= 2)
      .sort((a, b) => b[1] - a[1]);

    const features = ranked.map(([f]) => f);

    const notes: string[] = [];
    if (features.length === 0) {
      notes.push('No structural features detected. Mechanism matching may be weak.');
    }
    if (features.length > 8) {
      notes.push('Many features detected. Consider narrowing the goal for sharper analogies.');
    }

    const fullScores: Record<string, number> = {};
    for (const [f, s] of ranked) fullScores[f] = s;

    return {
      goal,
      coreObjective: this.deriveCoreObjective(goal),
      constraints,
      features,
      featureScores: fullScores as Record<StructuralFeature, number>,
      notes,
    };
  }

  private deriveCoreObjective(goal: string): string {
    const cleaned = goal
      .replace(/^(build|create|design|make|ship|launch|implement|develop)\s+/i, '')
      .trim();
    const firstSentence = cleaned.split(/[.!?]/)[0] ?? cleaned;
    return firstSentence.slice(0, 180);
  }
}

export const abstractionEngine = new AbstractionEngine();
