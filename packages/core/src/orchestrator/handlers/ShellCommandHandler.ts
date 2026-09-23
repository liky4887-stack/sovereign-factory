import { TermuxBridgeClient } from '../../clients/TermuxBridgeClient';
import { TruthLedgerClient } from '../../clients/TruthLedgerClient';
import { ShellCommandTask, TaskResult } from '../types/TaskTypes';
import { log } from '../../shared/logger';

export class ShellCommandHandler {
  constructor(
    private readonly bridge: TermuxBridgeClient,
    private readonly ledger: TruthLedgerClient,
  ) {}

  async handle(task: ShellCommandTask, taskId: string): Promise<TaskResult> {
    const startedAt = Date.now();

    try {
      const run = await this.bridge.executeCommand({
        command: task.command,
        args: task.args,
        cwd: task.cwd,
        env: task.env,
        timeoutMs: task.timeoutMs,
      });

      const entry = await this.ledger.append({
        type: 'COMMAND_EXECUTED',
        source: 'orchestrator.shell',
        correlationId: task.correlationId,
        tags: ['shell', run.exitCode === 0 ? 'ok' : 'nonzero'],
        payload: {
          taskId,
          command: task.command,
          args: task.args ?? [],
          cwd: run.cwd,
          exitCode: run.exitCode,
          durationMs: run.durationMs,
          truncated: run.truncated,
          stdoutPreview: run.stdout.slice(0, 500),
          stderrPreview: run.stderr.slice(0, 500),
        },
      });

      log.info('handler.shell.ok', { taskId, exitCode: run.exitCode });

      return {
        ok: true,
        taskId,
        type: 'shell',
        ledgerEntryId: entry.id,
        durationMs: Date.now() - startedAt,
        output: run,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const entry = await this.ledger.append({
        type: 'TASK_FAILED',
        source: 'orchestrator.shell',
        correlationId: task.correlationId,
        tags: ['shell', 'error'],
        payload: { taskId, command: task.command, error: message },
      });
      log.error('handler.shell.err', { taskId, error: message });
      return {
        ok: false,
        taskId,
        type: 'shell',
        ledgerEntryId: entry.id,
        durationMs: Date.now() - startedAt,
        output: null,
        error: message,
      };
    }
  }
}
