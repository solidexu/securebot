/**
 * 会话服务
 * 
 * 管理用户与 Agent 的对话会话
 */

import { v4 as uuidv4 } from 'uuid';
import { emitEvent, EventType } from '../core/event-bus.js';
import { getAgentService } from './index.js';

// ============ 类型定义 ============

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionConfig {
  agentId: string;
  sessionId?: string;
  threadId?: string;
  systemPrompt?: string;
  maxHistory?: number;
}

export interface SessionState {
  sessionId: string;
  agentId: string;
  threadId: string;
  messages: ConversationMessage[];
  createdAt: number;
  updatedAt: number;
  status: 'active' | 'idle' | 'closed';
}

// ============ SessionService 接口 ============

export interface SessionService {
  createSession(config: SessionConfig): Promise<SessionState>;
  getSession(sessionId: string): SessionState | undefined;
  sendMessage(sessionId: string, content: string): Promise<string>;
  getHistory(sessionId: string): ConversationMessage[];
  clearSession(sessionId: string): void;
  listSessions(): SessionState[];
}

// ============ SessionService 实现 ============

class SessionServiceImpl implements SessionService {
  private sessions: Map<string, SessionState> = new Map();

  async createSession(config: SessionConfig): Promise<SessionState> {
    const sessionId = config.sessionId || uuidv4();
    const threadId = config.threadId || uuidv4();

    const session: SessionState = {
      sessionId,
      agentId: config.agentId,
      threadId,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'active',
    };

    this.sessions.set(sessionId, session);

    emitEvent(EventType.WORKFLOW_START, {
      workflowId: sessionId,
      status: 'start',
    });

    return session;
  }

  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  async sendMessage(sessionId: string, content: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // 添加用户消息
    const userMessage: ConversationMessage = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    session.messages.push(userMessage);
    session.updatedAt = Date.now();

    // 发射消息事件
    emitEvent(EventType.UI_MESSAGE_ADD, {
      id: userMessage.id,
      role: 'user',
      content,
      timestamp: userMessage.timestamp,
    });

    try {
      // 调用 Agent 服务
      const agentService = getAgentService();
      await agentService.executeMessage(content, {
        sessionId,
        threadId: session.threadId,
      });

      return userMessage.id;
    } catch (error) {
      // 发射错误事件
      emitEvent(EventType.SYSTEM_ERROR, {
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });
      throw error;
    }
  }

  getHistory(sessionId: string): ConversationMessage[] {
    const session = this.sessions.get(sessionId);
    return session?.messages || [];
  }

  clearSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages = [];
      session.updatedAt = Date.now();
    }
  }

  listSessions(): SessionState[] {
    return Array.from(this.sessions.values());
  }
}

// ============ 单例 ============

let instance: SessionService | null = null;

export function getSessionService(): SessionService {
  if (!instance) {
    instance = new SessionServiceImpl();
  }
  return instance;
}