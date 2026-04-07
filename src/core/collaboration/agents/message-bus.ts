/**
 * Agent 消息总线
 * 
 * 提供 Agent 间消息传递功能
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { CollaborationConfig, DEFAULT_CONFIG } from './types.js';

/**
 * Agent 消息类型
 */
export type AgentMessageType = 'request' | 'response' | 'notification' | 'delegation' | 'query';

/**
 * Agent 消息优先级
 */
export type AgentMessagePriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Agent 消息状态
 */
export type AgentMessageStatus = 'pending' | 'delivered' | 'read' | 'processed' | 'failed';

/**
 * Agent 消息
 */
export interface AgentMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  type: AgentMessageType;
  content: string;
  taskId?: string;
  priority: AgentMessagePriority;
  status: AgentMessageStatus;
  createdAt: number;
  processedAt?: number;
  replyTo?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 消息查询选项
 */
export interface MessageQueryOptions {
  type?: AgentMessageType;
  status?: AgentMessageStatus;
  limit?: number;
}

/**
 * Agent 消息总线
 */
export class AgentMessageBus {
  private config: CollaborationConfig;
  private dataDir: string;
  private messageQueue: Map<string, AgentMessage[]> = new Map();
  private handlers: Map<string, (message: AgentMessage) => Promise<void>> = new Map();

  constructor(config: Partial<CollaborationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dataDir = join(homedir(), '.securebot', 'collaboration');
    this.ensureDataDir();
    this.loadMessages();
  }

  private ensureDataDir(): void {
    const dirs = ['messages', 'delegations', 'workspaces'];
    for (const dir of dirs) {
      const fullPath = join(this.dataDir, dir);
      if (!existsSync(fullPath)) {
        mkdirSync(fullPath, { recursive: true });
      }
    }
  }

  private loadMessages(): void {
    const messagesDir = join(this.dataDir, 'messages');
    if (!existsSync(messagesDir)) return;

    const files = readdirSync(messagesDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = readFileSync(join(messagesDir, file), 'utf-8');
        const message = JSON.parse(content) as AgentMessage;
        
        const agentQueue = this.messageQueue.get(message.toAgent) ?? [];
        if (message.status === 'pending' || message.status === 'delivered') {
          agentQueue.push(message);
          this.messageQueue.set(message.toAgent, agentQueue);
        }
      } catch {
        // 忽略错误
      }
    }
  }

  /**
   * 发送消息
   */
  async sendMessage(message: Omit<AgentMessage, 'id' | 'createdAt' | 'status'>): Promise<AgentMessage> {
    const fullMessage: AgentMessage = {
      ...message,
      id: uuidv4(),
      createdAt: Date.now(),
      status: 'pending',
    };

    const agentQueue = this.messageQueue.get(message.toAgent) ?? [];
    agentQueue.push(fullMessage);
    this.messageQueue.set(message.toAgent, agentQueue);

    await this.persistMessage(fullMessage);

    const handler = this.handlers.get(message.toAgent);
    if (handler) {
      fullMessage.status = 'delivered';
      await handler(fullMessage);
    }

    return fullMessage;
  }

  /**
   * 注册消息处理器
   */
  registerHandler(agentId: string, handler: (message: AgentMessage) => Promise<void>): void {
    this.handlers.set(agentId, handler);
    
    const queue = this.messageQueue.get(agentId) ?? [];
    for (const message of queue) {
      if (message.status === 'pending') {
        handler(message).catch(() => {
          message.status = 'failed';
        });
      }
    }
  }

  /**
   * 获取消息
   */
  getMessages(agentId: string, options?: MessageQueryOptions): AgentMessage[] {
    let messages = this.messageQueue.get(agentId) ?? [];
    
    if (options?.type) {
      messages = messages.filter(m => m.type === options.type);
    }
    if (options?.status) {
      messages = messages.filter(m => m.status === options.status);
    }
    
    messages.sort((a, b) => b.createdAt - a.createdAt);
    
    if (options?.limit) {
      messages = messages.slice(0, options.limit);
    }
    
    return messages;
  }

  /**
   * 标记消息已读
   */
  markAsRead(messageId: string): void {
    for (const [_, queue] of this.messageQueue) {
      const message = queue.find(m => m.id === messageId);
      if (message) {
        message.status = 'read';
        this.persistMessage(message);
        break;
      }
    }
  }

  /**
   * 回复消息
   */
  async reply(
    originalMessage: AgentMessage,
    content: string,
    type: AgentMessageType = 'response'
  ): Promise<AgentMessage> {
    return this.sendMessage({
      fromAgent: originalMessage.toAgent,
      toAgent: originalMessage.fromAgent,
      type,
      content,
      replyTo: originalMessage.id,
      taskId: originalMessage.taskId,
      priority: originalMessage.priority,
    });
  }

  /**
   * 持久化消息
   */
  private async persistMessage(message: AgentMessage): Promise<void> {
    const filePath = join(this.dataDir, 'messages', `${message.id}.json`);
    writeFileSync(filePath, JSON.stringify(message, null, 2), 'utf-8');
  }

  /**
   * 清理过期消息
   */
  cleanupExpired(): number {
    const now = Date.now();
    const cutoff = now - this.config.messageRetention;
    let cleaned = 0;

    for (const [agentId, queue] of this.messageQueue) {
      const filtered = queue.filter(m => m.createdAt > cutoff);
      if (filtered.length !== queue.length) {
        cleaned += queue.length - filtered.length;
        this.messageQueue.set(agentId, filtered);
      }
    }

    const messagesDir = join(this.dataDir, 'messages');
    if (existsSync(messagesDir)) {
      const files = readdirSync(messagesDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = readFileSync(join(messagesDir, file), 'utf-8');
          const message = JSON.parse(content) as AgentMessage;
          if (message.createdAt < cutoff) {
            unlinkSync(join(messagesDir, file));
          }
        } catch {
          // 忽略
        }
      }
    }

    return cleaned;
  }

  /**
   * 获取全局待处理消息数量（用于统计）
   */
  getTotalPendingCount(): number {
    let count = 0;
    for (const queue of this.messageQueue.values()) {
      count += queue.filter(m => m.status === 'pending').length;
    }
    return count;
  }
}