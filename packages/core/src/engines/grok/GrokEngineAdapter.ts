import { GrokService } from './GrokService';
import {
  LlmEngine,
  LlmCallOptions,
  LlmResponse,
  LlmStreamChunk,
  LlmCredentialsRedacted,
  LlmHealth,
  ENGINE_IDS,
} from '../LlmEngine';

export class GrokEngineAdapter implements LlmEngine {
  readonly id = ENGINE_IDS.GROK;
  readonly label = 'Grok';

  constructor(private readonly svc: GrokService) {}

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
      configured: this.svc.hasCredentials(),
      hasCookies: (r.cookies?.length ?? 0) > 0,
      hasBearer: r.bearerToken !== null,
      hasExtraHeaders: r.csrfToken !== null || r.extraHeaders !== null,
      acquiredAt: r.acquiredAt,
    };
  }

  async healthCheck(): Promise<LlmHealth> {
    return (await this.svc.healthCheck()) as LlmHealth;
  }
}
