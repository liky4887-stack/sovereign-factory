import { TermuxBridgeClient } from '../../clients/TermuxBridgeClient';
import { TruthLedgerClient } from '../../clients/TruthLedgerClient';
import { ShellCommandHandler } from './ShellCommandHandler';
import { FileTaskHandler } from './FileTaskHandler';
import {
  StepResult,
  TaskResult,
  WorkflowStep,
  WorkflowTask,
} from '../types/TaskTypes';
import { log } from '../../shared/logger';

export class WorkflowHandler {
  constructor(
    private readonly bridge: TermuxBridgeClient,
    private readonly ledger: TruthLedgerClient,
    private readonly shell: ShellCommandHandler,
    private readonly files: FileTaskHandler,
  ) {}

  async handle(task: WorkflowTask, taskId: string): Promise<TaskResult> {
    const startedAt = Date.now();
    const steps: StepResult[] = [];

    await this.ledger.append({
      type: 'WORKFLOW_STARTED',
      source: 'orchestrator.workflow',
      correlationId: task.correlationId,
      tags: ['workflow', 'started'],
      payload: { taskId, stepCount: task.steps.length },
    });

    for (const step of task.steps) {
      const stepStart = Date.now();
      try {
        const output = await this.runStep(step, taskId, task.correlationId);
        steps.push({
          stepId: step.id,
          ok: true,
          output,
          durationMs: Date.now() - stepStart,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        steps.push({
          stepId: step.id,
          ok: false,
          output: null,
          error: message,
          durationMs: Date.now() - stepStart,
        });
        await this.ledger.append({
          type: 'WORKFLOW_FAILED',
          source: 'orchestrator.workflow',
          correlationId: task.correlationId,
          tags: ['workflow', 'error'],
          payload: { taskId, failedStepId: step.id, error: message },
        });
        log.error('handler.workflow.err', { taskId, stepId: step.id, error: message });
        return {
          ok: false,
          taskId,
          type: 'workflow',
          ledgerEntryId: (await this.ledger.append({
            type: 'TASK_FAILED',
            source: 'orchestrator.workflow',
            correlationId: task.correlationId,
            tags: ['workflow', 'error'],
            payload: { taskId, error: message },
          })).id,
          durationMs: Date.now() - startedAt,
          output: { steps },
          error: message,
          steps,
        };
      }
    }

    const entry = await this.ledger.append({
      type: 'WORKFLOW_COMPLETED',
      source: 'orchestrator.workflow',
      correlationId: task.correlationId,
      tags: ['workflow', 'completed'],
      payload: { taskId, stepCount: steps.length },
    });

    return {
      ok: true,
      taskId,
      type: 'workflow',
      ledgerEntryId: entry.id,
      durationMs: Date.now() - startedAt,
      output: { steps },
      steps,
    };
  }

  private async runStep(step: WorkflowStep, taskId: string, correlationId?: string): Promise<unknown> {
    switch (step.type) {
      case 'shell': {
        const r = await this.shell.handle(
          {
            type: 'shell',
            command: String(step.params.command ?? ''),
            args: Array.isArray(step.params.args) ? (step.params.args as string[]) : undefined,
            cwd: typeof step.params.cwd === 'string' ? (step.params.cwd as string) : undefined,
            correlationId,
          },
          `${taskId}:${step.id}`,
        );
        if (!r.ok) throw new Error(r.error ?? 'shell step failed');
        return r.output;
      }
      case 'file_read': {
        const r = await this.files.read(
          { type: 'file_read', path: String(step.params.path ?? ''), correlationId },
          `${taskId}:${step.id}`,
        );
        if (!r.ok) throw new Error(r.error ?? 'file_read step failed');
        return r.output;
      }
      case 'file_write': {
        const r = await this.files.write(
          {
            type: 'file_write',
            path: String(step.params.path ?? ''),
            content: String(step.params.content ?? ''),
            correlationId,
          },
          `${taskId}:${step.id}`,
        );
        if (!r.ok) throw new Error(r.error ?? 'file_write step failed');
        return r.output;
      }
      case 'file_list': {
        const r = await this.files.list(
          { type: 'file_list', path: String(step.params.path ?? ''), correlationId },
          `${taskId}:${step.id}`,
        );
        if (!r.ok) throw new Error(r.error ?? 'file_list step failed');
        return r.output;
      }
      case 'health_check': {
        return this.bridge.health();
      }
      default:
        throw new Error('unsupported step type: ' + String(step.type));
    }
  }
}
