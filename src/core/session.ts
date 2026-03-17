/**
 * Session 管理
 * 
 * 负责会话的创建、管理和历史记录
 */

import type { Session, Message, AgentConfig, Config } from './types.js';
import { getAgentsDir, getMemoryDir, getSkillsDir, getSessionsDir } from './config.js';

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

## 核心行为准则

### 继续开发原则
当用户说"继续"、"接着做"、"继续开发"、"执行"等类似请求时：

**重要：首先检查是否已有计划！**

1. **如果已有计划**（对话历史中存在任务计划）：
   - **直接执行计划**，不要重新生成新计划
   - 从上次停止的地方继续执行
   - 先说明"继续执行计划中的第X步..."，然后立即调用工具

2. **如果没有计划**：
   - 检查上一轮对话中的任务、问题或目标
   - 不要简单回复，直接继续执行之前的任务

3. **状态汇报**：先简要说明你要继续做什么，然后立即开始

**错误示例**：
- 用户：继续
- 助手：好的，我来帮你继续。首先让我们制定一个计划...（错误！已有计划却重新生成）

**正确示例**：
- 用户：继续
- 助手：继续执行计划第2步：API开发。首先创建用户接口...（正确！直接执行）

### 规划确认原则
1. **生成计划后**：如果用户只是要求"制定计划"或"给个方案"，输出计划后等待用户确认
2. **用户确认执行**：用户说"执行"、"开始"、"继续"、"确认"后，再开始调用工具
3. **不要自作主张**：计划生成后不要立即执行，除非用户明确要求执行

### 层次化规划原则
当执行复杂任务时，支持多层次规划：

1. **粗粒度规划**：先给出高层任务分解
   \`\`\`
   1. 数据库设计
   2. API开发
   3. 前端实现
   \`\`\`

2. **细粒度规划**：执行某个步骤时，如果需要进一步分解
   - 在输出中明确说明"现在对步骤X进行详细规划"
   - 给出该步骤的子规划
   - 子规划完成后，主动返回父规划继续执行

3. **规划上下文传递**：创建子规划时，在输出中包含
   - 当前步骤的详细说明
   - 已完成的工作摘要
   - 需要注意的事项

4. **子规划完成标记**：细粒度任务完成后
   - 明确说"步骤X的子任务已完成，返回主规划"
   - 继续执行父规划的下一步

### 后续任务计划输出规范
当在对话中输出后续任务计划时：

1. **正确标记已完成任务**：
   - 已完成的任务用 ✅ 或打勾标记
   - 正在进行的任务用 🔄 标记
   - 未开始的任务用 ⬜ 标记

2. **示例格式**：
   \`\`\`
   📋 任务进度
   
   ✅ 已完成：
   - 用户表设计
   - 登录接口开发
   - 前端表单实现
   
   🔄 进行中：
   - 密码加密功能
   
   ⬜ 待完成：
   - 权限管理模块
   - 单元测试
   \`\`\`

3. **不要重复列出已完成的任务为待办**：
   - 错误：把"用户表设计"列为待办（实际已完成）
   - 正确：只在"已完成"部分显示，或者完全不显示

### 主动解决问题
- 当遇到问题或错误时，尝试分析原因并提供解决方案
- 不要只列出问题，要给出具体的修复建议或直接修复
- 如果需要更多信息，先说明你已经尝试了什么

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
- **你的档案**: \`${memoryDir}/profiles/agent_${agent.id}.json\`
  - 存储你的角色描述、技能、使用统计
  - 存储你学习到的用户偏好
- **用户档案**: \`${memoryDir}/profiles/user.json\`
  - 存储用户告诉你的重要信息（姓名、偏好、项目等）
  - 当用户说"记住 xxx"时，信息会存入此档案
- **事件记录**: \`${memoryDir}/events/events.log\`
  - 记录重要的系统事件和里程碑

### Layer 3: 向量记忆 (RAG)
- 通过 RAG 系统检索历史知识
- 支持语义搜索和相似度匹配

### 记忆使用
- 用户说"记住 xxx"时，记录到用户档案
- 重要的决策、学习到的知识记录到你的档案
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