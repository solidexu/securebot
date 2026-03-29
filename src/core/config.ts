/**
 * 配置管理
 * 
 * 负责 SecureBot 配置的加载、验证和管理
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
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
      'du *',
      'df -h',
      // 文件读取
      'cat *',
      'wc *',
      // Git 命令
      'git status',
      'git log --oneline *',
      'git log *',
      'git diff *',
      'git branch -a',
      'git branch',
      'git remote -v',
      'git show *',
      // Node.js
      'npm list --depth=0',
      'npm run *',
      'node --version',
      'npm --version',
      'npx *',
      // Python
      'python *',
      'python3 *',
      'pip *',
      'pip3 *',
      // 其他开发工具
      'go *',
      'cargo *',
      'rustc *',
      'java -version',
      'javac *',
      'make',
      'make *',
      'gcc *',
      'g++ *',
      // 系统
      'which *',
      'env',
      'uname *',
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
    sandbox: {
      enabled: true,
      type: 'docker',  // 优先使用 Docker，不可用时自动回退
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
    sandbox: {
      enabled: true,
      type: 'path-filter',  // 客服助手只需路径过滤
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
    sandbox: {
      enabled: true,
      type: 'docker',
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
    sandbox: {
      enabled: true,
      type: 'path-filter',
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
  language: 'zh-CN',
};

// ============ 路径工具 ============

/**
 * 获取 SecureBot 根目录
 * 优先级：rootDir > dataDir > 默认 ~/.securebot
 */
export function getRootDir(config?: Config): string {
  if (config?.rootDir) {
    return resolve(config.rootDir);
  }
  // 向后兼容
  if (config?.dataDir) {
    return resolve(config.dataDir);
  }
  return join(homedir(), DEFAULT_CONFIG_DIR);
}

/**
 * 获取数据目录（别名，与 getRootDir 相同）
 * @deprecated 使用 getRootDir 代替
 */
export function getDataDir(config?: Config): string {
  return getRootDir(config);
}

/**
 * 获取 agents 目录
 */
export function getAgentsDir(config?: Config): string {
  // 向后兼容：如果显式设置了 workspaceBaseDir，使用它
  if (config?.workspaceBaseDir && !config?.rootDir) {
    return resolve(config.workspaceBaseDir);
  }
  return join(getRootDir(config), 'agents');
}

/**
 * 获取 memory 目录
 */
export function getMemoryDir(config?: Config): string {
  return join(getRootDir(config), 'memory');
}

/**
 * 获取 skills 目录
 */
export function getSkillsDir(config?: Config): string {
  return join(getRootDir(config), 'skills');
}

/**
 * 获取 sessions 目录
 */
export function getSessionsDir(config?: Config): string {
  return join(getRootDir(config), 'sessions');
}

/**
 * 获取 audit 目录
 */
export function getAuditDir(config?: Config): string {
  return join(getRootDir(config), 'audit');
}

/**
 * 获取配置文件目录
 */
export function getConfigDir(config?: Config): string {
  // 优先使用环境变量
  const envDir = process.env['SECUREBOT_CONFIG_DIR'];
  if (envDir) {
    return resolve(envDir);
  }
  // 使用配置的 rootDir
  return getRootDir(config);
}

/**
 * 获取 Agent 工作空间路径
 */
export function getAgentWorkspace(agentId: string, config?: Config): string {
  return join(getAgentsDir(config), agentId);
}

// ============ 配置加载 ============

/**
 * 获取配置文件路径
 * @param config - 可选配置对象，如果设置了 rootDir 则使用它
 */
export function getConfigPath(config?: Config): string {
  const envPath = process.env['SECUREBOT_CONFIG_PATH'];
  if (envPath) {
    return resolve(envPath);
  }
  return join(getConfigDir(config), DEFAULT_CONFIG_FILE);
}

/**
 * 加载配置
 */
/**
 * 查找配置文件路径（按优先级）
 * 1. 环境变量 SECUREBOT_CONFIG_PATH
 * 2. 环境变量 SECUREBOT_CONFIG_DIR
 * 3. 当前目录 .securebot/config.json
 * 4. 默认 ~/.securebot/config.json
 */
export function findConfigPath(): string {
  // 1. 环境变量 SECUREBOT_CONFIG_PATH
  const envPath = process.env['SECUREBOT_CONFIG_PATH'];
  if (envPath && existsSync(envPath)) {
    return resolve(envPath);
  }
  
  // 2. 环境变量 SECUREBOT_CONFIG_DIR
  const envDir = process.env['SECUREBOT_CONFIG_DIR'];
  if (envDir) {
    return join(resolve(envDir), DEFAULT_CONFIG_FILE);
  }
  
  // 3. 当前目录 config.json（直接在当前目录下）
  const directConfigPath = join(process.cwd(), DEFAULT_CONFIG_FILE);
  if (existsSync(directConfigPath)) {
    return directConfigPath;
  }
  
  // 4. 当前目录 .securebot/config.json
  const localConfigPath = join(process.cwd(), '.securebot', DEFAULT_CONFIG_FILE);
  if (existsSync(localConfigPath)) {
    return localConfigPath;
  }
  
  // 5. 默认 ~/.securebot/config.json
  return join(homedir(), DEFAULT_CONFIG_DIR, DEFAULT_CONFIG_FILE);
}

export function loadConfig(): Config {
  const configPath = findConfigPath();
  
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
  const configPath = findConfigPath();
  const configDir = dirname(configPath);
  
  // 简化逻辑：始终确保配置目录存在
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  
  // 创建带有 rootDir 的默认配置
  // rootDir 设置为配置文件所在目录
  const configWithRootDir: Config = {
    ...DEFAULT_CONFIG,
    rootDir: configDir,
  };
  
  // 写入默认配置
  writeFileSync(configPath, JSON5.stringify(configWithRootDir, null, 2), 'utf-8');
  console.log(`默认配置已创建: ${configPath}`);
  console.log(`根目录设置为: ${configDir}`);
  
  // 创建工作空间目录
  const agentsDir = join(configDir, 'agents');
  for (const agent of DEFAULT_AGENTS) {
    const workspace = join(agentsDir, agent.workspace);
    if (!existsSync(workspace)) {
      mkdirSync(workspace, { recursive: true });
    }
  }
}

/**
 * 保存配置
 */
export function saveConfig(config: Config): void {
  // 使用配置文件的实际位置（优先环境变量/当前目录/默认）
  // 这样即使 config.rootDir 设置了新值，也保存到当前配置文件位置
  const configPath = findConfigPath();
  
  // 确保配置目录存在
  const configDir = dirname(configPath);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  
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