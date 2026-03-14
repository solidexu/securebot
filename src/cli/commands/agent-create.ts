/**
 * 交互式创建 Agent
 * 
 * 通过问答方式创建新 Agent，降低配置难度
 */

import * as p from '@clack/prompts';
import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import JSON5 from 'json5';
import type { Config, AgentConfig, ToolPolicy } from '../../core/types.js';

// ============ 常量 ============

const CONFIG_DIR = join(homedir(), '.securebot');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

// ============ 工具预设 ============

const TOOL_PROFILES: Record<string, { name: string; description: string; profile: ToolPolicy['profile'] }> = {
  minimal: {
    name: '最小权限',
    description: '仅基础对话，无文件/命令访问权限',
    profile: 'minimal',
  },
  coding: {
    name: '开发助手',
    description: '可读写文件、执行命令（白名单）',
    profile: 'coding',
  },
  messaging: {
    name: '对话助手',
    description: '纯对话，无文件/命令访问',
    profile: 'messaging',
  },
  full: {
    name: '完全权限',
    description: '所有权限（除网络）',
    profile: 'full',
  },
};

// ============ 主函数 ============

export async function createAgentInteractive(): Promise<void> {
  console.log(chalk.cyan.bold('\n🤖 SecureBot Agent 创建向导\n'));
  
  // 加载现有配置
  const config = loadExistingConfig();
  const existingIds = config.agents.map((a: AgentConfig) => a.id);
  
  // 收集 Agent 信息
  const agentInfo = await collectAgentInfo(existingIds);
  if (!agentInfo) {
    console.log(chalk.gray('已取消'));
    return;
  }
  
  // 显示预览
  const confirmed = await showPreview(agentInfo);
  if (!confirmed) {
    console.log(chalk.gray('已取消'));
    return;
  }
  
  // 创建 Agent
  await saveAgent(agentInfo, config);
  
  console.log(chalk.green.bold('\n✓ Agent 创建成功！\n'));
  console.log(chalk.gray(`使用方式：`));
  console.log(chalk.white(`  @${agentInfo.id} <消息>`));
  console.log(chalk.white(`  /agent ${agentInfo.id}`));
  console.log();
}

// ============ 收集信息 ============

async function collectAgentInfo(existingIds: string[]): Promise<AgentConfig | null> {
  // Agent ID
  const id = await p.text({
    message: 'Agent ID（仅字母、数字、下划线）',
    placeholder: 'my-agent',
    validate: (value) => {
      if (!value) return '请输入 Agent ID';
      if (!/^[a-z0-9_]+$/i.test(value)) return '只能包含字母、数字、下划线';
      if (existingIds.includes(value)) return `Agent "${value}" 已存在`;
      return undefined;
    },
  });
  
  if (p.isCancel(id)) return null;
  
  // Agent 名称
  const name = await p.text({
    message: 'Agent 名称',
    placeholder: '我的助手',
    validate: (value) => {
      if (!value) return '请输入名称';
      return undefined;
    },
  });
  
  if (p.isCancel(name)) return null;
  
  // 工具权限
  const profileKey = await p.select({
    message: '工具权限',
    options: Object.entries(TOOL_PROFILES).map(([key, value]) => ({
      value: key,
      label: value.name,
      hint: value.description,
    })),
  });
  
  if (p.isCancel(profileKey)) return null;
  
  // 是否为默认 Agent
  const isDefault = await p.confirm({
    message: '设为默认 Agent？',
    initialValue: false,
  });
  
  if (p.isCancel(isDefault)) return null;
  
  // 构建配置
  const profileObj = TOOL_PROFILES[profileKey as keyof typeof TOOL_PROFILES];
  const profileValue: ToolPolicy['profile'] = profileObj?.profile ?? 'minimal';
  
  const agentConfig: AgentConfig = {
    id: id as string,
    name: name as string,
    workspace: id as string,  // 相对路径
    tools: {
      profile: profileValue,
      deny: ['group:web'],  // 默认禁用网络
    },
  };
  
  if (isDefault) {
    agentConfig.default = true;
  }
  
  return agentConfig;
}

// ============ 预览确认 ============

