import { ChatGptService } from './ChatGptService';
import {
  LlmEngine, LlmCallOptions, LlmResponse, LlmStreamChunk,
  LlmCredentialsRedacted, LlmHealth, ENGINE_IDS,
} from '../LlmEngine';

export class ChatGptEngineAdapter implements LlmEngine {
  readonly id = ENGINE_IDS.CHATGPT;
  readonly label = 'ChatGPT';

  constructor(private readonly svc: ChatGptService) {}

  async call(input: string | Array<{ role: string; content: string }>, options: LlmCallOptions = {}): Promise<LlmResponse> {
    return this.svc.call(input, options);
  }

  async *stream(input: string | Array<{ role: string; content: string }>, options: LlmCallOptions = {}): AsyncGenerator<LlmStreamChunk, void, unknown> {
    yield* this.svc.stream(input, options);
  }

  setCredentials(input: Record<string, unknown>): Record<string, unknown> {
    return this.svc.setCredentials(input);
  }

  clearCredentials(): void { this.svc.clearCredentials(); }
  hasCredentials(): boolean { return this.svc.hasCredentials(); }

  getCredentialsRedacted(): LlmCredentialsRedacted {
    const r = this.svc.getCredentialsRedacted();
    return {
      configured: r.configured,
      hasCookies: r.cookiesLength > 0,
      hasBearer: r.hasAccessToken,
      hasExtraHeaders: false,
      acquiredAt: r.acquiredAt,
    };
  }

  async healthCheck(): Promise<LlmHealth> {
    return (await this.svc.healthCheck()) as LlmHealth;
  }
}
