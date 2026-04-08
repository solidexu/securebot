/**
 * 消息服务
 * 
 * 处理消息格式化、路由和存储
 */

import { v4 as uuidv4 } from 'uuid';
import { emitEvent, EventType } from '../core/event-bus.js';
import type { ConversationMessage } from './session-service.js';

// ============ 类型定义 ============

export interface MessageOptions {
  type?: 'text' | 'code' | 'markdown' | 'tool_result';
  agentId?: string;
  parentMessageId?: string;
  metadata?: Record<string, unknown>;
}

export interface FormattedMessage {
  id: string;
  content: string;
  formatted: string;
  type: string;
  timestamp: number;
}

// ============ MessageService 接口 ============

export interface MessageService {
  formatMessage(content: string, type?: string): FormattedMessage;
  createMessage(role: 'user' | 'assistant' | 'system', content: string, options?: MessageOptions): ConversationMessage;
  routeMessage(message: ConversationMessage): void;
  storeMessage(sessionId: string, message: ConversationMessage): void;
}

// ============ MessageService 实现 ============

class MessageServiceImpl implements MessageService {
  private messageStore: Map<string, ConversationMessage[]> = new Map();

  formatMessage(content: string, type: string = 'text'): FormattedMessage {
    let formatted = content;

    // 根据类型格式化
    switch (type) {
      case 'code':
        formatted = `\`\`\`\n${content}\n\`\`\``;
        break;
      case 'markdown':
        // 保持原样
        break;
      case 'tool_result':
        formatted = `**Tool Result:**\n\`\`\`\n${content}\n\`\`\``;
        break;
      default:
        // 纯文本，转义 Markdown 特殊字符
        formatted = content.replace(/([*_`\[\]])/g, '\\$1');
    }

    return {
      id: uuidv4(),
      content,
      formatted,
      type,
      timestamp: Date.now(),
    };
  }

  createMessage(
    role: 'user' | 'assistant' | 'system',
    content: string,
    options: MessageOptions = {}
  ): ConversationMessage {
    const message: ConversationMessage = {
      id: uuidv4(),
      role,
      content,
      timestamp: Date.now(),
      agentId: options.agentId,
      metadata: options.metadata,
    };

    return message;
  }

  routeMessage(message: ConversationMessage): void {
    // 发射事件让 UI 层处理
    emitEvent(EventType.UI_MESSAGE_ADD, {
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
    });

    // 如果是 Agent 消息，发射 Agent 消息事件
    if (message.agentId) {
      emitEvent(EventType.AGENT_MESSAGE, {
        agentId: message.agentId,
        message: message.content,
        timestamp: message.timestamp,
      });
    }
  }

  storeMessage(sessionId: string, message: ConversationMessage): void {
    if (!this.messageStore.has(sessionId)) {
      this.messageStore.set(sessionId, []);
    }
    this.messageStore.get(sessionId)!.push(message);
  }

  getMessages(sessionId: string): ConversationMessage[] {
    return this.messageStore.get(sessionId) || [];
  }
}

// ============ 单例 ============

let instance: MessageService | null = null;

export function getMessageService(): MessageService {
  if (!instance) {
    instance = new MessageServiceImpl();
  }
  return instance;
}