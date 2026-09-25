import { ChatMessage } from './ChatMessage';

export interface ChatSession {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatSessionDetail extends ChatSession {
  messages: ChatMessage[];
}
