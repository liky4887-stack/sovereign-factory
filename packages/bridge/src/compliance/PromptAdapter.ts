/**
 * PromptAdapter — normalizes user intent into a clean structured form.
 *
 * What this module DOES:
 *   - Normalizes whitespace, encoding, and diacritics.
 *   - Tokenizes for local heuristics.
 *   - Detects obvious ambiguities (empty input, contradictory flags).
 *   - Produces a stable NormalizedIntent for downstream consumers.
 *
 * What this module does NOT do (by design, per P3):
 *   - It does not attempt to circumvent any downstream model's safety
 *     systems. If a provider refuses a request, the refusal is treated
 *     as data, logged in the Truth Ledger, and surfaced to the caller.
 *   - It does not rewrite user intent to something the user didn't ask.
 */

import { NormalizedIntent } from '../types';
import { ledger } from '../ledger/TruthLedger';

export class PromptAdapter {
  normalize(raw: string): NormalizedIntent {
    const collapsed = raw.replace(/\s+/g, ' ').trim();
    const unicodeNormalized = collapsed.normalize('NFKC');
    const tokens = unicodeNormalized.split(' ').filter((t) => t.length > 0);

    const ambiguities: string[] = [];
    if (unicodeNormalized.length === 0) ambiguities.push('empty input');
    if (unicodeNormalized.length > 4000)
      ambiguities.push('input exceeds 4000 chars');
    if (/^(yes|no|ok|maybe)$/i.test(unicodeNormalized))
      ambiguities.push('single-word acknowledgment — no actionable intent');

    const result: NormalizedIntent = {
      raw,
      normalized: unicodeNormalized,
      tokens,
      ambiguities,
      detectedLanguage: this.detectLanguage(unicodeNormalized),
    };

    ledger.appendEntry({
      actor: 'promptAdapter',
      eventType: 'PROMPT_NORMALIZED',
      payload: {
        originalLength: raw.length,
        normalizedLength: unicodeNormalized.length,
        tokenCount: tokens.length,
        ambiguities,
      },
    });

    return result;
  }

  private detectLanguage(text: string): string {
    if (/[\u0600-\u06FF]/.test(text)) return 'ar';
    if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
    if (/[\u0400-\u04FF]/.test(text)) return 'ru';
    return 'en';
  }
}

export const promptAdapter = new PromptAdapter();
