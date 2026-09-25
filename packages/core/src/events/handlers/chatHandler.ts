import { UEB } from '../EventBus';
import { EVENTS } from '../types';
import { log } from '../../shared/logger';

export interface ChatCommandPayload {
  prompt: string;
  correlation_id: string;
  target_path?: string;
}

/**
 * Listens to CHAT.COMMAND_PARSED. Logs every chat intent for now.
 * Later turns will inspect the prompt and route to other modules
 * (GODMODE, MYSTIC, WORKSPACE) via the bus.
 */
export function registerChatHandler(): void {
  UEB.on<ChatCommandPayload>(EVENTS.CHAT_COMMAND_PARSED, async (event) => {
    const p = event.payload;
    log.info('chat.command.parsed', {
      correlation_id: p.correlation_id,
      target_path: p.target_path ?? '/api/v0/chat/completion',
      prompt_preview: p.prompt.slice(0, 80),
      prompt_length: p.prompt.length,
    });
  });

  log.info('ueb.handler.registered', {
    handler: 'chatHandler',
    event: EVENTS.CHAT_COMMAND_PARSED,
  });
}
