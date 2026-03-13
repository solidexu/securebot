/**
 * 安全检查工具
 * 
 * 用于验证配置和运行时安全
 */

import { existsSync, accessSync, constants } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import type { Config, AgentConfig } from '../core/types.js';

/**
 * 解析工作空间路径
 */
function resolveWorkspace(path: string): string {
  if (path.startsWith('~/')) {
    const home = process.env.HOME ?? homedir() ?? process.cwd();
    return resolve(home, path.slice(2));
  }
  return resolve(path);
}

// ============ 配置验证 ============

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 验证配置
 */
export function validateConfig(config: Config): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 验证模型配置
  if (!config.model.model) {
    errors.push('model.model 不能为空');
  }

  if (!config.model.baseUrl) {
    warnings.push('model.baseUrl 未设置，使用默认值 http://localhost:11434');
  }

  // 验证默认 Agent
  const defaultAgent = config.agents.find(a => a.default);
  if (!defaultAgent) {
    errors.push('至少需要一个 default: true 的 Agent');
  }

  // 验证 Agent ID 唯一性
  const agentIds = new Set<string>();
  for (const agent of config.agents) {
    if (agentIds.has(agent.id)) {
      errors.push(`Agent ID 重复: ${agent.id}`);
    }
    agentIds.add(agent.id);
  }

  // 验证每个 Agent
  for (const agent of config.agents) {
    const agentResult = validateAgentConfig(agent);
    errors.push(...agentResult.errors);
    warnings.push(...agentResult.warnings);
  }

  // 验证全局工具策略
  if (config.tools.deny?.includes('group:web')) {
    // 好的安全实践
  } else {
    warnings.push('建议在全局工具策略中禁用网络工具: tools.deny: ["group:web"]');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 验证 Agent 配置
 */
export function validateAgentConfig(agent: AgentConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 验证 ID
  if (!agent.id) {
    errors.push('Agent id 不能为空');
  } else if (!/^[a-z0-9_-]+$/i.test(agent.id)) {
    errors.push(`Agent id "${agent.id}" 只能包含字母、数字、下划线和连字符`);
  }

  // 验证 name
  if (!agent.name) {
    warnings.push(`Agent "${agent.id}" 缺少 name，将使用 id 作为名称`);
  }

  // 验证 workspace
  if (!agent.workspace) {
    errors.push(`Agent "${agent.id}" 缺少 workspace 配置`);
  } else {
    const workspacePath = resolveWorkspace(agent.workspace);

    // 检查 workspace 是否存在
    if (!existsSync(workspacePath)) {
      warnings.push(`Agent "${agent.id}" 的 workspace 不存在: ${workspacePath}`);
    }
  }

  // 验证工具策略
  if (agent.tools?.profile === 'full' && (!agent.tools.deny || agent.tools.deny.length === 0)) {
    warnings.push(`Agent "${agent.id}" 使用 full profile 且无 deny，可能存在安全风险`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ============ 运行时安全检查 ============

/**
 * 检查文件权限
 */
export function checkFilePermissions(path: string): {
  readable: boolean;
  writable: boolean;
  executable: boolean;
} {
  const resolved = resolveWorkspace(path);

  let readable = false;
  let writable = false;
  let executable = false;

  try {
    accessSync(resolved, constants.R_OK);
    readable = true;
  } catch {
    // 不可读
  }

  try {
    accessSync(resolved, constants.W_OK);
    writable = true;
  } catch {
    // 不可写
  }

  try {
    accessSync(resolved, constants.X_OK);
    executable = true;
  } catch {
    // 不可执行
  }

  return { readable, writable, executable };
}

/**
 * 检查路径安全
 */
export function isPathSafe(path: string, workspace: string): boolean {
  const resolvedPath = resolve(workspace, path);
  const resolvedWorkspace = resolve(workspace);

  // 检查是否在 workspace 内
  return resolvedPath.startsWith(resolvedWorkspace);
}

/**
 * 检查命令安全
 */
export function isCommandSafe(command: string, _allowlist?: string[]): {
  safe: boolean;
  reason?: string;
} {
  // 提取命令名称
  const parts = command.trim().split(/\s+/);
  const cmdName = parts[0] ?? '';

  // 检查危险命令
  const dangerousCommands = ['rm', 'rmdir', 'dd', 'mkfs', 'fdisk', 'shutdown', 'reboot', 'init'];
  if (cmdName && dangerousCommands.includes(cmdName)) {
    return { safe: false, reason: `危险命令: ${cmdName}` };
  }

  // 检查管道和重定向
  if (command.includes('|') || command.includes('>') || command.includes('<')) {
    // 允许但需要确认
  }

  // 检查后台执行
  if (command.includes('&') && !command.trim().endsWith('&')) {
    return { safe: false, reason: '后台执行可能产生不可控进程' };
  }

  return { safe: true };
}