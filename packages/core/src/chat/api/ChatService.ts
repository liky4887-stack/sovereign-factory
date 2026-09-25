import { ChatRepository } from '../storage/ChatRepository';
import { ChatMessage } from '../models/ChatMessage';
import { ChatSession, ChatSessionDetail } from '../models/ChatSession';
import { NotFoundError, ValidationError } from '../../shared/types/errors';

export class ChatService {
  constructor(private readonly repo: ChatRepository) {}

  async init(): Promise<void> {
    await this.repo.init();
  }

  async listSessions(): Promise<ChatSession[]> {
    return this.repo.listSessions();
  }

  async getSession(id: string): Promise<ChatSessionDetail> {
    if (!id || typeof id !== 'string') throw new ValidationError('sessionId is required');
    const s = await this.repo.getSession(id);
    if (!s) throw new NotFoundError('chat session not found: ' + id);
    return s;
  }

  async createSession(id?: string, title?: string | null): Promise<ChatSession> {
    return this.repo.createSession(id, title);
  }

  async appendMessage(sessionId: string, role: ChatMessage['role'], content: string): Promise<ChatMessage> {
    if (!sessionId) throw new ValidationError('sessionId is required');
    if (typeof content !== 'string') throw new ValidationError('content must be a string');
    return this.repo.appendMessage(sessionId, role, content);
  }

  async deleteSession(id: string): Promise<void> {
    await this.repo.deleteSession(id);
  }

  async getRecentMessages(sessionId: string, limit: number = 50): Promise<ChatMessage[]> {
    const s = await this.getSession(sessionId);
    return s.messages.slice(-limit);
  }
}
