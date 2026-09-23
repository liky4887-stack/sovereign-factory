import * as SecureStore from 'expo-secure-store';
import { Vault } from './vault';

const SESSION_KEY = 'ghost_session_token';
const COOKIE_KEY = 'ghost_cookies';
const HEARTBEAT_INTERVAL = 30_000;

export interface Session {
  token: string;
  cookies: Record<string, string>;
  expiresAt: number;
  user: { id: string; name: string; role: 'ceo' | 'architect' | 'chaos_monkey' };
}

class SessionManager {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private currentSession: Session | null = null;
  private listeners: Set<(s: Session | null) => void> = new Set();

  async init(): Promise<Session | null> {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (raw) { this.currentSession = JSON.parse(raw); this.startHeartbeat(); }
    return this.currentSession;
  }

  async login(token: string, cookies: Record<string, string>): Promise<Session> {
    const session: Session = {
      token, cookies, expiresAt: Date.now() + 3600_000,
      user: { id: 'ceo-001', name: 'CEO', role: 'ceo' },
    };
    this.currentSession = session;
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    await Vault.set(COOKIE_KEY, JSON.stringify(cookies));
    this.startHeartbeat();
    this.notify();
    return session;
  }

  async logout(): Promise<void> {
    this.stopHeartbeat();
    this.currentSession = null;
    await SecureStore.deleteItemAsync(SESSION_KEY);
    await Vault.remove(COOKIE_KEY);
    this.notify();
  }

  async refreshCookies(cookies: Record<string, string>): Promise<void> {
    if (!this.currentSession) return;
    this.currentSession.cookies = { ...this.currentSession.cookies, ...cookies };
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(this.currentSession));
    await Vault.set(COOKIE_KEY, JSON.stringify(this.currentSession.cookies));
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      console.log('[Heartbeat] Session alive at', new Date().toISOString());
    }, HEARTBEAT_INTERVAL);
  }
  private stopHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }
  subscribe(fn: (s: Session | null) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  private notify() { this.listeners.forEach((fn) => fn(this.currentSession)); }
  getSession(): Session | null { return this.currentSession; }
}

export const sessionManager = new SessionManager();
