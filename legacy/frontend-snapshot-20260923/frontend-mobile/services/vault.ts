import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const VAULT_PREFIX = 'ghost_vault_';

export const Vault = {
  async set(key: string, value: string): Promise<void> {
    const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
    await SecureStore.setItemAsync(`${VAULT_PREFIX}${key}`, JSON.stringify({ value, hash, createdAt: Date.now() }));
  },
  async get(key: string): Promise<string | null> {
    const raw = await SecureStore.getItemAsync(`${VAULT_PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw).value;
  },
  async rotate(key: string, newValue: string): Promise<void> {
    const existing = await this.get(key);
    if (!existing) throw new Error(`Key ${key} not found in vault`);
    await this.set(key, newValue);
  },
  async remove(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(`${VAULT_PREFIX}${key}`);
  },
};
