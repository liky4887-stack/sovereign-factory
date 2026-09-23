// services/chatSessions.ts
// Persistent chat-thread store. Backed by AsyncStorage.
// Distinct from services/session.ts which manages auth tokens.

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'ghost_chat_sessions';

export type MessageRole = 'ceo' | 'system' | 'agent';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  agentName?: string;
  content: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

function newId(): string {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

class ChatSessionStore {
  private sessions: ChatSession[] = [];
  private loaded = false;

  async load(): Promise<ChatSession[]> {
    if (this.loaded) return this.sessions;
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    this.sessions = raw ? (JSON.parse(raw) as ChatSession[]) : [];
    this.loaded = true;
    return this.sessions;
  }

  private async persist(): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.sessions));
  }

  async list(): Promise<ChatSession[]> {
    await this.load();
    return [...this.sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<ChatSession | null> {
    await this.load();
    return this.sessions.find((s) => s.id === id) ?? null;
  }

  async create(title = 'New session'): Promise<ChatSession> {
    await this.load();
    const now = Date.now();
    const s: ChatSession = {
      id: newId(),
      title,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    this.sessions = [s, ...this.sessions];
    await this.persist();
    return s;
  }

  async ensureCurrent(): Promise<ChatSession> {
    await this.load();
    if (this.sessions.length > 0) return this.sessions[0];
    return this.create('Current session');
  }

  async appendMessage(sessionId: string, message: ChatMessage): Promise<ChatSession | null> {
    await this.load();
    const idx = this.sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) return null;
    const updated: ChatSession = {
      ...this.sessions[idx],
      messages: [...this.sessions[idx].messages, message],
      updatedAt: message.timestamp,
    };
    // Bump to top
    this.sessions.splice(idx, 1);
    this.sessions = [updated, ...this.sessions];
    await this.persist();
    return updated;
  }

  async rename(sessionId: string, title: string): Promise<ChatSession | null> {
    await this.load();
    const idx = this.sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) return null;
    const updated: ChatSession = { ...this.sessions[idx], title, updatedAt: Date.now() };
    this.sessions[idx] = updated;
    await this.persist();
    return updated;
  }

  async remove(sessionId: string): Promise<boolean> {
    await this.load();
    const before = this.sessions.length;
    this.sessions = this.sessions.filter((s) => s.id !== sessionId);
    if (this.sessions.length === before) return false;
    await this.persist();
    return true;
  }
}

export const chatSessions = new ChatSessionStore();
