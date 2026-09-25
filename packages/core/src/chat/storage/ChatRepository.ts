import { ChatMessage } from '../models/ChatMessage';
import { ChatSession, ChatSessionDetail } from '../models/ChatSession';

export interface ChatRepository {
  init(): Promise<void>;
  listSessions(): Promise<ChatSession[]>;
  getSession(id: string): Promise<ChatSessionDetail | null>;
  createSession(id?: string, title?: string | null): Promise<ChatSession>;
  appendMessage(sessionId: string, role: ChatMessage['role'], content: string): Promise<ChatMessage>;
  deleteSession(id: string): Promise<void>;
}
