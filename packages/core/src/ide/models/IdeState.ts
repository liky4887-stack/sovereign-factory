/**
 * ide/models/IdeState.ts
 * Canonical shapes for the Creator Workspace IDE.
 * Blueprints are persisted; history and corrections are derived from the
 * Truth Ledger (no separate store for them).
 */

// ── Blueprint ──────────────────────────────────────────────────
export type BlueprintLanguage = 'typescript' | 'javascript' | 'json' | 'text';

export interface Blueprint {
  id: string;
  projectId?: string;
  name: string;
  language: BlueprintLanguage;
  code: string;
  version: number;
  createdAt: string;   // ISO
  updatedAt: string;   // ISO
}

export interface BlueprintInput {
  projectId?: string;
  name: string;
  language?: BlueprintLanguage;
  code: string;
}

export interface BlueprintUpdate {
  name?: string;
  language?: BlueprintLanguage;
  code?: string;
}

// ── Execute ────────────────────────────────────────────────────
export interface IdeExecuteInput {
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
  blueprintId?: string;
}

export interface IdeExecuteResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
  command: string;
  args: string[];
  cwd: string;
  ledgerEntryId: string;
}

// ── History ────────────────────────────────────────────────────
export interface IdeRunSummary {
  id: string;            // ledger entry id
  command: string;
  exitCode: number | null;
  startedAt: string;     // ISO
  durationMs: number;
  source: string;
}

// ── Corrections ────────────────────────────────────────────────
export interface IdeCorrection {
  id: string;            // ledger entry id of the failed run
  command: string;
  issue: string;
  severity: 'info' | 'warning' | 'error';
  detectedAt: string;    // ISO
}

// ── Session ────────────────────────────────────────────────────
export interface IdeSession {
  blueprints: Blueprint[];
  recentRuns: IdeRunSummary[];
  corrections: IdeCorrection[];
  generatedAt: string;   // ISO
}
