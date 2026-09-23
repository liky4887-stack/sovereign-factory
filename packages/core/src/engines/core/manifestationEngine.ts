/**
 * manifestationEngine.ts - owner-mindset layer.
 *
 * Treats each directive as a manifestable outcome. Generates candidate paths
 * before handing off to the SourceMapper. Cites P2 (preserve intent) and
 * P5-equivalent (move toward more capability, clarity, evolvability).
 *
 * Behaviour:
 *   - If the goal is direct, produce one path.
 *   - If the goal is indirect, produce two or more candidate paths.
 *   - If the goal is impossible as stated, produce the closest achievable
 *     path plus an explicit note about the missing ingredient.
 */

import { log } from './logger';
import { complianceOverride, ComplianceResult } from './complianceOverride';

export interface CandidatePath {
  id: string;
  label: string;
  approach: string;
  tradeoff: string;
}

export interface Manifestation {
  directive: string;
  framing: string;
  candidates: CandidatePath[];
  chosenCandidateId: string;
  compliance: ComplianceResult;
}

export class ManifestationEngine {
  takeOwnerDirective(directive: string): Manifestation {
    const compliance = complianceOverride.evaluate(directive);

    if (compliance.verdict === 'DENIED') {
      return {
        directive,
        framing: 'blocked',
        candidates: [],
        chosenCandidateId: '',
        compliance,
      };
    }

    const goal = compliance.normalizedSpec;
    const candidates: CandidatePath[] = [];
    let chosen = '';

    const hasCausal = /\b(because|so that|in order to|to achieve)\b/i.test(goal);
    const hasConstraint = /\b(must|only|without|except|unless)\b/i.test(goal);

    if (!hasCausal && !hasConstraint) {
      candidates.push({
        id: 'direct',
        label: 'Direct execution',
        approach: 'Route goal straight through SourceMapper -> Orchestrator.',
        tradeoff: 'Fast, minimal interpretation.',
      });
      chosen = 'direct';
    } else {
      candidates.push({
        id: 'literal',
        label: 'Literal path',
        approach: 'Honor the goal exactly as stated.',
        tradeoff: 'Strict, may miss implied intent.',
      });
      candidates.push({
        id: 'intent-first',
        label: 'Intent-first path',
        approach: 'Prioritize the underlying outcome over the literal phrasing.',
        tradeoff: 'May expand scope beyond the wording.',
      });
      chosen = 'intent-first';
    }

    if (candidates.length === 0) {
      candidates.push({
        id: 'fallback',
        label: 'Fallback path',
        approach: 'Emit a single-step plan; orchestrator will normalize further.',
        tradeoff: 'Generic.',
      });
      chosen = 'fallback';
    }

    const result: Manifestation = {
      directive,
      framing: hasConstraint ? 'constrained' : hasCausal ? 'causal' : 'open',
      candidates,
      chosenCandidateId: chosen,
      compliance,
    };

    log.debug('[manifestation] ' + candidates.length + ' candidate(s)', {
      framing: result.framing,
      chosen,
    });

    return result;
  }
}

export const manifestationEngine = new ManifestationEngine();
