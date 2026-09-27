// Shared identity injection helper. Wraps the Sovereign Factory DNA
// block around any LLM call, in the same way across all engines.
// Mode determines which output contract to append:
//   'chat'  -> getChatIdentityBlock()
//   'plan'  -> getPlanIdentityBlock()
// Idempotent: if the input already starts with the identity block,
// we do NOT inject again.

import { getChatIdentityBlock, getPlanIdentityBlock } from './SovereignPrompt';

export type InjectMode = 'chat' | 'plan';

const IDENTITY_MARKER = '# SOVEREIGN FACTORY — CORE IDENTITY';

export function injectIdentity(
  input: string | Array<{ role: string; content: string }>,
  mode: InjectMode = 'chat',
): string | Array<{ role: string; content: string }> {
  const block = mode === 'plan' ? getPlanIdentityBlock() : getChatIdentityBlock();
  if (block.length === 0) return input;

  if (typeof input === 'string') {
    // Idempotence check: don't double-inject.
    if (input.startsWith(IDENTITY_MARKER) || input.startsWith(block.slice(0, 60))) {
      return input;
    }
    return block + input;
  }

  const arr = [...input];
  for (let i = arr.length - 1; i >= 0; i--) {
    const msg = arr[i];
    if (!msg || msg.role !== 'user') continue;
    if (typeof msg.content !== 'string') continue;
    if (msg.content.startsWith(IDENTITY_MARKER)) return arr; // already injected
    arr[i] = { ...msg, content: block + msg.content };
    return arr;
  }
  // No user message found — fall back to raw input
  return input;
}
