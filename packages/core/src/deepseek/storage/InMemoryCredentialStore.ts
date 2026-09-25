import { CredentialStore } from './CredentialStore';
import { DeepSeekCredentials } from '../models/DeepSeekTypes';
import { DeepSeekAuthError } from '../models/DeepSeekErrors';

export class InMemoryCredentialStore implements CredentialStore {
  private creds: DeepSeekCredentials | null = null;

  get(): DeepSeekCredentials | null { return this.creds; }
  has(): boolean { return this.creds !== null; }

  set(input: {
    bearerToken: string;
    cookies: string;
    hifLeim?: string;
    hifDliq?: string;
    deviceId?: string;
  }): DeepSeekCredentials {
    if (!input || typeof input.bearerToken !== 'string' || input.bearerToken.trim().length === 0) {
      throw new DeepSeekAuthError(40002, 'bearerToken must be a non-empty string');
    }
    if (typeof input.cookies !== 'string' || input.cookies.trim().length === 0) {
      throw new DeepSeekAuthError(40002, 'cookies must be a non-empty string');
    }
    let token = input.bearerToken.trim();
    if (token.startsWith('Bearer ')) token = token.slice(7).trim();

    this.creds = {
      bearerToken: token,
      cookies: input.cookies.trim(),
      hifLeim: input.hifLeim ? input.hifLeim.trim() : undefined,
      hifDliq: input.hifDliq ? input.hifDliq.trim() : undefined,
      deviceId: input.deviceId ? input.deviceId.trim() : undefined,
      acquiredAt: Date.now(),
    };
    return this.creds;
  }

  clear(): void { this.creds = null; }
}
