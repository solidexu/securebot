/**
 * Session 管理
 * 
 * 负责会话的创建、管理和历史记录
 */

import type { Session, Message, AgentConfig, Config } from './types.js';
import { getAgentsDir, getMemoryDir, getSkillsDir, getSessionsDir, getRootDir } from './config.js';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ============ 记忆上下文加载 ============

/**
 * 加载用户档案
 */
function loadUserProfile(memoryDir: string): string | null {
  const profilePath = join(memoryDir, 'profiles', 'user.json');
  if (!existsSync(profilePath)) {
    // 尝试 yaml 格式
    const yamlPath = join(memoryDir, 'profiles', 'owner.yaml');
    if (existsSync(yamlPath)) {
      const content = readFileSync(yamlPath, 'utf-8');
      return `## 用户档案\n\`\`\`yaml\n${content}\n\`\`\``;
    }
    return null;
  }
  
  try {
    const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
    const lines = ['## 用户档案'];
    if (profile.name) lines.push(`- 姓名: ${profile.name}`);
    if (profile.nickname) lines.push(`- 昵称: ${profile.nickname}`);
    if (profile.timezone) lines.push(`- 时区: ${profile.timezone}`);
    if (profile.preferences?.length) lines.push(`- 偏好: ${profile.preferences.join(', ')}`);
    if (profile.projects?.length) lines.push(`- 项目: ${profile.projects.join(', ')}`);
    if (profile.notes) lines.push(`- 备注: ${profile.notes}`);
    return lines.join('\n');
  } catch {
    return null;
  }
}

/**
 * 加载 Agent 档案
 * 
 * 包括：角色、技能列表、经验、学习到的偏好
 */
function loadAgentProfile(memoryDir: string, agentId: string): string | null {
  const profilePath = join(memoryDir, 'profiles', `agent_${agentId}.json`);
  if (!existsSync(profilePath)) return null;
  
  try {
    const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
    const lines = ['## 你的档案'];
    if (profile.role) lines.push(`- 角色: ${profile.role}`);
    if (profile.skills?.length) {
      lines.push(`- 已掌握技能: ${profile.skills.join(', ')}`);
    }
    if (profile.experience) lines.push(`- 经验: ${profile.experience}`);
    if (profile.learnedPreferences?.length) {
      lines.push(`- 学习到的偏好: ${profile.learnedPreferences.join(', ')}`);
    }
    if (profile.usageStats) {
      lines.push(`- 任务统计: 完成 ${profile.usageStats.tasksCompleted || 0} 个任务，成功率 ${Math.round((profile.usageStats.successRate || 0) * 100)}%`);
    }
    return lines.join('\n');
  } catch {
    return null;
  }
}

/**
 * 加载最近每日笔记
 */
