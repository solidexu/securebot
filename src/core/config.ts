/**
 * 配置管理
 * 
 * 负责 SecureBot 配置的加载、验证和管理
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import JSON5 from 'json5';
import type { Config, AgentConfig, ToolPolicy } from './types.js';

// ============ 常量 ============

/** 默认配置目录 */
export const DEFAULT_CONFIG_DIR = '.securebot';

/** 默认配置文件名 */
export const DEFAULT_CONFIG_FILE = 'config.json';

/** 默认工作空间目录 */
export const DEFAULT_WORKSPACE_DIR = 'workspaces';

// ============ 默认配置 ============

/** 默认工具策略 */
export const DEFAULT_TOOL_POLICY: ToolPolicy = {
  profile: 'minimal',
  deny: ['group:web', 'web_search', 'web_fetch', 'browser'],
  exec: {
    security: 'allowlist',
    ask: 'always',
    allowlist: [
      // 文件浏览（安全）
      'ls',
      'ls -la',
      'ls *',
      'pwd',
      'whoami',
      'date',
      'echo *',
      'head *',
      'tail *',
      'find * -type f',
      'tree',
      // 文件读取
      'cat *',
      // Git 命令
      'git status',
      'git log --oneline *',
      'git log *',
      'git diff *',
      'git branch -a',
      'git branch',
      'git remote -v',
      // Node.js
      'npm list --depth=0',
      'npm run *',
      'node --version',
      'npm --version',
    ],
  },
};

/** 默认 Agent 配置 */
export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: 'dev',
    name: '开发助手',
    default: true,
    workspace: 'dev',  // 相对路径，将使用 workspaceBaseDir/dev
    tools: {
      profile: 'coding',
      deny: ['group:web'],
    },
  },
  {
    id: 'support',
    name: '客服助手',
    workspace: 'support',
    tools: {
      profile: 'messaging',
      deny: ['group:fs', 'group:runtime', 'group:web'],
    },
  },
  {
    id: 'admin',
    name: '管理助手',
    workspace: 'admin',
    tools: {
      profile: 'full',
      deny: ['group:web'],
    },
  },
  {
    id: 'finance',
    name: '财务助手',
    workspace: 'finance',
    tools: {
      profile: 'messaging',
      allow: ['group:fs'],
      deny: ['group:runtime', 'group:web'],
    },
  },
];

/** 默认配置 */
export const DEFAULT_CONFIG: Config = {
  model: {
    model: 'qwen3.5:35b-a3b',
    baseUrl: 'http://localhost:11434',
  },
  defaultAgent: 'dev',
  tools: DEFAULT_TOOL_POLICY,
  agents: DEFAULT_AGENTS,
  workspaceBaseDir: './agents',  // 相对于工程目录
};

// ============ 配置加载 ============

/**
 * 获取配置目录路径
 */
export function getConfigDir(): string {
  const envDir = process.env['SECUREBOT_CONFIG_DIR'];
  if (envDir) {
    return resolve(envDir);
  }
  return join(homedir(), DEFAULT_CONFIG_DIR);
}

/**
 * 获取配置文件路径
 */
export function getConfigPath(): string {
  const envPath = process.env['SECUREBOT_CONFIG_PATH'];
  if (envPath) {
    return resolve(envPath);
  }
  return join(getConfigDir(), DEFAULT_CONFIG_FILE);
}

/**
 * 加载配置
 */
export function loadConfig(): Config {
  const configPath = getConfigPath();
  
  // 如果配置文件不存在，创建默认配置
  if (!existsSync(configPath)) {
    console.log(`配置文件不存在，创建默认配置: ${configPath}`);
    createDefaultConfig();
  }
  
  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON5.parse<Config>(content);
    
    // 合并默认值
    return mergeWithDefaults(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`加载配置失败: ${message}`);
  }
}

/**
 * 创建默认配置
 */
export function createDefaultConfig(): void {
  const configDir = getConfigDir();
  const configPath = getConfigPath();
  
  // 创建配置目录
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  
  // 创建工作空间目录
  for (const agent of DEFAULT_AGENTS) {
    const workspace = resolveWorkspace(agent.workspace);
    if (!existsSync(workspace)) {
      mkdirSync(workspace, { recursive: true });
    }
  }
  
  // 写入默认配置
  writeFileSync(configPath, JSON5.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
  console.log(`默认配置已创建: ${configPath}`);
}

/**
 * 保存配置
 */
export function saveConfig(config: Config): void {
  const configPath = getConfigPath();
  writeFileSync(configPath, JSON5.stringify(config, null, 2), 'utf-8');
}

/**
 * 合并默认值
 */
function mergeWithDefaults(config: Config): Config {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    model: {
      ...DEFAULT_CONFIG.model,
      ...config.model,
    },
    tools: {
      ...DEFAULT_CONFIG.tools,
      ...config.tools,
    },
  };
}

/**
 * 解析工作空间路径
 */
export function resolveWorkspace(workspace: string): string {
  if (workspace.startsWith('~/')) {
    const home = process.env.HOME ?? homedir() ?? process.cwd();
    return join(home, workspace.slice(2));
  }
  return resolve(workspace);
}

// ============ 配置验证 ============

/**
 * 验证配置
 */
export function validateConfig(config: Config): string[] {
  const errors: string[] = [];
  
  // 验证模型配置
  if (!config.model.model) {
    errors.push('model.model 不能为空');
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
    
    // 验证 workspace
    if (!agent.workspace) {
      errors.push(`Agent ${agent.id} 缺少 workspace 配置`);
    }
  }
  
  return errors;
}