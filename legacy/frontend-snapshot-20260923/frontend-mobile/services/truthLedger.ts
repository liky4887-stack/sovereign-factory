import AsyncStorage from '@react-native-async-storage/async-storage';

const LEDGER_KEY = 'ghost_truth_ledger';

export interface LedgerEntry {
  id: string;
  type: 'decision' | 'bug' | 'pivot' | 'architectural';
  title: string;
  content: string;
  tags: string[];
  timestamp: number;
  author: string;
}

class TruthLedger {
  private entries: LedgerEntry[] = [];
  private loaded = false;

  async load(): Promise<LedgerEntry[]> {
    if (this.loaded) return this.entries;
    const raw = await AsyncStorage.getItem(LEDGER_KEY);
    this.entries = raw ? JSON.parse(raw) : this.seed();
    this.loaded = true;
    return this.entries;
  }

  async record(entry: Omit<LedgerEntry, 'id' | 'timestamp'>): Promise<LedgerEntry> {
    const full: LedgerEntry = {
      ...entry,
      id: `ledger-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    this.entries = [full, ...this.entries];
    await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(this.entries));
    return full;
  }

  async search(query: string): Promise<LedgerEntry[]> {
    await this.load();
    const q = query.toLowerCase();
    return this.entries.filter(
      (e) => e.title.toLowerCase().includes(q) ||
             e.content.toLowerCase().includes(q) ||
             e.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  async getByType(type: LedgerEntry['type']): Promise<LedgerEntry[]> {
    await this.load();
    return this.entries.filter((e) => e.type === type);
  }

  private seed(): LedgerEntry[] {
    return [
      { id: 'ledger-seed-1', type: 'architectural', title: 'Chose Expo Router over React Navigation',
        content: 'File-based routing reduces boilerplate and aligns with the thin-route architecture specified in the swarm brief.',
        tags: ['routing', 'expo', 'architecture'], timestamp: Date.now() - 86400_000, author: 'CEO' },
      { id: 'ledger-seed-2', type: 'pivot', title: 'Moved cookie storage from AsyncStorage to SecureStore',
        content: 'AsyncStorage is unencrypted. Session tokens must live in expo-secure-store to satisfy the secure vault requirement.',
        tags: ['security', 'auth', 'vault'], timestamp: Date.now() - 43200_000, author: 'Architect' },
      { id: 'ledger-seed-3', type: 'bug', title: 'WebSocket reconnect loop on Termux bridge',
        content: 'The live console would hammer reconnect when Termux went to sleep. Fixed with exponential backoff and heartbeat check.',
        tags: ['console', 'websocket', 'bug'], timestamp: Date.now() - 21600_000, author: 'Chaos Monkey' },
    ];
  }
}

export const truthLedger = new TruthLedger();
