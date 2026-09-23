import { randomUUID } from 'crypto';
import { TermuxBridgeClient } from '../clients/TermuxBridgeClient';
import { TruthLedgerClient } from '../clients/TruthLedgerClient';
import { ShellCommandHandler } from './handlers/ShellCommandHandler';
import { FileTaskHandler } from './handlers/FileTaskHandler';
import { WorkflowHandler } from './handlers/WorkflowHandler';
import {
  HealthCheckTask,
  TaskRequest,
  TaskResult,
} from './types/TaskTypes';
import { ValidationError } from '../shared/types/errors';
import { log } from '../shared/logger';

export interface OrchestratorOptions {
  bridge: TermuxBridgeClient;
  ledger: TruthLedgerClient;
  maxQueueDepth?: number;
  concurrency?: number;
}

export class Orchestrator {
  private readonly bridge: TermuxBridgeClient;
  private readonly ledger: TruthLedgerClient;
  private readonly shell: ShellCommandHandler;
  private readonly files: FileTaskHandler;
  private readonly workflow: WorkflowHandler;
  private readonly maxQueueDepth: number;
  private readonly concurrency: number;

  private queue: Array<{ task: TaskRequest; resolve: (r: TaskResult) => void; reject: (e: unknown) => void }> = [];
  private active = 0;

  constructor(opts: OrchestratorOptions) {
    this.bridge = opts.bridge;
    this.ledger = opts.ledger;
    this.shell = new ShellCommandHandler(opts.bridge, opts.ledger);
    this.files = new FileTaskHandler(opts.bridge, opts.ledger);
    this.workflow = new WorkflowHandler(opts.bridge, opts.ledger, this.shell, this.files);
    this.maxQueueDepth = opts.maxQueueDepth ?? 100;
    this.concurrency = opts.concurrency ?? 4;
  }

  async execute(task: TaskRequest): Promise<TaskResult> {
    if (this.queue.length >= this.maxQueueDepth) {
      throw new ValidationError('orchestrator queue is full');
    }
    return new Promise<TaskResult>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.pump();
    });
  }

  queueDepth(): number {
    return this.queue.length;
  }

  activeCount(): number {
    return this.active;
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) return;
      this.active += 1;
      this.runOne(next.task)
        .then((r) => next.resolve(r))
        .catch((e) => next.reject(e))
        .finally(() => {
          this.active -= 1;
          this.pump();
        });
    }
  }

  private async runOne(task: TaskRequest): Promise<TaskResult> {
    const taskId = task.id ?? randomUUID();
    const startedAt = Date.now();

    await this.ledger.append({
      type: 'TASK_RECEIVED',
      source: 'orchestrator',
      correlationId: task.correlationId,
      tags: ['task', task.type],
      payload: { taskId, taskType: task.type, metadata: task.metadata ?? {} },
    });

    try {
      switch (task.type) {
        case 'shell':
          return await this.shell.handle(task, taskId);
        case 'file_read':
          return await this.files.read(task, taskId);
        case 'file_write':
          return await this.files.write(task, taskId);
        case 'file_list':
          return await this.files.list(task, taskId);
        case 'workflow':
          return await this.workflow.handle(task, taskId);
        case 'health_check':
          return await this.runHealthCheck(task, taskId, startedAt);
        default: {
          const exhaustive: never = task;
          throw new ValidationError('unknown task type: ' + JSON.stringify(exhaustive));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const entry = await this.ledger.append({
        type: 'TASK_FAILED',
        source: 'orchestrator',
        correlationId: task.correlationId,
        tags: ['task', 'error'],
        payload: { taskId, taskType: task.type, error: message },
      });
      log.error('orchestrator.failed', { taskId, type: task.type, error: message });
      return {
        ok: false,
        taskId,
        type: task.type,
        ledgerEntryId: entry.id,
        durationMs: Date.now() - startedAt,
        output: null,
        error: message,
      };
    }
  }

  private async runHealthCheck(
    task: HealthCheckTask,
    taskId: string,
    startedAt: number,
  ): Promise<TaskResult> {
    const health = await this.bridge.health();
    const entry = await this.ledger.append({
      type: 'HEALTH_CHECK',
      source: 'orchestrator',
      correlationId: task.correlationId,
      tags: ['health'],
      payload: { taskId, health },
    });
    return {
      ok: true,
      taskId,
      type: 'health_check',
      ledgerEntryId: entry.id,
      durationMs: Date.now() - startedAt,
      output: health,
    };
  }
}
