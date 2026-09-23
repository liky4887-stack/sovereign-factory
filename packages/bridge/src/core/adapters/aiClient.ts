/**
 * aiClient.ts - central LLM caller. Model-agnostic.
 *
 * If AI_API_KEY and AI_BASE_URL are set, calls the OpenAI-compatible
 * /chat/completions endpoint. Otherwise returns a deterministic stub so the
 * architecture is testable without credentials.
 *
 * Every call is logged by the caller, not this module (keeps this file pure).
 */

import { config } from '../../config';

export interface CompleteOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface CompleteResult {
  ok: boolean;
  text: string;
  model: string;
  stub: boolean;
  error?: string;
}

export class AIClient {
  isConfigured(): boolean {
    return Boolean(config.AI.apiKey && config.AI.baseUrl);
  }

  async completeText(prompt: string, options: CompleteOptions = {}): Promise<CompleteResult> {
    const model = options.model ?? 'gpt-4o-mini';

    if (!this.isConfigured()) {
      return {
        ok: true,
        stub: true,
        model,
        text: '[stub-ai] ' + prompt.slice(0, 200),
      };
    }

    const url = config.AI.baseUrl!.replace(/\/+$/, '') + '/v1/chat/completions';
    const body = {
      model,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 1024,
      messages: [
        ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
        { role: 'user', content: prompt },
      ],
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + config.AI.apiKey!,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, stub: false, model, text: '', error: 'upstream ' + res.status + ': ' + text.slice(0, 200) };
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.message?.content ?? '';
      return { ok: true, stub: false, model, text };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, stub: false, model, text: '', error: message };
    }
  }

  async structuredPlan(goal: string): Promise<CompleteResult> {
    const systemPrompt =
      'You are a planning assistant. Respond only with a valid JSON array of ' +
      'strings, each a concrete next step. No prose, no markdown fences.';
    return this.completeText(goal, { systemPrompt, temperature: 0.1, maxTokens: 512 });
  }
}

export const aiClient = new AIClient();
