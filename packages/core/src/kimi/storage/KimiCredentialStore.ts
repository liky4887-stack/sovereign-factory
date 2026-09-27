// Credentials for the Kimi engine. Mirrors QwenCredentialStore.
// Loads from disk at construction, persists on every set.
// Never logs raw values — only counts/lengths.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { log } from '../../shared/logger';
import { KimiCredentials, KimiCredentialsFileShape } from '../models/KimiTypes';

export class KimiCredentialStore {
  private creds: KimiCredentials | null = null;

  constructor(private readonly filePath: string) {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as KimiCredentialsFileShape;
      if (!raw || typeof raw.cookies !== 'string' || raw.cookies.length === 0) return;
      this.creds = {
        cookies: raw.cookies,
        bearerToken: raw.bearerToken,
        csrfToken: raw.csrfToken,
        extraHeaders: raw.extraHeaders,
        acquiredAt: typeof raw.acquiredAt === 'number' ? raw.acquiredAt : Date.now(),
      };
      log.info('kimi.credentials.loaded_from_file', {
        path: this.filePath,
        cookiesLength: raw.cookies.length,
        hasBearer: !!raw.bearerToken,
        hasCsrf: !!raw.csrfToken,
      });
    } catch (e) {
      log.warn('kimi.credentials.load_failed', {
        path: this.filePath,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private persist(): void {
    if (!this.creds) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const payload: KimiCredentialsFileShape = {
        cookies: this.creds.cookies,
        bearerToken: this.creds.bearerToken,
        csrfToken: this.creds.csrfToken,
        extraHeaders: this.creds.extraHeaders,
        acquiredAt: this.creds.acquiredAt,
      };
      fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch (e) {
      log.error('kimi.credentials.persist_failed', {
        path: this.filePath,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  get(): KimiCredentials | null { return this.creds; }

  has(): boolean {
    return this.creds !== null && this.creds.cookies.length > 0;
  }

  set(input: Partial<KimiCredentials> & { cookies: string }): KimiCredentials {
    const next: KimiCredentials = {
      cookies: input.cookies,
      bearerToken: input.bearerToken,
      csrfToken: input.csrfToken,
      extraHeaders: input.extraHeaders,
      acquiredAt: Date.now(),
    };
    this.creds = next;
    this.persist();
    log.info('kimi.credentials.set', {
      cookiesLength: next.cookies.length,
      hasBearer: !!next.bearerToken,
      hasCsrf: !!next.csrfToken,
    });
    return next;
  }

  clear(): void {
    this.creds = null;
    try { fs.unlinkSync(this.filePath); } catch {}
    log.info('kimi.credentials.cleared');
  }

  redacted(): {
    configured: boolean;
    cookiesLength: number;
    hasBearer: boolean;
    hasCsrf: boolean;
    acquiredAt: number | null;
  } {
    if (!this.creds) {
      return { configured: false, cookiesLength: 0, hasBearer: false, hasCsrf: false, acquiredAt: null };
    }
    return {
      configured: true,
      cookiesLength: this.creds.cookies.length,
      hasBearer: !!this.creds.bearerToken,
      hasCsrf: !!this.creds.csrfToken,
      acquiredAt: this.creds.acquiredAt,
    };
  }
}
