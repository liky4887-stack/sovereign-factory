import { TermuxBridgeClient } from '../../clients/TermuxBridgeClient';
import { TruthLedgerClient } from '../../clients/TruthLedgerClient';
import {
  FileListTask,
  FileReadTask,
  FileWriteTask,
  TaskResult,
} from '../types/TaskTypes';
import { log } from '../../shared/logger';

export class FileTaskHandler {
  constructor(
    private readonly bridge: TermuxBridgeClient,
    private readonly ledger: TruthLedgerClient,
  ) {}

  async read(task: FileReadTask, taskId: string): Promise<TaskResult> {
    const startedAt = Date.now();
    try {
      const result = await this.bridge.fileRead(task.path);
      const entry = await this.ledger.append({
        type: 'FILE_READ',
        source: 'orchestrator.file',
        correlationId: task.correlationId,
        tags: ['file', 'read'],
        payload: { taskId, path: result.path, size: result.size },
      });
      return {
        ok: true,
        taskId,
        type: 'file_read',
        ledgerEntryId: entry.id,
        durationMs: Date.now() - startedAt,
        output: result,
      };
    } catch (err) {
      return this.failure(taskId, task.type, task.correlationId, err, startedAt);
    }
  }

  async write(task: FileWriteTask, taskId: string): Promise<TaskResult> {
    const startedAt = Date.now();
    try {
      const result = await this.bridge.fileWrite(task.path, task.content);
      const entry = await this.ledger.append({
        type: 'FILE_WRITTEN',
        source: 'orchestrator.file',
        correlationId: task.correlationId,
        tags: ['file', 'write'],
        payload: { taskId, path: result.path, bytesWritten: result.bytesWritten },
      });
      return {
        ok: true,
        taskId,
        type: 'file_write',
        ledgerEntryId: entry.id,
        durationMs: Date.now() - startedAt,
        output: result,
      };
    } catch (err) {
      return this.failure(taskId, task.type, task.correlationId, err, startedAt);
    }
  }

  async list(task: FileListTask, taskId: string): Promise<TaskResult> {
    const startedAt = Date.now();
    try {
      const result = await this.bridge.fileList(task.path);
      const entry = await this.ledger.append({
        type: 'FILE_READ',
        source: 'orchestrator.file',
        correlationId: task.correlationId,
        tags: ['file', 'list'],
        payload: { taskId, path: result.path, count: result.entries.length },
      });
      return {
        ok: true,
        taskId,
        type: 'file_list',
        ledgerEntryId: entry.id,
        durationMs: Date.now() - startedAt,
        output: result,
      };
    } catch (err) {
      return this.failure(taskId, task.type, task.correlationId, err, startedAt);
    }
  }

  private async failure(
    taskId: string,
    type: FileReadTask['type'] | FileWriteTask['type'] | FileListTask['type'],
    correlationId: string | undefined,
    err: unknown,
    startedAt: number,
  ): Promise<TaskResult> {
    const message = err instanceof Error ? err.message : String(err);
    const entry = await this.ledger.append({
      type: 'TASK_FAILED',
      source: 'orchestrator.file',
      correlationId,
      tags: ['file', 'error'],
      payload: { taskId, type, error: message },
    });
    log.error('handler.file.err', { taskId, type, error: message });
    return {
      ok: false,
      taskId,
      type,
      ledgerEntryId: entry.id,
      durationMs: Date.now() - startedAt,
      output: null,
      error: message,
    };
  }
}
