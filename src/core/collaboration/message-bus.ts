/**
 * 协作消息总线
 * 
 * 管理 Agent 之间的消息传递
 */

import { v4 as uuidv4 } from 'uuid';

// ============ 类型定义 ============

export interface AgentMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  type: 'request' | 'response' | 'notification' | 'delegation' | 'query';
  content: string;
  taskId?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'pending' | 'delivered' | 'read' | 'processed' | 'failed';
  createdAt: number;
  processedAt?: number;
  replyTo?: string;
  metadata?: Record<string, unknown>;
}

export type MessageStatus = AgentMessage['status'];

// ============ AgentMessageBus 类 ============

/**
 * Agent 消息总线
 * 
 * 提供 Agent 之间的消息传递机制
 */
export class AgentMessageBus {
  private messages: Map<string, AgentMessage[]> = new Map();
  private listeners: Map<string, Set<(message: AgentMessage) => void>> = new Map();
  private processedCount: number = 0;

  /**
   * 发送消息
   */
  async sendMessage(
    message: Omit<AgentMessage, 'id' | 'createdAt' | 'status'>
  ): Promise<AgentMessage> {
    const msg: AgentMessage = {
      ...message,
      id: `msg-${Date.now()}-${uuidv4().slice(0, 8)}`,
      createdAt: Date.now(),
      status: 'pending',
    };

    // 存储消息
    const agentMessages = this.messages.get(message.toAgent) || [];
    agentMessages.push(msg);
    this.messages.set(message.toAgent, agentMessages);

    // 通知监听器
    this.notifyListeners(message.toAgent, msg);

    return msg;
  }

  /**
   * 获取 Agent 的消息
   */
  getMessages(agentId: string, options?: { type?: string; limit?: number }): AgentMessage[] {
    let messages = this.messages.get(agentId) || [];
    
    // 过滤类型
    if (options?.type) {
      messages = messages.filter(m => m.type === options.type);
    }
    
    // 限制数量
    if (options?.limit) {
      messages = messages.slice(0, options.limit);
    }
    
    return messages;
  }

  /**
   * 回复消息
   */
  async reply(originalMessageOrId: AgentMessage | string, content: string): Promise<AgentMessage> {
    // 支持传入消息对象或 ID
    let originalMessage: AgentMessage | undefined;
    if (typeof originalMessageOrId === 'string') {
      // 找到原消息
      for (const messages of this.messages.values()) {
        originalMessage = messages.find(m => m.id === originalMessageOrId);
        if (originalMessage) break;
      }
    } else {
      originalMessage = originalMessageOrId;
    }

    if (!originalMessage) {
      throw new Error(`Original message not found`);
    }

    // 创建回复
    return this.sendMessage({
      fromAgent: originalMessage.toAgent,
      toAgent: originalMessage.fromAgent,
      type: 'response',
      content,
      priority: originalMessage.priority,
      replyTo: originalMessage.id,
    });
  }

  /**
   * 注册消息处理器（subscribe 的别名）
   */
  registerHandler(agentId: string, handler: (message: AgentMessage) => void): () => void {
    return this.subscribe(agentId, handler);
  }

  /**
   * 获取未读消息
   */
  getUnreadMessages(agentId: string): AgentMessage[] {
    const messages = this.messages.get(agentId) || [];
    return messages.filter((m) => m.status === 'pending' || m.status === 'delivered');
  }

  /**
   * 标记消息已读
   */
  markAsRead(messageId: string): void {
    for (const [agentId, messages] of this.messages) {
      const msg = messages.find((m) => m.id === messageId);
      if (msg) {
        msg.status = 'read';
        msg.processedAt = Date.now();
        this.processedCount++;
        break;
      }
    }
  }

  /**
   * 标记消息已处理
   */
  markAsProcessed(messageId: string): void {
    for (const [agentId, messages] of this.messages) {
      const msg = messages.find((m) => m.id === messageId);
      if (msg) {
        msg.status = 'processed';
        msg.processedAt = Date.now();
        this.processedCount++;
        break;
      }
    }
  }

  /**
   * 订阅消息
   */
  subscribe(
    agentId: string,
    callback: (message: AgentMessage) => void
  ): () => void {
    if (!this.listeners.has(agentId)) {
      this.listeners.set(agentId, new Set());
    }
    this.listeners.get(agentId)!.add(callback);

    // 返回取消订阅函数
    return () => {
      this.listeners.get(agentId)?.delete(callback);
    };
  }

  /**
   * 清除消息
   */
  clearMessages(agentId?: string): void {
    if (agentId) {
      this.messages.delete(agentId);
    } else {
      this.messages.clear();
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalMessages: number;
    processedCount: number;
    agentsWithMessages: number;
  } {
    let total = 0;
    for (const messages of this.messages.values()) {
      total += messages.length;
    }

    return {
      totalMessages: total,
      processedCount: this.processedCount,
      agentsWithMessages: this.messages.size,
    };
  }

  /**
   * 通知监听器
   */
  private notifyListeners(agentId: string, message: AgentMessage): void {
    const listeners = this.listeners.get(agentId);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(message);
        } catch (error) {
          console.error(`Message listener error for ${agentId}:`, error);
        }
      });
    }
  }
}