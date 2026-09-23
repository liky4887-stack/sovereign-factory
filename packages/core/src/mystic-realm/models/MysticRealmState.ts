/**
 * mystic-realm/models/MysticRealmState.ts
 * Canonical shapes for the Mystic Realm surface. Every value here is
 * either persisted to JSON (soul traits) or computed from the Truth
 * Ledger and domain services at request time.
 */

// ── Void Manifestation ─────────────────────────────────────────
export interface ManifestInput {
  intention: string;
}

export interface ManifestationStep {
  order: number;
  action: string;
  rationale: string;
}

export interface ManifestationResult {
  id: string;
  intention: string;
  steps: ManifestationStep[];
  ledgerEntryId: string;
  createdAt: string;   // ISO
}

// ── Singularity Forge ──────────────────────────────────────────
export type ConstructScope = 'Global' | 'Domain' | 'Module';
export type ConstructComplexity = 'Low' | 'Medium' | 'High' | 'Extreme';

export interface ForgeConstruct {
  id: string;
  name: string;
  scope: ConstructScope;
  complexity: ConstructComplexity;
  taskCount: number;
  openTaskCount: number;
  doneTaskCount: number;
  goalCount: number;
  archived: boolean;
}

export interface ForgeReport {
  constructs: ForgeConstruct[];
  totalProjects: number;
  totalTasks: number;
  generatedAt: string;
}

// ── Soul Sync ──────────────────────────────────────────────────
export interface SoulTraits {
  risk: number;    // 0-100
  speed: number;   // 0-100
  taste: number;   // 0-100
}

export interface SoulState extends SoulTraits {
  updatedAt: string;   // ISO
}

export const DEFAULT_SOUL_TRAITS: SoulTraits = {
  risk: 50,
  speed: 50,
  taste: 50,
};

// ── Zero Knowledge Vault ───────────────────────────────────────
export interface VaultSummary {
  entryCount: number;
  integrityOk: boolean;
  integrityBrokenAt?: string;
  distinctTypes: string[];
  distinctTags: string[];
  immutable: true;
  headHash: string | null;
  generatedAt: string;   // ISO
  note: string;
}
