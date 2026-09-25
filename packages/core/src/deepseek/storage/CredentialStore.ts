import { DeepSeekCredentials } from '../models/DeepSeekTypes';

export interface CredentialStore {
  get(): DeepSeekCredentials | null;
  set(input: {
    bearerToken: string;
    cookies: string;
    hifLeim?: string;
    hifDliq?: string;
    deviceId?: string;
  }): DeepSeekCredentials;
  clear(): void;
  has(): boolean;
}
