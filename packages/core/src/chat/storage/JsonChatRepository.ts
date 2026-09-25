import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ChatRepository } from './ChatRepository';
import { ChatMessage } from '../models/ChatMessage';
import { ChatSession, ChatSessionDetail } from '../models/ChatSession';

interface ChatDataFile {
  sessions: Array<Omit<ChatSession, 'messageCount'> & { messages: ChatMessage[] }>;
}

export class JsonChatRepository implements ChatRepository {
  private data: ChatDataFile = { sessions: [] };

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    try {
      await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    } catch { /* noop */ }
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as ChatDataFile;
      if (parsed && Array.isArray(parsed.sessions)) this.data = parsed;
    } catch {
      this.data = { sessions: [] };
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    await fs.promises.writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  async listSessions(): Promise<ChatSession[]> {
    return this.data.sessions
      .slice()
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .map((s) => ({
        id: s.id, title: s.title,
        createdAt: s.createdAt, updatedAt: s.updatedAt,
        messageCount: s.messages.length,
      }));
  }

  async getSession(id: string): Promise<ChatSessionDetail | null> {
    const found = this.data.sessions.find((s) => s.id === id);
    if (!found) return null;
    return {
      id: found.id, title: found.title,
      createdAt: found.createdAt, updatedAt: found.updatedAt,
      messageCount: found.messages.length,
      messages: found.messages.slice(),
    };
  }

  async createSession(id?: string, title?: string | null): Promise<ChatSession> {
    const now = new Date().toISOString();
    const sid = id ?? randomUUID();
    const existing = this.data.sessions.find((s) => s.id === sid);
    if (existing) {
      return { id: existing.id, title: existing.title, createdAt: existing.createdAt, updatedAt: existing.updatedAt, messageCount: existing.messages.length };
    }
    const session = { id: sid, title: title ?? null, createdAt: now, updatedAt: now, messages: [] as ChatMessage[] };
    this.data.sessions.push(session);
    await this.flush();
    return { id: sid, title: session.title, createdAt: now, updatedAt: now, messageCount: 0 };
  }

  async appendMessage(sessionId: string, role: ChatMessage['role'], content: string): Promise<ChatMessage> {
    let session = this.data.sessions.find((s) => s.id === sessionId);
    if (!session) {
      const created = await this.createSession(sessionId);
      session = this.data.sessions.find((s) => s.id === created.id)!;
    }
    const now = new Date().toISOString();
    const msg: ChatMessage = { id: randomUUID(), sessionId, role, content, createdAt: now };
    session.messages.push(msg);
    session.updatedAt = now;
    if (!session.title && role === 'user' && content.trim().length > 0) {
      session.title = content.trim().slice(0, 80);
    }
    await this.flush();
    return msg;
  }

  async deleteSession(id: string): Promise<void> {
    this.data.sessions = this.data.sessions.filter((s) => s.id !== id);
    await this.flush();
  }
}
