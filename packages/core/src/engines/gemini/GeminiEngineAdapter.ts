// GeminiEngineAdapter — thin delegate to GeminiService.

import { GeminiService } from './GeminiService';
import {
  LlmEngine,
  LlmCallOptions,
  LlmResponse,
  LlmStreamChunk,
  LlmCredentialsRedacted,
  LlmHealth,
  ENGINE_IDS,
} from '../LlmEngine';

export class GeminiEngineAdapter implements LlmEngine {
  readonly id = ENGINE_IDS.GEMINI;
  readonly label = 'Gemini';

  constructor(private readonly svc: GeminiService) {}

  async call(
    input: string | Array<{ role: string; content: string }>,
    options: LlmCallOptions = {},
  ): Promise<LlmResponse> {
    return this.svc.call(input, options);
  }

  async *stream(
    input: string | Array<{ role: string; content: string }>,
    options: LlmCallOptions = {},
  ): AsyncGenerator<LlmStreamChunk, void, unknown> {
    yield* this.svc.stream(input, options);
  }

  setCredentials(input: Record<string, unknown>): Record<string, unknown> {
    return this.svc.setCredentials(input);
  }

  clearCredentials(): void {
    this.svc.clearCredentials();
  }

  hasCredentials(): boolean {
    return this.svc.hasCredentials();
  }

  getCredentialsRedacted(): LlmCredentialsRedacted {
    return this.svc.getCredentialsRedacted();
  }

  async healthCheck(): Promise<LlmHealth> {
    return this.svc.healthCheck();
  }
}
