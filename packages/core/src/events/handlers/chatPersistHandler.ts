import { UEB } from '../EventBus';
import { EVENTS } from '../types';
import { ChatService } from '../../chat/api/ChatService';
import { log } from '../../shared/logger';

interface ChatTurnPayload {
  prompt?: string;
  content?: string;
  correlation_id?: string;
  target_path?: string;
}

const DEFAULT_SESSION = 'default';

export function registerChatPersistHandler(chat: ChatService): void {
  UEB.on<ChatTurnPayload>(EVENTS.CHAT_USER_MESSAGE, async (event) => {
    const p = event.payload;
    if (!p || typeof p.prompt !== 'string' || p.prompt.length === 0) return;
    try {
      await chat.appendMessage(DEFAULT_SESSION, 'user', p.prompt);
      log.info('chat.persist.user', {
        correlation_id: event.correlation_id,
        length: p.prompt.length,
      });
    } catch (err) {
      log.error('chat.persist.user.error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  UEB.on<ChatTurnPayload>(EVENTS.CHAT_ASSISTANT_MESSAGE, async (event) => {
    const p = event.payload;
    if (!p || typeof p.content !== 'string' || p.content.length === 0) return;
    try {
      await chat.appendMessage(DEFAULT_SESSION, 'assistant', p.content);
      log.info('chat.persist.assistant', {
        correlation_id: event.correlation_id,
        length: p.content.length,
      });
    } catch (err) {
      log.error('chat.persist.assistant.error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  log.info('ueb.handler.registered', {
    handler: 'chatPersistHandler',
    events: [EVENTS.CHAT_USER_MESSAGE, EVENTS.CHAT_ASSISTANT_MESSAGE],
  });
}
