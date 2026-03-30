/**
 * Agent 管理
 * 
 * 负责 Agent 的创建、管理和路由
 */

import { existsSync, mkdirSync } from 'node:fs';
import type { Agent, AgentConfig, Session, Config, ToolPolicy } from './types.js';
import { createSession, getSessionKey } from './session.js';
import { getAgentsDir } from './config.js';

// ============ Agent 创建 ============

/**
 * 创建 Agent 实例
 */
export function createAgent(config: AgentConfig, agentsDir: string): Agent {
  // 确保工作空间存在
  const workspace = config.workspace.startsWith('/') 
    ? config.workspace 
    : `${agentsDir}/${config.id}`;
    
  if (!existsSync(workspace)) {
    mkdirSync(workspace, { recursive: true });
  }
  
  return {
    ...config,
    workspace,
    sessions: new Map<string, Session>(),
  };
}

/**
 * 从配置创建所有 Agent
 */
export function createAgents(config: Config): Map<string, Agent> {
  const agents = new Map<string, Agent>();
  const agentsDir = getAgentsDir(config);
  
  // 确保 agents 目录存在
  if (!existsSync(agentsDir)) {
    mkdirSync(agentsDir, { recursive: true });
  }
  
  for (const agentConfig of config.agents) {
    const agent = createAgent(agentConfig, agentsDir);
    agents.set(agent.id, agent);
  }
  
  return agents;
}

// ============ Agent 路由 ============

/**
 * 解析 @ 前缀
 */
export function parseAgentPrefix(input: string): { agentId: string | null; message: string } {
  // 匹配 @agentId message 或 @agentId 格式
  const match = input.match(/^@(\w+)(?:\s+(.+))?$/s);
  if (match) {
    const [, agentId, message] = match;
    return { agentId: agentId ?? null, message: message ?? '' };
  }
  return { agentId: null, message: input };
}

/**
 * 获取 Agent
 */
export function getAgent(agents: Map<string, Agent>, agentId: string): Agent | undefined {
  return agents.get(agentId);
}

/**
 * 获取默认 Agent
 */
export function getDefaultAgent(agents: Map<string, Agent>): Agent | undefined {
  for (const agent of agents.values()) {
    if (agent.default) {
      return agent;
    }
  }
  // 如果没有 default，返回第一个
  return agents.values().next().value;
}

// ============ Agent Session 管理 ============

/**
 * 获取或创建 Agent 的主会话
 */
export function getOrCreateMainSession(agent: Agent): Session {
  const sessionKey = getSessionKey(agent.id, 'main');
  
  let session = agent.sessions.get(sessionKey);
  if (!session) {
    session = createSession(agent.id, 'main');
    agent.sessions.set(sessionKey, session);
  }
  
  return session;
}

/**
 * 获取 Agent 的所有会话
 */
export function getAgentSessions(agent: Agent): Session[] {
  return Array.from(agent.sessions.values());
}

// ============ 工具策略 ============

/**
 * 工具组定义
 */
export const TOOL_GROUPS: Record<string, string[]> = {
  'group:fs': ['read', 'write', 'edit', 'apply_patch'],
  'group:runtime': ['exec', 'process'],
  'group:web': ['web_search', 'web_fetch', 'browser'],
  'group:code': ['code_edit', 'code_analyze'],
  'group:sessions': ['sessions_list', 'sessions_history', 'sessions_send'],
  'group:memory': ['remember', 'recall', 'add_fact', 'get_facts', 'delete_fact', 'set_user_info', 'get_user_info', 'memory_stats'],
};

/**
 * 工具预设
 */
export const TOOL_PROFILES: Record<string, string[]> = {
  minimal: ['session_status'],
  coding: ['read', 'write', 'edit', 'exec', 'process', 'code_edit', 'code_analyze', 'remember', 'recall', 'add_fact', 'get_facts', 'delete_fact', 'set_user_info', 'get_user_info', 'memory_stats'],
  messaging: ['session_status'],
  full: [], // 空数组表示无限制
};

/**
 * 获取 Agent 的最终工具策略
 */
export function getAgentToolPolicy(
  agent: Agent,
  globalPolicy: ToolPolicy
): ToolPolicy {
  // Agent 策略覆盖全局策略
  const agentPolicy = agent.tools ?? {};
  
  return {
    profile: agentPolicy.profile ?? globalPolicy.profile,
    allow: [...(globalPolicy.allow ?? []), ...(agentPolicy.allow ?? [])],
    deny: [...(globalPolicy.deny ?? []), ...(agentPolicy.deny ?? [])],
    exec: {
      security: agentPolicy.exec?.security ?? globalPolicy.exec?.security ?? 'allowlist',
      ask: agentPolicy.exec?.ask ?? globalPolicy.exec?.ask ?? 'always',
      allowlist: agentPolicy.exec?.allowlist ?? globalPolicy.exec?.allowlist ?? [],
    },
  };
}

/**
 * 展开工具组
 */
export function expandToolGroup(name: string): string[] {
  if (name.startsWith('group:')) {
    return TOOL_GROUPS[name] ?? [];
  }
  return [name];
}

/**
 * 检查工具是否匹配
 */
export function matchToolPattern(toolName: string, pattern: string): boolean {
  if (pattern === '*') {
    return true;
  }
  if (pattern.startsWith('group:')) {
    const tools = TOOL_GROUPS[pattern];
    return tools?.includes(toolName) ?? false;
  }
  return toolName === pattern;
}

/**
 * 检查工具是否被允许
 * 
 * 检查优先级：
 * 1. deny - 拒绝列表（最高优先级）
 * 2. profile - 工具预设
 *    - 'full': 无限制
 *    - 其他: 只允许预设中的工具
 * 3. allow - 允许列表
 */
export function isToolAllowed(
  toolName: string,
  policy: ToolPolicy
): boolean {
  // 1. 先检查 deny (优先级最高)
  for (const pattern of policy.deny ?? []) {
    if (matchToolPattern(toolName, pattern)) {
      return false;
    }
  }
  
  // 2. 检查 profile
  if (policy.profile) {
    // 'full' profile 表示无限制，跳过检查
    if (policy.profile === 'full') {
      // 继续检查 allow 列表
    } else {
      const profileTools = TOOL_PROFILES[policy.profile];
      if (profileTools && profileTools.length > 0) {
        const inProfile = profileTools.some(t => matchToolPattern(toolName, t));
        if (!inProfile) {
          return false;
        }
      }
    }
  }
  
  // 3. 检查 allow
  const allowList = policy.allow ?? [];
  if (allowList.length === 0) {
    // 没有配置 allow，根据 profile 决定
    // 如果 profile 是 'full' 或没有 profile，默认允许
    return true;
  }
  
  return allowList.some(p => matchToolPattern(toolName, p));
}

// ============ 命令执行安全 ============

/**
 * 检查命令是否在白名单中
 */
export function isCommandAllowed(command: string, allowlist: string[]): boolean {
  // 提取命令的第一部分
  const parts = command.trim().split(/\s+/);
  if (parts.length === 0) {
    return false;
  }
  
  // 检查是否匹配白名单模式
  for (const pattern of allowlist) {
    if (matchCommandPattern(command, pattern)) {
      return true;
    }
  }
  
  return false;
}

/**
 * 匹配命令模式
 */
function matchCommandPattern(command: string, pattern: string): boolean {
  // 将 * 转换为正则
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(command.trim());
}