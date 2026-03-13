/**
 * Session 管理
 * 
 * 负责会话的创建、管理和历史记录
 */

import type { Session, Message } from './types.js';

// ============ Session 创建 ============

/**
 * 生成会话 Key
 */
export function getSessionKey(agentId: string, mainKey: string = 'main'): string {
  return `agent:${agentId}:${mainKey}`;
}

/**
 * 创建新会话
 */
export function createSession(agentId: string, mainKey: string = 'main'): Session {
  const now = new Date();
  return {
    sessionKey: getSessionKey(agentId, mainKey),
    agentId,
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ============ 消息管理 ============

/**
 * 添加用户消息
 */
export function addUserMessage(session: Session, content: string): Message {
  const message: Message = {
    role: 'user',
    content,
  };
  session.history.push(message);
  session.updatedAt = new Date();
  return message;
}

/**
 * 添加助手消息
 */
export function addAssistantMessage(
  session: Session,
  content: string,
  toolCalls?: Message['toolCalls']
): Message {
  const message: Message = {
    role: 'assistant',
    content,
    toolCalls,
  };
  session.history.push(message);
  session.updatedAt = new Date();
  return message;
}

/**
 * 添加工具结果消息
 */
export function addToolResultMessage(
  session: Session,
  toolCallId: string,
  toolName: string,
  content: string
): Message {
  const message: Message = {
    role: 'tool',
    toolCallId,
    name: toolName,
    content,
  };
  session.history.push(message);
  session.updatedAt = new Date();
  return message;
}

/**
 * 添加系统消息
 */
export function addSystemMessage(session: Session, content: string): Message {
  const message: Message = {
    role: 'system',
    content,
  };
  // 系统消息插入到历史开头
  session.history.unshift(message);
  session.updatedAt = new Date();
  return message;
}

/**
 * 获取会话历史
 */
export function getSessionHistory(session: Session): Message[] {
  return [...session.history];
}

/**
 * 获取最近的 N 条消息
 */
export function getRecentMessages(session: Session, limit: number): Message[] {
  if (limit <= 0) {
    return [...session.history];
  }
  return session.history.slice(-limit);
}

/**
 * 清空会话历史
 */
export function clearSessionHistory(session: Session): void {
  session.history = [];
  session.updatedAt = new Date();
}

// ============ 会话格式化 ============

/**
 * 格式化会话历史为字符串
 */
export function formatSessionHistory(session: Session, limit: number = 10): string {
  const messages = getRecentMessages(session, limit);
  const lines: string[] = [];
  
  for (const msg of messages) {
    const role = {
      system: '系统',
      user: '用户',
      assistant: '助手',
      tool: '工具',
    }[msg.role];
    
    let content = msg.content;
    if (msg.role === 'tool') {
      content = `[${msg.name}] ${content}`;
    }
    
    lines.push(`[${role}] ${content}`);
  }
  
  return lines.join('\n');
}

// ============ 上下文管理 ============

/**
 * 构建系统提示
 */
export function buildSystemPrompt(
  agentName: string,
  availableTools: string[]
): string {
  return `你是 ${agentName}，一个安全可控的 AI 助手。

## 可用工具
${availableTools.length > 0 ? availableTools.map(t => `- ${t}`).join('\n') : '(无)'}

## 安全规则
- 你只能访问当前工作空间内的文件
- 禁止执行任何网络请求
- 敏感操作需要用户确认

请根据用户的需求提供帮助。`;
}