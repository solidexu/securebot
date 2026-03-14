/**
 * 配置向导
 * 
 * 交互式配置 SecureBot，降低首次使用门槛
 */

import * as p from '@clack/prompts';
import chalk from 'chalk';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { loadConfig, saveConfig, DEFAULT_CONFIG, getConfigPath } from '../../core/config.js';
import type { Config, AgentConfig } from '../../core/types.js';

/**
 * 运行配置向导
 */
export async function runConfigWizard(): Promise<void> {
  console.log(chalk.cyan.bold('\n🚀 SecureBot 配置向导\n'));
  
  // 检查现有配置
  const configPath = getConfigPath();
  const hasExistingConfig = existsSync(configPath);
  
  if (hasExistingConfig) {
    const overwrite = await p.confirm({
      message: '发现现有配置，是否覆盖？',
      initialValue: false,
    });
    
    if (!overwrite) {
      console.log(chalk.gray('已取消'));
      return;
    }
  }
  
  // 步骤 1: 配置 Ollama
  console.log(chalk.cyan('\n步骤 1: 配置 Ollama\n'));
  
  const ollamaUrl = await p.text({
    message: 'Ollama 地址',
    placeholder: 'http://localhost:11434',
    initialValue: 'http://localhost:11434',
  });
  
  if (p.isCancel(ollamaUrl)) {
    console.log(chalk.gray('已取消'));
    return;
  }
  
  // 测试连接
  const spinner = p.spinner();
  spinner.start('正在连接 Ollama...');
  
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`);
    if (!response.ok) {
      spinner.stop('连接失败');
      console.log(chalk.yellow('⚠️ 无法连接到 Ollama，请确保 Ollama 正在运行'));
    } else {
      const data = await response.json() as { models?: Array<{ name: string }> };
      const models = data.models ?? [];
      spinner.stop(`连接成功，发现 ${models.length} 个模型`);
      
      if (models.length > 0) {
        const modelOptions = models.map(m => ({ value: m.name, label: m.name }));
        const selectedModel = await p.select({
          message: '选择默认模型',
          options: modelOptions,
        });
        
        if (p.isCancel(selectedModel)) {
          console.log(chalk.gray('已取消'));
          return;
        }
        
        // 设置选中的模型
        const config: Config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        config.model.model = selectedModel as string;
        config.model.baseUrl = ollamaUrl as string;
        
        // 步骤 2: 配置 Agent
        console.log(chalk.cyan('\n步骤 2: 配置 Agent\n'));
        
        const addAgents = await p.confirm({
          message: '是否添加自定义 Agent？',
          initialValue: false,
        });
        
        if (addAgents) {
          await addCustomAgents(config);
        }
        
        // 步骤 3: 配置数据目录
        console.log(chalk.cyan('\n步骤 3: 配置数据目录\n'));
        
        const customDataDir = await p.confirm({
          message: '是否自定义数据目录？',
          initialValue: false,
        });
        
        if (customDataDir) {
          const dataDir = await p.text({
            message: '数据目录路径',
            placeholder: '~/.securebot',
          });
          
          if (!p.isCancel(dataDir) && dataDir) {
            config.dataDir = dataDir.startsWith('~') 
              ? join(homedir(), dataDir.slice(1))
              : dataDir;
          }
        }
        
        // 保存配置
        saveConfig(config);
        
        // 确保数据目录存在
        const dataDir = config.dataDir ?? join(homedir(), '.securebot');
        if (!existsSync(dataDir)) {
          mkdirSync(dataDir, { recursive: true });
        }
        
        console.log(chalk.green.bold('\n✓ 配置完成！\n'));
        console.log(chalk.gray(`配置文件: ${configPath}`));
        console.log(chalk.gray(`数据目录: ${config.dataDir ?? '~/.securebot'}`));
        console.log();
        console.log(chalk.cyan('快速开始:'));
        console.log(chalk.white('  npm run dev'));
        console.log();
      }
    }
  } catch (error) {
    spinner.stop('连接失败');
    console.log(chalk.yellow('⚠️ 无法连接到 Ollama'));
    console.log(chalk.gray('请确保 Ollama 正在运行: ollama serve'));
    
    const continueAnyway = await p.confirm({
      message: '是否继续配置？',
      initialValue: true,
    });
    
    if (continueAnyway) {
      // 使用默认配置继续
      const config: Config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      config.model.baseUrl = ollamaUrl as string;
      saveConfig(config);
      console.log(chalk.green('\n✓ 已保存配置'));
      console.log(chalk.gray('启动 Ollama 后运行: npm run dev'));
    }
  }
}

/**
 * 添加自定义 Agent
 */
async function addCustomAgents(config: Config): Promise<void> {
  let addMore = true;
  
  while (addMore) {
    const agentId = await p.text({
      message: 'Agent ID（仅字母、数字、下划线）',
      placeholder: 'my-agent',
      validate: (value) => {
        if (!value) return '请输入 Agent ID';
        if (!/^[a-z0-9_]+$/i.test(value)) return '只能包含字母、数字、下划线';
        if (config.agents.some((a: AgentConfig) => a.id === value)) return 'Agent ID 已存在';
        return undefined;
      },
    });
    
    if (p.isCancel(agentId)) break;
    
    const agentName = await p.text({
      message: 'Agent 名称',
      placeholder: '我的助手',
    });
    
    if (p.isCancel(agentName)) break;
    
    const profile = await p.select({
      message: '权限预设',
      options: [
        { value: 'minimal', label: '最小权限', hint: '仅对话' },
        { value: 'coding', label: '开发权限', hint: '文件读写、命令执行' },
        { value: 'messaging', label: '消息权限', hint: '仅对话' },
        { value: 'full', label: '完全权限', hint: '无限制' },
      ],
    });
    
    if (p.isCancel(profile)) break;
    
    const newAgent: AgentConfig = {
      id: agentId as string,
      name: (agentName as string) || (agentId as string),
      workspace: agentId as string,
      tools: {
        profile: profile as 'minimal' | 'coding' | 'messaging' | 'full',
        deny: ['group:web'],
      },
    };
    
    config.agents.push(newAgent);
    console.log(chalk.green(`✓ 已添加 Agent: ${newAgent.name}`));
    
    const continueAdd = await p.confirm({
      message: '继续添加 Agent？',
      initialValue: false,
    });
    
    if (p.isCancel(continueAdd) || !continueAdd) break;
  }
}

/**
 * 显示当前配置
 */
export async function showCurrentConfig(): Promise<void> {
  console.log(chalk.cyan.bold('\n📋 当前配置\n'));
  
  try {
    const config = loadConfig();
    
    console.log(chalk.white('模型配置:'));
    console.log(`  模型: ${config.model.model}`);
    console.log(`  地址: ${config.model.baseUrl ?? 'http://localhost:11434'}`);
    console.log();
    
    console.log(chalk.white('数据目录:'));
    console.log(`  ${config.dataDir ?? '~/.securebot'}`);
    console.log();
    
    console.log(chalk.white('Agent 列表:'));
    for (const agent of config.agents) {
      const defaultTag = agent.default ? chalk.green(' (默认)') : '';
      console.log(`  ${agent.id} - ${agent.name}${defaultTag}`);
    }
    console.log();
    
    console.log(chalk.gray(`配置文件: ${getConfigPath()}`));
  } catch (error) {
    console.log(chalk.yellow('未找到配置文件，请运行: securebot init'));
  }
}