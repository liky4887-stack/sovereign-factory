// Adapter: wraps DeepSeekService behind the LlmEngine interface.
// DeepSeekService itself is unchanged — zero risk to the working bridge.
// The adapter maps its richer return shapes to the minimal interface
// the engine registry expects.
import { DeepSeekService } from '../../deepseek/api/DeepSeekService';
import {
  LlmEngine,
  LlmCallOptions,
  LlmResponse,
  LlmStreamChunk,
  LlmCredentialsRedacted,
  LlmHealth,
  ENGINE_IDS,
} from '../LlmEngine';

export class DeepSeekEngineAdapter implements LlmEngine {
  readonly id = ENGINE_IDS.DEEPSEEK;
  readonly label = 'DeepSeek';

  constructor(private readonly svc: DeepSeekService) {}

  async call(
    input: string | Array<{ role: string; content: string }>,
    options: LlmCallOptions = {},
  ): Promise<LlmResponse> {
    const r = await this.svc.callDeepSeek(input as any, options as any);
    return {
      code: r.code,
      msg: r.msg,
      data: {
        content: (r.data as any)?.content ?? '',
        chat_session_id: (r.data as any)?.chat_session_id ?? null,
        message_id: (r.data as any)?.message_id ?? null,
      },
    };
  }

  async *stream(
    input: string | Array<{ role: string; content: string }>,
    options: LlmCallOptions = {},
  ): AsyncGenerator<LlmStreamChunk, void, unknown> {
    for await (const chunk of this.svc.streamDeepSeek(input as any, options as any)) {
      yield chunk as LlmStreamChunk;
    }
  }

  setCredentials(input: Record<string, unknown>): Record<string, unknown> {
    const stored = this.svc.setCredentials({
      bearerToken: typeof input.bearerToken === 'string' ? input.bearerToken : '',
      cookies: typeof input.cookies === 'string' ? input.cookies : '',
      hifLeim: typeof input.hifLeim === 'string' ? input.hifLeim : undefined,
      hifDliq: typeof input.hifDliq === 'string' ? input.hifDliq : undefined,
      deviceId: typeof input.deviceId === 'string' ? input.deviceId : undefined,
    });
    return stored;
  }

  clearCredentials(): void {
    this.svc.clearCredentials();
  }

  hasCredentials(): boolean {
    return this.svc.hasCredentials();
  }

  getCredentialsRedacted(): LlmCredentialsRedacted {
    const r = this.svc.getCredentialsRedacted();
    return {
      configured: r.configured,
      hasCookies: r.cookiesLength > 0,
      hasBearer: r.bearerLength > 0,
      hasExtraHeaders: r.hasHifLeim || r.hasHifDliq,
      acquiredAt: r.acquiredAt,
    };
  }

  async healthCheck(): Promise<LlmHealth> {
    const h = await this.svc.healthCheck();
    return {
      engineId: this.id,
      configured: h.credentialsConfigured,
      healthy: h.credentialsConfigured,
      ...h,
    } as LlmHealth;
  }
}
