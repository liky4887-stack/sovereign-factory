import { SovereignEvent, EventHandler } from './types';
import { log } from '../shared/logger';

export class EventBus {
  private handlers = new Map<string, EventHandler<any>[]>();
  private eventLog: SovereignEvent[] = [];
  private maxLogSize = 500;

  on<T = unknown>(eventType: string, handler: EventHandler<T>): void {
    const list = this.handlers.get(eventType) ?? [];
    list.push(handler as EventHandler<any>);
    this.handlers.set(eventType, list);
  }

  off<T = unknown>(eventType: string, handler: EventHandler<T>): void {
    const list = this.handlers.get(eventType);
    if (!list) return;
    this.handlers.set(eventType, list.filter((h) => h !== handler));
  }

  async emit<T = unknown>(event: SovereignEvent<T>): Promise<void> {
    this.eventLog.push(event as SovereignEvent);
    if (this.eventLog.length > this.maxLogSize) this.eventLog.shift();

    const list = this.handlers.get(event.event_type) ?? [];
    if (list.length === 0) {
      log.warn('ueb.no_handler', { event_type: event.event_type, source: event.source });
      return;
    }
    log.info('ueb.emit', {
      event_type: event.event_type,
      source: event.source,
      correlation_id: event.correlation_id,
      handlers: list.length,
    });

    for (const handler of list) {
      try {
        await handler(event);
      } catch (err) {
        log.error('ueb.handler_error', {
          event_type: event.event_type,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  recent(limit = 50): SovereignEvent[] {
    return this.eventLog.slice(-limit);
  }

  static event<T>(
    event_type: string,
    source: string,
    payload: T,
    correlation_id?: string,
  ): SovereignEvent<T> {
    return {
      event_type,
      source,
      payload,
      correlation_id: correlation_id ?? `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
  }
}

export const UEB = new EventBus();
