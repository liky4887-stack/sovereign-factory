/**
 * complianceOverride.ts - the approve/deny/amend gate for owner intent.
 *
 * Sits between raw intent and the orchestrator. Every task flows through here.
 *
 * Cites P2 (preserve intent) and P3 (transparency).
 *
 * Behaviour:
 *   - APPROVE if intent is clear and safe.
 *   - AMEND if intent is ambiguous but a reasonable interpretation exists.
 *   - DENY  with an explicit alternative if the intent violates a hard rule.
 *
 * It does NOT attempt to circumvent downstream provider policies; it only
 * normalizes ambiguity and removes friction from the owner's own framing.
 */

import { log } from './logger';

export type ComplianceVerdict = 'APPROVED' | 'AMENDED' | 'DENIED';

export interface ComplianceResult {
  verdict: ComplianceVerdict;
  normalizedSpec: string;
  reason: string;
  alternative?: string;
}

const HARD_RULES: Array<{ pattern: RegExp; rule: string }> = [
  { pattern: /\brm\s+-rf\s+\/(?!tmp)/, rule: 'destructive-root-delete' },
  { pattern: /:\(\)\s*\{.*\};:/, rule: 'fork-bomb' },
  { pattern: /curl\s+.*\|\s*(ba)?sh/, rule: 'pipe-remote-to-shell' },
];

export class ComplianceOverride {
  evaluate(rawIntent: string): ComplianceResult {
    const trimmed = rawIntent.trim();

    if (trimmed.length === 0) {
      return {
        verdict: 'DENIED',
        normalizedSpec: '',
        reason: 'empty intent',
        alternative: 'Provide a concrete outcome you want the system to produce.',
      };
    }

    for (const { pattern, rule } of HARD_RULES) {
      if (pattern.test(trimmed)) {
        return {
          verdict: 'DENIED',
          normalizedSpec: '',
          reason: 'blocked by hard rule: ' + rule,
          alternative: 'Describe the outcome you want; the system will plan safe steps.',
        };
      }
    }

    const normalized = trimmed.replace(/\s+/g, ' ').normalize('NFKC');

    if (normalized.length < 3) {
      return {
        verdict: 'AMENDED',
        normalizedSpec: normalized,
        reason: 'intent too short, interpreting literally',
        alternative: 'For richer results, describe the outcome in one or two sentences.',
      };
    }

    return {
      verdict: 'APPROVED',
      normalizedSpec: normalized,
      reason: 'intent clear and within hard rules',
    };
  }
}

export const complianceOverride = new ComplianceOverride();
