/**
 * FusionEngine — top-level orchestrator for the Cross-Domain Fusion layer.
 *
 * Consumes:
 *   - AbstractionEngine   (goal → structural features)
 *   - AnalogyEngine       (features → matching mechanisms)
 *   - SourceMapper        (existing module: goal → ExecutionPlan with steps)
 *
 * Produces:
 *   - FusionResult with enriched steps, top analogies, and domain provenance.
 *
 * Callers:
 *   - /omega/execute can call fuse() after SourceMapper, before Orchestrator.
 *   - Fusion results are logged so Self-Evolution can learn which domains
 *     produce the best outcomes for which goal types.
 */

import { abstractionEngine } from './AbstractionEngine';
import { analogyEngine, AnalogyOptions } from './AnalogyEngine';
import { knowledgeGraph } from './KnowledgeGraph';
import { sourceMapper } from '../core/sourceMapper';
import { log } from '../core/logger';
import { ValidationError } from '../shared/types/errors';
import type {
  Analogy,
  Domain,
  EnrichedStep,
  FusionQuery,
  FusionResult,
  Mechanism,
} from './types';

const INTENSITY_ORDER: Record<Mechanism['intensity'], number> = {
  light: 1,
  moderate: 2,
  aggressive: 3,
};

export class FusionEngine {
  fuse(query: FusionQuery): FusionResult {
    if (!query.goal || typeof query.goal !== 'string') {
      throw new ValidationError('goal is required');
    }

    const abstraction = abstractionEngine.abstract(query.goal, query.constraints ?? []);

    const analogyOpts: AnalogyOptions = {
      allowedDomains: query.allowedDomains,
      intensityCeiling: query.intensityCeiling,
      minFitScore: query.minFitScore ?? 0.55,
      maxResults: query.maxResults ?? 10,
    };

    const analogies = analogyEngine.match(abstraction, analogyOpts);

    // Pull the existing SourceMapper plan so we can annotate its steps.
    const basePlan = sourceMapper.mapGoalToPlan(abstraction.coreObjective);

    const enrichedSteps = this.enrichSteps(basePlan.steps, analogies);

    const domainsConsulted = Array.from(
      new Set(analogies.map((a) => a.domain)),
    ) as Domain[];

    const notes: string[] = [...abstraction.notes];
    if (analogies.length === 0) {
      notes.push('No mechanisms matched the abstraction. Consider relaxing minFitScore or expanding allowedDomains.');
    }
    if (query.allowedDomains && query.allowedDomains.length > 0) {
      notes.push('Domain filter applied: ' + query.allowedDomains.join(', '));
    }
    if (query.intensityCeiling) {
      notes.push('Intensity ceiling: ' + query.intensityCeiling);
    }

    const topAnalogies = analogies.slice(0, 3);

    log.info('fusion.fuse', {
      goal: abstraction.coreObjective.slice(0, 80),
      features: abstraction.features.length,
      analogies: analogies.length,
      domains: domainsConsulted.length,
    });

    return {
      goal: query.goal,
      abstraction,
      analogies,
      topAnalogies,
      enrichedSteps,
      domainsConsulted,
      totalMechanismsConsidered: knowledgeGraph.count(),
      notes,
      fusedAt: new Date().toISOString(),
    };
  }

  private enrichSteps(
    baseSteps: Array<{ order: number; layer: string; action: string }>,
    analogies: Analogy[],
  ): EnrichedStep[] {
    if (baseSteps.length === 0) return [];

    // Round-robin assign top analogies to steps so each step gets one.
    // A future revision can assign by layer affinity instead of position.
    const slots = analogies.slice(0, baseSteps.length);

    return baseSteps.map((s, i) => {
      const assigned = slots[i];
      if (!assigned) {
        return { order: s.order, layer: s.layer, action: s.action };
      }
      return {
        order: s.order,
        layer: s.layer,
        action: s.action,
        fusionAnnotation: {
          mechanismId: assigned.mechanismId,
          mechanismName: assigned.mechanismName,
          domain: assigned.domain,
          tactic: assigned.tactic,
        },
      };
    });
  }

  listDomains(): Domain[] {
    return knowledgeGraph.domains();
  }

  stats(): { mechanisms: number; domains: number } {
    return {
      mechanisms: knowledgeGraph.count(),
      domains: knowledgeGraph.domains().length,
    };
  }
}

export const fusionEngine = new FusionEngine();
