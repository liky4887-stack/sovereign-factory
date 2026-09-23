export type TaskType = 'shell' | 'file_read' | 'file_write' | 'file_list' | 'workflow' | 'health_check';

export interface BaseTaskRequest {
  id?: string;
  type: TaskType;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export interface ShellCommandTask extends BaseTaskRequest {
  type: 'shell';
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface FileReadTask extends BaseTaskRequest {
  type: 'file_read';
  path: string;
}

export interface FileWriteTask extends BaseTaskRequest {
  type: 'file_write';
  path: string;
  content: string;
}

export interface FileListTask extends BaseTaskRequest {
  type: 'file_list';
  path: string;
}

export interface WorkflowStep {
  id: string;
  type: Exclude<TaskType, 'workflow'>;
  params: Record<string, unknown>;
}

export interface WorkflowTask extends BaseTaskRequest {
  type: 'workflow';
  steps: WorkflowStep[];
}

export interface HealthCheckTask extends BaseTaskRequest {
  type: 'health_check';
}

export type TaskRequest =
  | ShellCommandTask
  | FileReadTask
  | FileWriteTask
  | FileListTask
  | WorkflowTask
  | HealthCheckTask;

export interface StepResult {
  stepId: string;
  ok: boolean;
  output: unknown;
  error?: string;
  durationMs: number;
}

export interface TaskResult {
  ok: boolean;
  taskId: string;
  type: TaskType;
  ledgerEntryId: string;
  durationMs: number;
  output: unknown;
  error?: string;
  steps?: StepResult[];
}