async function showPreview(agent: AgentConfig): Promise<boolean> {
  console.log();
  console.log(chalk.cyan('━━━ Agent 配置预览 ━━━'));
  console.log(chalk.white(`  ID:        ${agent.id}`));
  console.log(chalk.white(`  名称:      ${agent.name}`));
  console.log(chalk.white(`  权限:      ${TOOL_PROFILES[agent.tools?.profile ?? 'minimal']?.name ?? agent.tools?.profile}`));
  console.log(chalk.white(`  工作空间:  ./agents/${agent.workspace}`));
  if (agent.default) {
    console.log(chalk.white(`  默认:      ✓`));
  }
  console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━'));
  console.log();
  
  const confirmed = await p.confirm({
    message: '确认创建？',
    initialValue: true,
  });
  
  return confirmed === true;
}

// ============ 保存 Agent ============

async function saveAgent(agent: AgentConfig, config: Config): Promise<void> {
  // 如果设为默认，取消其他 Agent 的默认标记
  if (agent.default) {
    for (const a of config.agents) {
      a.default = false;
    }
  }
  
  // 添加新 Agent
  config.agents.push(agent);
  
  // 创建工作空间（相对于当前工作目录）
  const workspaceDir = join(process.cwd(), 'agents', agent.workspace);
  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }
  
  // 保存配置
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  
  writeFileSync(CONFIG_PATH, JSON5.stringify(config, null, 2), 'utf-8');
}

// ============ 加载现有配置 ============

function loadExistingConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    // 返回默认配置
    return {
      model: {
        model: 'qwen3.5:35b-a3b',
        baseUrl: 'http://localhost:11434',
      },
      defaultAgent: 'dev',
      tools: {
        profile: 'minimal',
        deny: ['group:web'],
      },
      agents: [],
    };
  }
  
  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON5.parse(content);
  } catch {
    return {
      model: {
        model: 'qwen3.5:35b-a3b',
        baseUrl: 'http://localhost:11434',
      },
      defaultAgent: 'dev',
      tools: {
        profile: 'minimal',
        deny: ['group:web'],
      },
      agents: [],
    };
  }
}

// ============ CLI 命令 ============

export async function listAgents(): Promise<void> {
  const config = loadExistingConfig();
  
  console.log(chalk.cyan.bold('\n📋 Agent 列表\n'));
  
  if (config.agents.length === 0) {
    console.log(chalk.gray('暂无 Agent，使用 `securebot agent create` 创建'));
    return;
  }
  
  for (const agent of config.agents) {
    const defaultTag = agent.default ? chalk.green(' (默认)') : '';
    const profileName = TOOL_PROFILES[agent.tools?.profile ?? 'minimal']?.name ?? agent.tools?.profile;
    console.log(chalk.white(`  ${agent.id}${defaultTag}`));
    console.log(chalk.gray(`    名称: ${agent.name}`));
    console.log(chalk.gray(`    权限: ${profileName}`));
    console.log();
  }
}

export async function deleteAgentInteractive(): Promise<void> {
  const config = loadExistingConfig();
  
  if (config.agents.length === 0) {
    console.log(chalk.yellow('暂无可删除的 Agent'));
    return;
  }
  
  const selectedId = await p.select({
    message: '选择要删除的 Agent',
    options: config.agents.map((a: AgentConfig) => ({
      value: a.id,
      label: `${a.id} (${a.name})`,
    })),
  });
  
  if (p.isCancel(selectedId)) {
    console.log(chalk.gray('已取消'));
    return;
  }
  
  const confirmed = await p.confirm({
    message: `确认删除 Agent "${selectedId}"？`,
    initialValue: false,
  });
  
  if (!confirmed) {
    console.log(chalk.gray('已取消'));
    return;
  }
  
  // 删除 Agent
  const index = config.agents.findIndex((a: AgentConfig) => a.id === selectedId);
  if (index >= 0) {
    config.agents.splice(index, 1);
    
    // 如果删除的是默认 Agent，设置第一个为默认
    if (config.agents.length > 0 && !config.agents.some((a: AgentConfig) => a.default)) {
      config.agents[0]!.default = true;
    }
    
    writeFileSync(CONFIG_PATH, JSON5.stringify(config, null, 2), 'utf-8');
    console.log(chalk.green(`✓ Agent "${selectedId}" 已删除`));
  }
}