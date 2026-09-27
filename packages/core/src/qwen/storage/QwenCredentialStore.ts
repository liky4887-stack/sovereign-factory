// Credentials for the Qwen engine. Loads from disk at construction,
// persists on every set. Never logs raw values — only counts/lengths.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { log } from '../../shared/logger';
import { QwenCredentials, QwenCredentialsFileShape } from '../models/QwenTypes';

export class QwenCredentialStore {
  private creds: QwenCredentials | null = null;

  constructor(private readonly filePath: string) {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as QwenCredentialsFileShape;
      if (!raw || typeof raw.cookies !== 'string' || raw.cookies.length === 0) return;
      this.creds = {
        cookies: raw.cookies,
        accessToken: raw.accessToken,
        refreshToken: raw.refreshToken,
        bxUa: raw.bxUa,
        bxUmidToken: raw.bxUmidToken,
        bxV: raw.bxV,
        timezone: raw.timezone,
        extraHeaders: raw.extraHeaders,
        acquiredAt: typeof raw.acquiredAt === 'number' ? raw.acquiredAt : Date.now(),
      };
      log.info('qwen.credentials.loaded_from_file', {
        path: this.filePath,
        cookiesLength: raw.cookies.length,
        hasAccessToken: !!raw.accessToken,
        hasRefreshToken: !!raw.refreshToken,
        hasBxUa: !!raw.bxUa,
      });
    } catch (e) {
      log.warn('qwen.credentials.load_failed', {
        path: this.filePath,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private persist(): void {
    if (!this.creds) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const payload: QwenCredentialsFileShape = {
        cookies: this.creds.cookies,
        accessToken: this.creds.accessToken,
        refreshToken: this.creds.refreshToken,
        bxUa: this.creds.bxUa,
        bxUmidToken: this.creds.bxUmidToken,
        bxV: this.creds.bxV,
        timezone: this.creds.timezone,
        extraHeaders: this.creds.extraHeaders,
        acquiredAt: this.creds.acquiredAt,
      };
      fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch (e) {
      log.error('qwen.credentials.persist_failed', {
        path: this.filePath,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  get(): QwenCredentials | null { return this.creds; }

  has(): boolean {
    return this.creds !== null
      && this.creds.cookies.length > 0
      && typeof this.creds.accessToken === 'string'
      && this.creds.accessToken.length > 0;
  }

  set(input: Partial<QwenCredentials> & { cookies: string; accessToken: string }): QwenCredentials {
    const next: QwenCredentials = {
      cookies: input.cookies,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      bxUa: input.bxUa,
      bxUmidToken: input.bxUmidToken,
      bxV: input.bxV,
      timezone: input.timezone,
      extraHeaders: input.extraHeaders,
      acquiredAt: Date.now(),
    };
    this.creds = next;
    this.persist();
    log.info('qwen.credentials.set', {
      cookiesLength: next.cookies.length,
      accessTokenLength: next.accessToken?.length ?? 0,
      hasRefreshToken: !!next.refreshToken,
      hasBxUa: !!next.bxUa,
    });
    return next;
  }

  clear(): void {
    this.creds = null;
    try { fs.unlinkSync(this.filePath); } catch {}
    log.info('qwen.credentials.cleared');
  }

  redacted(): {
    configured: boolean;
    cookiesLength: number;
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    hasBxUa: boolean;
    hasBxUmidToken: boolean;
    hasBxV: boolean;
    extraHeaderNames: string[];
    acquiredAt: number | null;
  } {
    if (!this.creds) {
      return {
        configured: false,
        cookiesLength: 0,
        hasAccessToken: false,
        hasRefreshToken: false,
        hasBxUa: false,
        hasBxUmidToken: false,
        hasBxV: false,
        extraHeaderNames: [],
        acquiredAt: null,
      };
    }
    return {
      configured: true,
      cookiesLength: this.creds.cookies.length,
      hasAccessToken: !!this.creds.accessToken,
      hasRefreshToken: !!this.creds.refreshToken,
      hasBxUa: !!this.creds.bxUa,
      hasBxUmidToken: !!this.creds.bxUmidToken,
      hasBxV: !!this.creds.bxV,
      extraHeaderNames: this.creds.extraHeaders ? Object.keys(this.creds.extraHeaders) : [],
      acquiredAt: this.creds.acquiredAt,
    };
  }
}
