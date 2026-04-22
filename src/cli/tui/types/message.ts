/**
 * 消息类型定义
 */

export type MessageType = 'user' | 'agent' | 'system' | 'tool' | 'error' | 'thinking' | 'warn';

/** 消息子类型 - 用于区分不同内容的折叠方式 */
export type MessageSubType = 'text' | 'tool-result' | 'thinking' | 'file-content';

export interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  type: MessageType;
  /** 内容子类型 */
  subType?: MessageSubType;
  /** 是否折叠（默认true） */
  collapsed?: boolean;
  /** 折叠时显示的摘要 */
  summary?: string;
  /** 元数据（工具调用信息等） */
  meta?: Record<string, unknown>;
}

export interface StreamState {
  messageId: string | null;
  isStreaming: boolean;
  buffer: string;
}