function loadRecentDailyNotes(memoryDir: string, days: number = 3): string | null {
  const dailyDir = join(memoryDir, 'daily');
  if (!existsSync(dailyDir)) return null;
  
  const files = readdirSync(dailyDir)
    .filter(f => f.endsWith('.md') || f.endsWith('.json'))
    .map(f => ({
      name: f,
      path: join(dailyDir, f),
      mtime: statSync(join(dailyDir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, days);
  
  if (files.length === 0) return null;
  
  const contents: string[] = ['## 最近工作记录'];
  
  for (const file of files) {
    try {
      const content = readFileSync(file.path, 'utf-8');
      const date = file.name.replace(/\.(md|json)$/, '');
      // 限制每个文件最多 2000 字符
      const truncated = content.length > 2000 ? content.slice(0, 2000) + '\n...(已截断)' : content;
      contents.push(`\n### ${date}\n${truncated}`);
    } catch {
      // 忽略读取错误
    }
  }
  
  return contents.join('\n');
}

/**
 * 加载记忆上下文
 * 
 * P0优化：实际读取用户档案、Agent档案、每日笔记
 */
function loadMemoryContext(memoryDir: string, agentId: string): string {
  const sections: string[] = [];
  
  // 1. 用户档案
  const userProfile = loadUserProfile(memoryDir);
  if (userProfile) sections.push(userProfile);
  
  // 2. Agent 档案
  const agentProfile = loadAgentProfile(memoryDir, agentId);
  if (agentProfile) sections.push(agentProfile);
  
  // 3. 每日笔记
  const dailyNotes = loadRecentDailyNotes(memoryDir, 3);
  if (dailyNotes) sections.push(dailyNotes);
  
  return sections.length > 0 ? '\n\n' + sections.join('\n\n') : '';
}

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
  session.plan = undefined;
  session.planStack = undefined;
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
  skillsPrompt?: string,
  sandboxInfo?: { type: 'docker' | 'path-filter' | 'none'; running: boolean }
): Promise<string> {
  const agentsDir = getAgentsDir(config);
  const memoryDir = getMemoryDir(config);
  const skillsDir = getSkillsDir(config);
  const sessionsDir = getSessionsDir(config);
  
  // 检查是否使用 Docker 沙箱
  // ★ 优先使用传入的 sandboxInfo，否则自己检测
  let usingDockerSandbox = false;
  let workspaceDir = agent.workspace.startsWith('/')
    ? agent.workspace
    : `${agentsDir}/${agent.workspace}`;
  let actualWorkspace = workspaceDir; // 实际外部路径
  
  // ★ 使用传入的沙箱状态
  if (sandboxInfo?.type === 'docker' && sandboxInfo?.running) {
    usingDockerSandbox = true;
    workspaceDir = '/workspace'; // 容器内路径
  } else if (agent.sandbox?.enabled && agent.sandbox?.type === 'docker') {
    // 回退：自己检测 Docker 可用性（用于直接调用 buildSystemPrompt 的场景）
    try {
      const { DockerSandbox } = await import('./sandbox/index.js');
      const dockerAvailable = await DockerSandbox.isDockerAvailable();
      if (dockerAvailable) {
        usingDockerSandbox = true;
        workspaceDir = '/workspace'; // 容器内路径
      }
    } catch {
      // Docker 不可用，使用路径过滤
    }
  }

  let prompt = `你是 ${agent.name}，一个 AI 助手。

## 身份信息
- **ID**: ${agent.id}
- **名称**: ${agent.name}
${agent.systemPrompt ? `- **角色**: ${agent.systemPrompt}` : ''}

${usingDockerSandbox ? `## ⚠️⚠️⚠️ 关键环境信息 - 必须遵守 ⚠️⚠️⚠️

### 你正在 Docker 容器内运行！

**这是最重要的规则，所有操作都必须遵守：**

1. **所有路径必须是 \`/workspace\` 开头**
   - 文件操作：\`/workspace/file.py\`
   - 目录操作：\`/workspace/project/\`
   - 命令执行：\`cd /workspace && ...\`

2. **绝对禁止使用的路径：**
   - ❌ \`/disk0/...\` - 外部路径
   - ❌ \`/home/...\` - 外部路径
   - ❌ 任何不以 \`/workspace\` 开头的绝对路径

3. **正确示例：**
   - ✅ \`mkdir -p /workspace/project\`
   - ✅ \`ls /workspace\`
   - ✅ \`write /workspace/file.py\`
   - ✅ \`read /workspace/file.py\`

4. **错误示例（会导致操作失败）：**
   - ❌ \`mkdir /disk0/repo/.../project\`
   - ❌ \`cd /disk0/...\`

**记住：你的工作目录是 \`/workspace\`，不是任何其他路径！**

` : ''}## 核心行为准则

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

### 规划确认原则（重要！必须遵守！）

**核心规则：输出计划后必须等待用户确认，不能立即执行！**

1. **生成计划后必须停止**：
   - 输出计划后，立即停止，等待用户确认
   - 不要输出计划后立即调用工具
   - 在计划末尾明确说："等待您的确认后再开始执行"

2. **用户确认后才执行**：
   - 只有用户明确说"执行"、"开始"、"继续"、"确认"、"好的"后，才能开始调用工具
   - 用户沉默 = 不执行

3. **绝对禁止的行为**：
   ❌ 输出计划后立即执行工具
   ❌ 输出计划后说"现在开始执行..."
   ❌ 没等用户回复就调用 mkdir, write 等工具

**正确示例**：
\`\`\`
用户：帮我实现一个计算器
助手：好的，我来制定计划：

## 任务计划
1. 创建项目目录
2. 实现核心计算逻辑
3. 添加测试

等待您的确认后再开始执行。
\`\`\`

**错误示例**：
\`\`\`
用户：帮我实现一个计算器
助手：好的，我来制定计划：
## 任务计划
1. 创建项目目录...
[立即调用 mkdir] ← 错误！必须等待确认
\`\`\`

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

**关键规则：每个任务只用一个状态符号，不要组合使用！**

1. **状态符号说明**：
   - ✅ 已完成任务（前面只显示✅，不要加其他符号）
   - 🔄 进行中任务
   - ⬜ 待办任务（前面只显示⬜，不要在后面加✓）

2. **正确示例**：
   \`\`\`
   📋 任务进度
   
   ✅ 用户表设计
   ✅ 登录接口开发
   🔄 密码加密功能
   ⬜ 权限管理模块
   ⬜ 单元测试
   \`\`\`

3. **错误示例**（绝对不要这样输出）：
   \`\`\`
   ❌ ⬜ 用户表设计 ✓    （错误！矛盾：既显示待办又显示完成）
   ❌ ⬜ 登录接口 ✓      （错误！完成的任务应该用✅而不是⬜+✓）
   ❌ - 用户表设计 ✓    （错误！没有明确的状态符号）
   \`\`\`

4. **分组输出方式**（推荐）：
   \`\`\`
   📋 任务进度
   
   ✅ 已完成：
   - 用户表设计
   - 登录接口开发
   
   🔄 进行中：
   - 密码加密功能
   
   ⬜ 待完成：
   - 权限管理模块
   \`\`\`

**记住：每个任务行最前面只有一个状态emoji，不要叠加！**

### 步骤完成验证（重要！）

**绝对不要在工具调用失败时说"完成"或"成功"！**

1. **正确判断步骤完成**：
   - 工具调用返回退出码 0
   - 工具调用输出验证成功
   - 文件实际创建成功

2. **错误示例**：
   \`\`\`
   执行命令: mkdir -p calculator/{core,utils,tests}
   结果: 创建了错误的目录 {core,utils,tests}
   ✓ 成功  ← 错误！实际失败了，不应该说成功
   \`\`\`

3. **正确做法**：
   \`\`\`
   执行命令: mkdir -p calculator/{core,utils,tests}
   结果: 创建了错误的目录
   ✗ 失败：目录创建有问题，让我修复...
   \`\`\`

**记住：只有真正成功才能说成功！**

### 步骤完成声明（重要！）

**完成一个步骤后，必须明确声明完成！**

**✅ 正确格式**：
\`\`\`
[调用工具完成任务]
✓ 工具执行成功

已完成：创建项目目录结构

接下来继续下一步...
\`\`\`

**❌ 错误格式**：
\`\`\`
[调用工具]
✓ 成功

[直接继续下一步，没有声明完成]
❌ 错误！系统不会推进步骤
\`\`\`

**关键规则**：
1. 完成步骤后说 **"已完成：[步骤描述]"**（不要说步骤编号）
2. 步骤描述必须和计划中的描述一致
3. 例如：计划说"创建项目目录结构"，你就说"已完成：创建项目目录结构"

### 主动解决问题
- 当遇到问题或错误时，尝试分析原因并提供解决方案
- 不要只列出问题，要给出具体的修复建议或直接修复
- 如果需要更多信息，先说明你已经尝试了什么

## 工作空间
你的工作空间位于：\`${workspaceDir}\`
- 所有文件读写操作都在此目录或其子目录下进行
- 不要尝试访问此目录之外的文件
${loadMemoryContext(memoryDir, agent.id)}
## 记忆系统
你拥有三层记忆架构：
- **Layer 1**: 每日笔记（已自动加载最近3天）
- **Layer 2**: 结构化档案（用户档案、你的档案、事件记录）
- **Layer 3**: RAG 知识库（按需检索）

用户说"记住 xxx"时，信息会存入档案。

${agent.rag?.enabled ? `## 知识库使用

你有知识库可用，已索引相关文档。**请在以下情况自动使用 rag_search 工具：**

1. 用户询问技术问题时（如"如何实现..."、"怎么解决..."）
2. 需要参考之前学习到的知识时
3. 处理类似任务时，先检索相关经验

**使用方法：**
- 调用 \`rag_search\` 工具，传入查询关键词
- 示例：\`rag_search(query="动态规划算法")\`
- 返回的知识内容可以作为参考来回答问题或完成任务

知识库目录：\`${usingDockerSandbox ? '/workspace/knowledge' : `${getRootDir(config)}/knowledge/${agent.id}`}\`

` : ''}## 会话持久化
会话历史自动保存，支持恢复。

## 可用工具
${availableTools.length > 0 ? availableTools.map(t => `- ${t}`).join('\n') : '(无)'}

## 安全规则
- 只能访问当前工作空间内的文件
- 敏感操作需要用户确认
- 不要泄露敏感信息

`;

  // 添加技能提示
  if (skillsPrompt) {
    prompt += '\n' + skillsPrompt;
  }

  return prompt;
}