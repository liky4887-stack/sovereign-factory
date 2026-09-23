export type Actor =
  | 'orchestrator'
  | 'selfHealingLoop'
  | 'selfEvolutionEngine'
  | 'promptAdapter'
  | 'modalRouter'
  | 'simulationHub'
  | 'server'
  | 'external';

export type EventType =
  | 'SERVER_START'
  | 'SERVER_STOP'
  | 'TASK_RECEIVED'
  | 'TASK_ROUTED'
  | 'TASK_COMPLETED'
  | 'TASK_FAILED'
  | 'CONFIG_PROPOSED'
  | 'CONFIG_UPDATE'
  | 'CONFIG_ROLLBACK'
  | 'PROMPT_NORMALIZED'
  | 'MODAL_DISPATCH'
  | 'SIMULATION_PLANNED'
  | 'SELF_HEAL'
  | 'ERROR'
  | 'VERIFY_OK'
  | 'VERIFY_FAIL';

export interface LedgerEntryInput {
  actor: Actor;
  eventType: EventType;
  payload: Record<string, unknown>;
  refs?: string[];
}

export interface LedgerEntry extends LedgerEntryInput {
  id: number;
  timestamp: string;
  prevHash: string | null;
  hash: string;
}

export type Modality = 'text' | 'vision_3d';

export interface Task {
  id?: string;
  modality?: Modality;
  prompt: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedIntent {
  raw: string;
  normalized: string;
  tokens: string[];
  ambiguities: string[];
  detectedLanguage: string;
}

export interface TaskResult {
  ok: boolean;
  taskId: string;
  modality: Modality;
  output: unknown;
  ledgerEntryId: number;
  error?: string;
}

export interface EvolutionConfig {
  version: number;
  createdAt: string;
  updatedAt: string;
  promptTemplates: Record<string, string>;
  routingStrategies: string[];
  notes: string[];
}

export interface SimulationRequest {
  scene: string;
  resolution: { width: number; height: number };
  frames: number;
  physics: {
    gravity: number;
    collide: boolean;
    materials: string[];
  };
}

export interface SimulationPlan {
  accepted: boolean;
  plan: {
    engineHint: string;
    passes: string[];
    estimatedVramMb: number;
    notes: string;
  };
}
