import { spawn } from 'child_process';
import * as path from 'path';
import { config } from '../../config';
import { PolicyError, TimeoutError, ValidationError } from '../../shared/types/errors';
import { log } from '../../shared/logger';

export interface RunOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface RunResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
  command: string;
  args: string[];
  cwd: string;
}

function isAllowedCommand(cmd: string): boolean {
  const base = path.basename(cmd);
  return config.ALLOWED_COMMANDS.includes(base);
}

export class CommandRunner {
  async run(opts: RunOptions): Promise<RunResult> {
    const cmd = opts.command;
    const args = opts.args ?? [];

    if (!cmd || typeof cmd !== 'string') {
      throw new ValidationError('command must be a non-empty string');
    }
    if (cmd.includes(';') || cmd.includes('|') || cmd.includes('&') || cmd.includes('$(') || cmd.includes('`')) {
      throw new PolicyError('shell metacharacters are not allowed; pass args as an array', { command: cmd });
    }
    if (!isAllowedCommand(cmd)) {
      throw new PolicyError('command not in allowlist', {
        command: cmd,
        allowed: config.ALLOWED_COMMANDS,
      });
    }

    const cwd = opts.cwd ?? process.cwd();
    const timeoutMs = opts.timeoutMs ?? config.COMMAND_TIMEOUT_MS;
    const maxBytes = config.COMMAND_MAX_OUTPUT_BYTES;
    const startedAt = Date.now();

    return new Promise<RunResult>((resolve, reject) => {
      let child;
      try {
        child = spawn(cmd, args, {
          cwd,
          env: { ...process.env, ...(opts.env ?? {}) },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        reject(new PolicyError('spawn failed: ' + (err instanceof Error ? err.message : String(err))));
        return;
      }

      let stdout = '';
      let stderr = '';
      let truncated = false;
      let killed = false;

      const timer = setTimeout(() => {
        killed = true;
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        if (stdout.length + chunk.length > maxBytes) {
          truncated = true;
          const room = Math.max(0, maxBytes - stdout.length);
          stdout += chunk.slice(0, room).toString('utf8');
          try { child.kill('SIGKILL'); } catch { /* ignore */ }
        } else {
          stdout += chunk.toString('utf8');
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length + chunk.length > maxBytes) {
          const room = Math.max(0, maxBytes - stderr.length);
          stderr += chunk.slice(0, room).toString('utf8');
        } else {
          stderr += chunk.toString('utf8');
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        log.error('command.runner.error', { command: cmd, error: err.message });
        reject(new PolicyError('process error: ' + err.message));
      });

      child.on('close', (code, signal) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startedAt;

        if (killed && !truncated) {
          reject(new TimeoutError('command exceeded ' + timeoutMs + 'ms'));
          return;
        }

        const result: RunResult = {
          exitCode: code,
          signal: signal ?? null,
          stdout,
          stderr,
          durationMs,
          truncated,
          command: cmd,
          args,
          cwd,
        };

        log.info('command.runner.executed', {
          command: cmd,
          args,
          exitCode: code,
          durationMs,
          truncated,
        });

        resolve(result);
      });
    });
  }
}

export const commandRunner = new CommandRunner();
