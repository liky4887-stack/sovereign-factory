/**
 * god-mode/models/GodModeState.ts
 * Canonical God Mode data shapes. Everything here is computed from
 * real ledger events + projects + tasks. No invented values.
 */

// ── Logic Graph ────────────────────────────────────────────────
export type LogicView = 'data' | 'state' | 'error';

export interface LogicNode {
  id: string;
  label: string;
  x: number;          // 0-100
  y: number;          // 0-100
  color: 'cyan' | 'blue' | 'purple' | 'green' | 'red' | 'amber' | 'muted';
  count: number;      // real count of ledger entries this node summarizes
}

export interface LogicGraph {
  view: LogicView;
  nodes: LogicNode[];
  totalEvents: number;
}

// ── Chaos Engine ───────────────────────────────────────────────
export interface ChaosToggles {
  edgeCases: boolean;
  latencyStorm: boolean;
  dataCorruption: boolean;
}

export type ChaosToggleKey = keyof ChaosToggles;

export interface ChaosProjection {
  projectedLatencyMs: number;
  projectedErrorRate: number;   // 0-1
  projectedEdgeCaseCount: number;
  riskLevel: 'low' | 'medium' | 'high';
  notes: string[];
}

export interface ChaosRun {
  id: string;
  startedAt: string;   // ISO
  toggles: ChaosToggles;
  projection: ChaosProjection;
  ledgerEntryId: string;
}

// ── Probability Engine ─────────────────────────────────────────
export interface ProbabilityScenario {
  label: string;
  value: number;       // 0-100, rounds to whole
  color: 'green' | 'red' | 'amber';
  sampleSize: number;
}

export interface ProbabilityReport {
  scenarios: ProbabilityScenario[];
  totalSamples: number;
  windowEntries: number;   // ledger entries examined
  sufficientData: boolean;
}

// ── Omni Search ────────────────────────────────────────────────
export type SearchMode = 'Code' | 'Ledger' | 'Docs' | 'Logs' | 'All';

export interface SearchHit {
  id: string;
  type: string;
  source: string;
  createdAt: string;
  snippet: string;
  tags: string[];
}

export interface SearchResult {
  mode: SearchMode;
  query: string;
  hits: SearchHit[];
  total: number;
}

// ── Project Map ────────────────────────────────────────────────
export interface ProjectMapNode {
  id: string;
  label: string;
  archived: boolean;
  taskCount: number;
  openTaskCount: number;
  agentCount: number;
  updatedAt: string;
}

export interface ProjectMapEdge {
  from: string;
  to: string;
  reason: string;
}

export interface ProjectMap {
  nodes: ProjectMapNode[];
  edges: ProjectMapEdge[];
}

export const DEFAULT_CHAOS_TOGGLES: ChaosToggles = {
  edgeCases: false,
  latencyStorm: false,
  dataCorruption: false,
};
