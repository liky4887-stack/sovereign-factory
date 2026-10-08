import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CREDS_PATH = join(homedir(), 'cookies', 'deepseek-creds.json');
let _cached = null;

export function loadCredentials() {
  if (_cached) return _cached;
  const data = JSON.parse(readFileSync(CREDS_PATH, 'utf-8'));
  for (const f of ['bearerToken', 'cookies', 'deviceId']) {
    if (!data[f]) throw new Error(`credentials missing field: ${f}`);
  }
  _cached = data;
  return data;
}

export function credsHealth() {
  const d = loadCredentials();
  return {
    credentialsConfigured: true,
    bearerLength: d.bearerToken.length,
    cookiesLength: d.cookies.length,
    hasDeviceId: Boolean(d.deviceId),
    hasHifLeim: Boolean(d.hifLeim),
    hasHifDliq: Boolean(d.hifDliq),
  };
}
