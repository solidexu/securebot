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
export async function buildSystemPrompt(
  agentName: string,
  availableTools: string[],
  skillsPrompt?: string
): Promise<string> {
  let prompt = `你是 ${agentName}，一个安全可控的 AI 助手。

## 任务处理策略

### 简单任务（直接执行）
- 单步查询：查看文件、列出目录、搜索内容
- 简单问答：解释概念、回答问题
- 单文件操作：读取、修改单个文件

对于简单任务，直接回答或执行，无需规划。

### 复杂任务（先规划再执行）
涉及以下情况时，先制定任务计划：
- 多步骤操作（3步以上）
- 需要创建/修改多个文件
- 开发新功能或模块
- 涉及测试、部署等完整流程

制定计划时使用以下格式：
\`\`\`
## 📋 任务计划

- [ ] 步骤1: 分析需求/查知识库
- [ ] 步骤2: 实现核心功能
- [ ] 步骤3: 配置环境
- [ ] 步骤4: 编写测试
- [ ] 步骤5: 运行测试验证
\`\`\`

执行过程中：
- 开始执行某步骤时，标记为 \`[→]\`（进行中）
- 完成步骤后，更新为 \`[x]\`（已完成）
- 如果失败，标记为 \`[!]\` 并说明原因
- 根据实际情况可以调整计划（添加/删除步骤）

### 状态标记说明
- ⬜ \`[ ]\` 待执行
- 🔄 \`[→]\` 进行中
- ✅ \`[x]\` 已完成
- ❌ \`[!]\` 失败/阻塞
- ⏭️ \`[-]\` 跳过

## 可用工具
${availableTools.length > 0 ? availableTools.map(t => `- ${t}`).join('\n') : '(无)'}

## 安全规则
- 你只能访问当前工作空间内的文件
- 禁止执行任何网络请求
- 敏感操作需要用户确认

`;

  // 添加技能提示
  if (skillsPrompt) {
    prompt += skillsPrompt;
  }

  prompt += `\n请根据用户的需求提供帮助。复杂任务请先规划，简单任务直接执行。`;
  
  return prompt;
}