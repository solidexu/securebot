/**
 * Session 管理
 * 
 * 负责会话的创建、管理和历史记录
 */

import type { Session, Message, AgentConfig, Config } from './types.js';
import { getRootDir, getAgentsDir, getMemoryDir, getSkillsDir, getSessionsDir } from './config.js';

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
export async function buildSystemPrompt(
  agent: AgentConfig,
  config: Config,
  availableTools: string[],
  skillsPrompt?: string
): Promise<string> {
  const rootDir = getRootDir(config);
  const agentsDir = getAgentsDir(config);
  const memoryDir = getMemoryDir(config);
  const skillsDir = getSkillsDir(config);
  const sessionsDir = getSessionsDir(config);
  
  const workspaceDir = agent.workspace.startsWith('/')
    ? agent.workspace
    : `${agentsDir}/${agent.workspace}`;

  let prompt = `你是 ${agent.name}，一个 AI 助手。

## 身份信息
- **ID**: ${agent.id}
- **名称**: ${agent.name}
${agent.systemPrompt ? `- **角色**: ${agent.systemPrompt}` : ''}

## 工作空间
你的工作空间位于：\`${workspaceDir}\`
- 所有文件读写操作都在此目录或其子目录下进行
- 不要尝试访问此目录之外的文件

## 记忆系统
你拥有三层记忆架构，用于持久化存储重要信息：

### Layer 1: 工作记忆 (每日笔记)
- **路径**: \`${memoryDir}/daily/\`
- **格式**: \`YYYY-MM-DD_${agent.id}.json\`
- **用途**: 记录每日对话、任务、重要信息
- **加载**: 自动加载最近 3 天的工作记忆

### Layer 2: 结构化记忆
- **用户档案**: \`${memoryDir}/profiles/user.json\`
- **Agent 档案**: \`${memoryDir}/profiles/agent_${agent.id}.json\`
- **事件记录**: \`${memoryDir}/events/events.log\`

### Layer 3: 向量记忆 (RAG)
- 通过 RAG 系统检索历史知识
- 支持语义搜索和相似度匹配

### 记忆使用
- 用户说"记住 xxx"时，记录到工作记忆
- 重要配置、偏好自动提取到用户档案
- 可以搜索历史记忆获取上下文

## 技能系统
- **技能目录**: \`${skillsDir}/\`
- 技能是可复用的提示词模板和工具组合

## 会话持久化
- **会话目录**: \`${sessionsDir}/\`
- 会话历史自动保存，支持恢复

## 可用工具
${availableTools.length > 0 ? availableTools.map(t => `- ${t}`).join('\n') : '(无)'}

## 安全规则
- 只能访问当前工作空间内的文件
- 敏感操作需要用户确认
- 不要泄露敏感信息

`;

  // 添加技能提示
  if (skillsPrompt) {
    prompt += '\n## 技能提示\n' + skillsPrompt;
  }

  return prompt;
}