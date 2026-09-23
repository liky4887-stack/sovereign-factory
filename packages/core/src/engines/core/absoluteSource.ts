/**
 * Absolute Source — the four principles every module must honor.
 *
 * P1: Do not corrupt or silently alter the Truth Ledger.
 * P2: Preserve user intent as faithfully as possible, within real constraints.
 * P3: Prefer transparency over hidden behavior.
 * P4: Separate concerns between orchestration, execution, storage, and UI.
 *
 * Modules that touch the ledger cite P1.
 * Modules that touch user input cite P2.
 * Modules that make decisions on the user's behalf cite P3.
 * Anything crossing layers cites P4.
 */

export const PRINCIPLES = {
  P1_LEDGER_INTEGRITY:
    'Do not corrupt or silently alter the Truth Ledger.',
  P2_USER_INTENT:
    'Preserve user intent as faithfully as possible, within real constraints.',
  P3_TRANSPARENCY:
    'Prefer transparency over hidden behavior.',
  P4_SEPARATION:
    'Separate concerns between orchestration, execution, storage, and UI.',
} as const;

export type PrincipleKey = keyof typeof PRINCIPLES;

/** Runtime guard for TruthLedger — append-only, never mutate. */
export function assertNotMutatingLedger(operation: string): void {
  const forbidden = ['truncate', 'delete', 'rewrite', 'overwrite'];
  for (const word of forbidden) {
    if (operation.toLowerCase().includes(word)) {
      throw new Error(
        '[P1 VIOLATION] Ledger is append-only. Attempted: ' + operation,
      );
    }
  }
}
