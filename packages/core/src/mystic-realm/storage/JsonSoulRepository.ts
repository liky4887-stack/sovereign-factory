/**
 * mystic-realm/storage/JsonSoulRepository.ts
 * Single-file JSON storage for Soul traits. Clamps values to 0-100.
 */

import * as fs from 'fs';
import * as path from 'path';
import { log } from '../../shared/logger';
import { SoulTraits, DEFAULT_SOUL_TRAITS } from '../models/MysticRealmState';
import { SoulRepository } from './SoulRepository';

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export class JsonSoulRepository implements SoulRepository {
  private readonly filePath: string;
  private traits: SoulTraits = { ...DEFAULT_SOUL_TRAITS };
  private initialised = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    if (this.initialised) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = await fs.promises.readFile(this.filePath, 'utf8');
        if (raw.trim().length > 0) {
          const parsed = JSON.parse(raw) as Partial<SoulTraits>;
          this.traits = {
            risk:  typeof parsed.risk  === 'number' ? clamp(parsed.risk)  : DEFAULT_SOUL_TRAITS.risk,
            speed: typeof parsed.speed === 'number' ? clamp(parsed.speed) : DEFAULT_SOUL_TRAITS.speed,
            taste: typeof parsed.taste === 'number' ? clamp(parsed.taste) : DEFAULT_SOUL_TRAITS.taste,
          };
        }
      } catch (err) {
        log.warn('mystic_realm.soul_repo.parse_error', {
          path: this.filePath,
          error: err instanceof Error ? err.message : String(err),
        });
        this.traits = { ...DEFAULT_SOUL_TRAITS };
      }
    } else {
      await fs.promises.writeFile(this.filePath, JSON.stringify(this.traits, null, 2), { mode: 0o600 });
    }
    this.initialised = true;
    log.info('mystic_realm.soul_repo.ready', { path: this.filePath, traits: this.traits });
  }

  private ensureInit(): void {
    if (!this.initialised) throw new Error('SoulRepository not initialised');
  }

  async get(): Promise<SoulTraits> {
    this.ensureInit();
    return { ...this.traits };
  }

  async set(patch: Partial<SoulTraits>): Promise<SoulTraits> {
    this.ensureInit();
    this.traits = {
      risk:  patch.risk  !== undefined ? clamp(patch.risk)  : this.traits.risk,
      speed: patch.speed !== undefined ? clamp(patch.speed) : this.traits.speed,
      taste: patch.taste !== undefined ? clamp(patch.taste) : this.traits.taste,
    };
    await fs.promises.writeFile(this.filePath, JSON.stringify(this.traits, null, 2), { mode: 0o600 });
    return { ...this.traits };
  }

  async close(): Promise<void> {
    this.initialised = false;
  }
}
