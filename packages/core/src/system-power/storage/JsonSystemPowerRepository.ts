/**
 * system-power/storage/JsonSystemPowerRepository.ts
 * Single-file JSON storage for the toggle state.
 */

import * as fs from 'fs';
import * as path from 'path';
import { log } from '../../shared/logger';
import { SystemPowerToggles, DEFAULT_TOGGLES } from '../models/SystemPowerState';
import { SystemPowerRepository } from './SystemPowerRepository';

export class JsonSystemPowerRepository implements SystemPowerRepository {
  private readonly filePath: string;
  private toggles: SystemPowerToggles = { ...DEFAULT_TOGGLES };
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
          const parsed = JSON.parse(raw) as Partial<SystemPowerToggles>;
          this.toggles = {
            accelEnabled: typeof parsed.accelEnabled === 'boolean' ? parsed.accelEnabled : DEFAULT_TOGGLES.accelEnabled,
            deepSim: typeof parsed.deepSim === 'boolean' ? parsed.deepSim : DEFAULT_TOGGLES.deepSim,
          };
        }
      } catch (err) {
        log.warn('system_power.repo.parse_error', {
          path: this.filePath,
          error: err instanceof Error ? err.message : String(err),
        });
        this.toggles = { ...DEFAULT_TOGGLES };
      }
    } else {
      await fs.promises.writeFile(this.filePath, JSON.stringify(this.toggles, null, 2), { mode: 0o600 });
    }
    this.initialised = true;
    log.info('system_power.repo.ready', { path: this.filePath, toggles: this.toggles });
  }

  private ensureInit(): void {
    if (!this.initialised) throw new Error('SystemPowerRepository not initialised');
  }

  async getToggles(): Promise<SystemPowerToggles> {
    this.ensureInit();
    return { ...this.toggles };
  }

  async setToggle(key: keyof SystemPowerToggles, value: boolean): Promise<SystemPowerToggles> {
    this.ensureInit();
    this.toggles = { ...this.toggles, [key]: value };
    await fs.promises.writeFile(this.filePath, JSON.stringify(this.toggles, null, 2), { mode: 0o600 });
    return { ...this.toggles };
  }

  async close(): Promise<void> {
    this.initialised = false;
  }
}
