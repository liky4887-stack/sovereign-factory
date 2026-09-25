import { UEB } from '../EventBus';
import { pendingResults } from '../PendingResults';
import { EVENTS, SovereignEvent } from '../types';
import { CommandRunner } from '../../termux-server/services/CommandRunner';
import { log } from '../../shared/logger';

interface ExecuteCommandPayload {
  cwd?: string;
  command: string;
  args?: string[];
  timeout_ms?: number;
}

interface CommandResultPayload {
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  command: string;
}

export function registerTermuxHandler(runner: CommandRunner): void {
  UEB.on<ExecuteCommandPayload>(EVENTS.TERMUX_EXECUTE_COMMAND, async (event) => {
    const payload = event.payload;
    const started = Date.now();

    log.info('termux.execute.start', {
      command: payload.command,
      cwd: payload.cwd,
      correlation_id: event.correlation_id,
    });

    let result: CommandResultPayload;
    try {
      const out = await runner.run({
        command: payload.command,
        args: payload.args ?? [],
        cwd: payload.cwd,
        timeoutMs: payload.timeout_ms ?? 30000,
      });
      result = {
        exit_code: out.exitCode ?? 0,
        stdout: out.stdout ?? '',
        stderr: out.stderr ?? '',
        duration_ms: Date.now() - started,
        command: payload.command,
      };
    } catch (err) {
      result = {
        exit_code: -1,
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - started,
        command: payload.command,
      };
    }

    const reply: SovereignEvent<CommandResultPayload> = {
      event_type: EVENTS.TERMUX_COMMAND_RESULT,
      source: 'TERMUX',
      correlation_id: event.correlation_id,
      timestamp: Date.now(),
      payload: result,
    };
    await UEB.emit(reply);
    if (event.correlation_id) {
      pendingResults.resolve(event.correlation_id, result);
    }
  });

  log.info('ueb.handler.registered', {
    handler: 'termuxHandler',
    event: EVENTS.TERMUX_EXECUTE_COMMAND,
  });
}
