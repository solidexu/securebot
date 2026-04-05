/**
 * 消息类型定义
 */

export type MessageType = 'user' | 'agent' | 'system' | 'tool' | 'error';

export interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  type: MessageType;
}

export interface StreamState {
  messageId: string | null;
  isStreaming: boolean;
  buffer: string;
}