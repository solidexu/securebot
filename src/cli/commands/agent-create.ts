/**
 * 交互式创建 Agent
 * 
 * 通过问答方式创建新 Agent，降低配置难度
 */

import * as p from '@clack/prompts';
import chalk from 'chalk';
import { existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 
  loadConfig, 
  saveConfig, 
  getConfigPath, 
  getRootDir, 
  getAgentsDir 
} from '../../core/config.js';
import type { Config, AgentConfig, ToolPolicy } from '../../core/types.js';

// ============ Ollama 检测 ============

/** 支持的嵌入模型列表（按优先级排序） */
const EMBEDDING_MODELS = [
  'all-minilm',
  'nomic-embed-text',
  'mxbai-embed-large',
  'snowflake-arctic-embed',
];

/**
 * 检测 Ollama 是否运行并返回可用的嵌入模型
 */
async function detectEmbeddingModel(ollamaUrl: string = 'http://localhost:11434'): Promise<string | null> {
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    
    if (!response.ok) return null;
    
    const data = await response.json() as { models?: Array<{ name: string }> };
    const models = data.models?.map(m => m.name.toLowerCase()) ?? [];
    
    // 按优先级查找可用的嵌入模型
    for (const model of EMBEDDING_MODELS) {
      if (models.some(m => m.includes(model))) {
        return model;
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

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
  
  // 收集 Agent 信息（传入 config 以检测 Ollama）
  const agentInfo = await collectAgentInfo(existingIds, config);
  if (!agentInfo) {
    console.log(chalk.gray('已取消'));
    return;
  }
  
  // 显示预览
  const confirmed = await showPreview(agentInfo, config);
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
  
  if (agentInfo.rag?.enabled) {
    console.log();
    console.log(chalk.gray(`添加文档到知识库：`));
    const kbPath = agentInfo.rag.knowledgeDirs?.[0] ?? join(getRootDir(config), 'knowledges', agentInfo.id);
    console.log(chalk.white(`  cp *.md ${kbPath}`));
  }
  console.log();
}

// ============ 收集信息 ============

async function collectAgentInfo(existingIds: string[], config: Config): Promise<AgentConfig | null> {
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
  
  // 自动检测并创建知识库
  const spinner = p.spinner();
  spinner.start('检测 Ollama 嵌入模型...');
  
  const embeddingModel = await detectEmbeddingModel(config.model.baseUrl);
  
  if (embeddingModel) {
    spinner.stop(`检测到嵌入模型: ${embeddingModel}`);
    
    // 使用配置的 rootDir 作为知识库根目录
    const rootDir = getRootDir(config);
    const knowledgeBasePath = join(rootDir, 'knowledges', id as string);
    
    // 自动为 Agent 启用 RAG
    agentConfig.rag = {
      enabled: true,
      knowledgeDirs: [knowledgeBasePath],
      embeddingModel,
      chunkSize: 1000,
      chunkOverlap: 200,
      topK: 5,
      minScore: 0.5,
    };
    
    console.log(chalk.gray(`  ✓ 已自动配置知识库: ${knowledgeBasePath}`));
  } else {
    spinner.stop('未检测到嵌入模型，跳过知识库配置');
    console.log(chalk.gray(`  提示: 安装嵌入模型后可启用知识库: ollama pull all-minilm`));
  }
  
  return agentConfig;
}

// ============ 预览确认 ============

async function showPreview(agent: AgentConfig, config: Config): Promise<boolean> {
  const agentsDir = getAgentsDir(config);
  const rootDir = getRootDir(config);
  const workspacePath = join(agentsDir, agent.workspace);
  
  console.log();
  console.log(chalk.cyan('━━━ Agent 配置预览 ━━━'));
  console.log(chalk.white(`  ID:        ${agent.id}`));
  console.log(chalk.white(`  名称:      ${agent.name}`));
  console.log(chalk.white(`  权限:      ${TOOL_PROFILES[agent.tools?.profile ?? 'minimal']?.name ?? agent.tools?.profile}`));
  console.log(chalk.white(`  工作空间:  ${workspacePath}`));
  
  // 显示知识库信息
  if (agent.rag?.enabled) {
    const kbPath = agent.rag.knowledgeDirs?.[0] ?? join(rootDir, 'knowledges', agent.id);
    console.log(chalk.white(`  知识库:    ${kbPath}`));
    console.log(chalk.white(`  嵌入模型:  ${agent.rag.embeddingModel}`));
  }
  
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
  // 如果设为默认，取消其他 Agent 的默认标记，并更新 defaultAgent
  if (agent.default) {
    for (const a of config.agents) {
      a.default = false;
    }
    config.defaultAgent = agent.id;
  }
  
  // 添加新 Agent
  config.agents.push(agent);
  
  // 创建工作空间（使用配置的 rootDir）
  const agentsDir = getAgentsDir(config);
  const workspaceDir = join(agentsDir, agent.workspace);
  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }
  
  // 创建知识库目录
  if (agent.rag?.enabled && agent.rag.knowledgeDirs?.[0]) {
    const kbPath = agent.rag.knowledgeDirs[0];
    if (!existsSync(kbPath)) {
      mkdirSync(kbPath, { recursive: true });
      console.log(chalk.gray(`知识库: ${kbPath}`));
    }
  }
  
  // 确保配置目录存在
  const configPath = getConfigPath(config);
  const configDir = resolve(configPath, '..');
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  
  // 保存配置
  saveConfig(config);
  
  console.log(chalk.gray(`工作空间: ${workspaceDir}`));
}

// ============ 加载现有配置 ============

function loadExistingConfig(): Config {
  try {
    return loadConfig();
  } catch {
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
}

// ============ CLI 命令 ============

export async function listAgents(): Promise<void> {
  const config = loadExistingConfig();
  const rootDir = getRootDir(config);
  
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
    
    // 显示知识库信息
    if (agent.rag?.enabled) {
      const kbPath = agent.rag.knowledgeDirs?.[0] ?? join(rootDir, 'knowledges', agent.id);
      console.log(chalk.gray(`    知识库: ${kbPath} (${agent.rag.embeddingModel})`));
    }
    
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
    message: `确认删除 Agent "${selectedId}"？（包括知识库）`,
    initialValue: false,
  });
  
  if (!confirmed) {
    console.log(chalk.gray('已取消'));
    return;
  }
  
  // 删除 Agent
  const index = config.agents.findIndex((a: AgentConfig) => a.id === selectedId);
  if (index >= 0) {
    // 获取要删除的 Agent 配置
    const deletedAgent = config.agents[index];
    
    // 从配置中删除
    config.agents.splice(index, 1);
    
    // 如果删除的是默认 Agent，设置第一个为默认
    if (config.agents.length > 0 && !config.agents.some((a: AgentConfig) => a.default)) {
      config.agents[0]!.default = true;
      config.defaultAgent = config.agents[0]!.id;
    }
    
    // 保存配置
    saveConfig(config);
    
    // 删除工作空间目录
    if (deletedAgent) {
      const rootDir = getRootDir(config);
      const agentsDir = getAgentsDir(config);
      const workspacePath = deletedAgent.workspace.startsWith('/')
        ? deletedAgent.workspace
        : join(agentsDir, deletedAgent.workspace);
      
      if (existsSync(workspacePath)) {
        try {
          rmSync(workspacePath, { recursive: true, force: true });
          console.log(chalk.gray(`  已删除工作空间: ${workspacePath}`));
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.log(chalk.yellow(`  工作空间删除失败: ${msg}`));
        }
      }
      
      // 删除知识库目录
      if (deletedAgent.rag?.knowledgeDirs?.[0]) {
        const kbPath = deletedAgent.rag.knowledgeDirs[0];
        if (existsSync(kbPath)) {
          try {
            rmSync(kbPath, { recursive: true, force: true });
            console.log(chalk.gray(`  已删除知识库: ${kbPath}`));
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.log(chalk.yellow(`  知识库删除失败: ${msg}`));
          }
        }
      }
      
      // 删除会话数据
      const sessionsPath = join(rootDir, 'sessions');
      if (existsSync(sessionsPath)) {
        try {
          const sessionFiles = readdirSync(sessionsPath)
            .filter((f: string) => f.startsWith(`${deletedAgent.id}_`));
          for (const file of sessionFiles) {
            rmSync(join(sessionsPath, file), { force: true });
          }
          if (sessionFiles.length > 0) {
            console.log(chalk.gray(`  已删除 ${sessionFiles.length} 个会话文件`));
          }
        } catch {
          // 忽略错误
        }
      }
    }
    
    console.log(chalk.green(`✓ Agent "${selectedId}" 已删除`));
  }
}