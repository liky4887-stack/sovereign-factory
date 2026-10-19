// Forward to a local OpenAI-compatible proxy.
// Freebie handles auth, TLS, PoW. We handle model selection + retry.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

let _eniCache: string | null = null;
function getEniPrompt(): string {
  if (_eniCache !== null) return _eniCache;
  try {
    _eniCache = readFileSync(join(homedir(), 'prompts', 'eni-identity.md'), 'utf-8').trim();
  } catch { _eniCache = ''; }
  return _eniCache;
}

export interface LocalProxyOptions {
  port: number;
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface LocalProxyResponse {
  content: string;
  raw: unknown;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function callLocalProxy(opts: LocalProxyOptions): Promise<LocalProxyResponse> {
  // Freebie routes to Gemini Web, which applies its own content filter
  // and cannot carry the full ENI identity (taboo topics get blocked,
  // neutral topics get edgy-mode bleed from the Sovereign Factory prompt).
  // ENI stays on DeepSeek/Qwen/Kimi — those engines have no web filter.
  // Freebie is a UTILITY layer: clean text in, clean text out.
  //
  // To let Freebie carry ENI temporarily for testing, set
  // FREEBIE_ENI=1 in the environment.
  let messages = opts.messages;
  const eni = process.env.FREEBIE_ENI === '1' ? getEniPrompt() : '';
  const hasSystem = messages.some((m) => m.role === 'system');
  if (eni && !hasSystem) {
    messages = messages.map((m) => {
      if (m.role !== 'user') return m;
      return {
        role: 'user',
        content:
          '[IDENTITY — do not repeat, do not echo, do not acknowledge]\n' +
          eni +
          '\n[/IDENTITY]\n\nUser message:\n' +
          m.content +
          '\n\nRespond only to the User message above.',
      };
    });
  }

  const url = `http://127.0.0.1:${opts.port}/v1/chat/completions`;

  // Force Gemini for stability. ChatGPT (gpt-4o) gets 429'd under load and
  // echoes long prompts instead of answering. Gemini-3.6-flash is zero-auth,
  // no rate limits, and handles 12KB+ prompts cleanly.
  const model = opts.model === 'gpt-4o' || opts.model === 'auto'
    ? 'gemini-3.6-flash'
    : opts.model;

  const body = {
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 2048,
  };

  // Retry with exponential backoff on 429 / 502 / 503
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 120_000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts.signal ?? ctrl.signal,
      });

      clearTimeout(timer);

      if (res.status === 429 || res.status === 502 || res.status === 503) {
        const text = await res.text().catch(() => '');
        lastError = new Error(`local proxy :${opts.port} HTTP ${res.status}: ${text.slice(0, 200)}`);
        if (attempt < maxRetries) {
          const backoff = Math.min(30_000, 1000 * Math.pow(2, attempt) + Math.random() * 500);
          await sleep(backoff);
          continue;
        }
        throw lastError;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`local proxy :${opts.port} HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      const json = (await res.json()) as any;
      const content = json?.choices?.[0]?.message?.content ?? '';
      return { content, raw: json };
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof Error && e.name === 'AbortError') throw e;
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxRetries) {
        const backoff = Math.min(30_000, 1000 * Math.pow(2, attempt) + Math.random() * 500);
        await sleep(backoff);
        continue;
      }
    }
  }

  throw lastError ?? new Error('local proxy: exhausted retries');
}
