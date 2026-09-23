/**
 * system-power/storage/SystemPowerRepository.ts
 * Persists the two toggles. Reads real host/process/system data live.
 */

import { SystemPowerToggles } from '../models/SystemPowerState';

export interface SystemPowerRepository {
  init(): Promise<void>;
  getToggles(): Promise<SystemPowerToggles>;
  setToggle(key: keyof SystemPowerToggles, value: boolean): Promise<SystemPowerToggles>;
  close(): Promise<void>;
}
