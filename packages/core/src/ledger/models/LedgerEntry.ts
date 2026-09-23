export type LedgerEntryType =
  | 'TASK_RECEIVED'
  | 'TASK_COMPLETED'
  | 'TASK_FAILED'
  | 'COMMAND_EXECUTED'
  | 'COMMAND_BLOCKED'
  | 'FILE_READ'
  | 'FILE_WRITTEN'
  | 'FILE_BLOCKED'
  | 'PROCESS_INSPECTED'
  | 'WORKFLOW_STARTED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_FAILED'
  | 'POLICY_DENIED'
  | 'ERROR'
  | 'HEALTH_CHECK'
  | 'SERVER_START'
  | 'SERVER_STOP'
  | 'SYSTEM_POWER_TOGGLE';

export interface LedgerEntry {
  id: string;
  createdAt: string;
  type: LedgerEntryType;
  source: string;
  correlationId?: string;
  tags: string[];
  payload: Record<string, unknown>;
  prevHash: string | null;
  hash: string;
}

export interface LedgerEntryInput {
  type: LedgerEntryType;
  source: string;
  payload: Record<string, unknown>;
  correlationId?: string;
  tags?: string[];
}

export interface LedgerQuery {
  type?: LedgerEntryType;
  source?: string;
  correlationId?: string;
  tags?: string[];
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export interface LedgerQueryResult {
  entries: LedgerEntry[];
  total: number;
  limit: number;
  offset: number;
}
