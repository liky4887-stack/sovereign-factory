/**
 * system-power/models/SystemPowerState.ts
 * Canonical System Power shape. Everything here is either read from
 * Node's real os/process primitives or persisted in a small state file.
 * No invented data.
 */

export interface SystemPowerHostInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  uptimeSeconds: number;
}

export interface SystemPowerProcessInfo {
  pid: number;
  cpuCount: number;
  loadAvg: [number, number, number];
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
}

export interface SystemPowerSystemInfo {
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  usedMemoryPercent: number;
}

export interface SystemPowerToggles {
  accelEnabled: boolean;
  deepSim: boolean;
}

export type SystemPowerToggleKey = keyof SystemPowerToggles;

export interface SystemPowerToggleInput {
  key: SystemPowerToggleKey;
  value: boolean;
}

export interface SystemPowerStatus {
  host: SystemPowerHostInfo;
  process: SystemPowerProcessInfo;
  system: SystemPowerSystemInfo;
  toggles: SystemPowerToggles;
  ledgerEntryCount: number;
  updatedAt: string;   // ISO
}

export const DEFAULT_TOGGLES: SystemPowerToggles = {
  accelEnabled: true,
  deepSim: false,
};
