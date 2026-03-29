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
import { loadConfig, saveConfig, DEFAULT_CONFIG, getConfigPath, getRootDir } from '../../core/config.js';
import type { Config, AgentConfig, LocaleCode } from '../../core/types.js';
import { t, setLocale, getSupportedLocales, saveLocaleToConfig } from '../../i18n/index.js';

/**
 * 运行配置向导
 */
export async function runConfigWizard(): Promise<void> {
  // 步骤 0: 选择语言
  console.log(chalk.cyan.bold('\n🚀 SecureBot Configuration Wizard / 配置向导\n'));
  
  const localeOptions = getSupportedLocales().map(l => ({
    value: l.code,
    label: l.name,
  }));
  
  const selectedLocale = await p.select({
    message: 'Select Language / 选择语言',
    options: localeOptions,
    initialValue: 'zh-CN' as LocaleCode,
  });
  
  if (p.isCancel(selectedLocale)) {
    console.log(chalk.gray('Cancelled / 已取消'));
    return;
  }
  
  setLocale(selectedLocale as LocaleCode);
  
  console.log(chalk.cyan.bold(`\n${t('init.title')}\n`));
  
  // 检查现有配置
  const configPath = getConfigPath();
  const hasExistingConfig = existsSync(configPath);
  
  if (hasExistingConfig) {
    const overwrite = await p.confirm({
      message: t('init.existingConfig'),
      initialValue: false,
    });
    
    if (!overwrite) {
      console.log(chalk.gray(t('init.cancelled')));
      return;
    }
  }
  
  // 步骤 1: 配置 Ollama
  console.log(chalk.cyan(`\n${t('init.step2')}\n`));
  
  const ollamaUrl = await p.text({
    message: t('init.ollamaAddress'),
    placeholder: 'http://localhost:11434',
    initialValue: 'http://localhost:11434',
  });
  
  if (p.isCancel(ollamaUrl)) {
    console.log(chalk.gray(t('init.cancelled')));
    return;
  }
  
  // 测试连接
  const spinner = p.spinner();
  spinner.start(t('init.connecting'));
  
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`);
    if (!response.ok) {
      spinner.stop(t('init.connectionFailed'));
      console.log(chalk.yellow(t('init.cannotConnect')));
    } else {
      const data = await response.json() as { models?: Array<{ name: string }> };
      const models = data.models ?? [];
      spinner.stop(t('init.connectionSuccess', { count: models.length }));
      
      if (models.length > 0) {
        const modelOptions = models.map(m => ({ value: m.name, label: m.name }));
        const selectedModel = await p.select({
          message: t('init.selectModel'),
          options: modelOptions,
        });
        
        if (p.isCancel(selectedModel)) {
          console.log(chalk.gray(t('init.cancelled')));
          return;
        }
        
        // 设置选中的模型
        const config: Config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        config.model.model = selectedModel as string;
        config.model.baseUrl = ollamaUrl as string;
        config.language = selectedLocale as LocaleCode;
        
        // 步骤 2: 配置 Agent
        console.log(chalk.cyan(`\n${t('init.step3')}\n`));
        
        const addAgents = await p.confirm({
          message: t('init.addCustomAgent'),
          initialValue: false,
        });
        
        if (addAgents) {
          await addCustomAgents(config);
        }
        
        // 步骤 3: 配置 SecureBot 根目录
        console.log(chalk.cyan(`\n${t('init.step4')}\n`));
        
        console.log(chalk.gray(`${t('init.directoryStructure')}`));
        console.log(chalk.gray(`  - agents/     ${t('init.agentsDir').split('/')[1]?.trim() ?? 'Agent workspaces'}`));
        console.log(chalk.gray(`  - memory/     ${t('init.memoryDir').split('/')[1]?.trim() ?? 'Memory data'}`));
        console.log(chalk.gray(`  - skills/     ${t('init.skillsDir').split('/')[1]?.trim() ?? 'Skills'}`));
        console.log(chalk.gray(`  - sessions/   ${t('init.sessionsDir').split('/')[1]?.trim() ?? 'Sessions'}`));
        console.log(chalk.gray(`  - audit/      ${t('init.auditDir').split('/')[1]?.trim() ?? 'Audit logs'}`));
        console.log();
        
        const customRootDir = await p.confirm({
          message: t('init.customRootDir'),
          initialValue: false,
        });
        
        if (customRootDir) {
          const rootDir = await p.text({
            message: t('init.rootDirPath'),
            placeholder: '~/.securebot',
            initialValue: '~/.securebot',
          });
          
          if (!p.isCancel(rootDir) && rootDir) {
            config.rootDir = rootDir.startsWith('~') 
              ? join(homedir(), rootDir.slice(1))
              : rootDir;
          }
        }
        
        // 保存配置
        saveConfig(config);
        
        // 保存语言设置
        saveLocaleToConfig(selectedLocale as LocaleCode);
        
        // 确保根目录及子目录存在
        const rootDir = getRootDir(config);
        const subDirs = ['agents', 'memory', 'skills', 'sessions', 'audit'];
        for (const subDir of subDirs) {
          const fullPath = join(rootDir, subDir);
          if (!existsSync(fullPath)) {
            mkdirSync(fullPath, { recursive: true });
          }
        }
        
        // 为每个 Agent 创建工作空间和知识库目录
        for (const agent of config.agents) {
          const workspace = join(rootDir, 'agents', agent.id);
          if (!existsSync(workspace)) {
            mkdirSync(workspace, { recursive: true });
          }
          
          // ★ 创建知识库目录
          const knowledgeDir = join(rootDir, 'knowledge', agent.id);
          if (!existsSync(knowledgeDir)) {
            mkdirSync(knowledgeDir, { recursive: true });
          }
        }
        
        console.log(chalk.green.bold(`\n${t('init.configComplete')}\n`));
        console.log(chalk.gray(t('init.configFile', { path: getConfigPath(config) })));
        console.log(chalk.gray(t('init.rootDir', { path: config.rootDir ?? '~/.securebot' })));
        console.log();
        console.log(chalk.cyan(`${t('init.directoryStructure')}`));
        console.log(chalk.gray(`  ${rootDir}`));
        console.log(chalk.gray('  ├── agents/'));
        for (const agent of config.agents) {
          console.log(chalk.gray(`  │   └── ${agent.id}/ (${agent.name})`));
        }
        console.log(chalk.gray('  ├── knowledge/'));
        for (const agent of config.agents) {
          console.log(chalk.gray(`  │   └── ${agent.id}/`));
        }
        console.log(chalk.gray('  ├── memory/'));
        console.log(chalk.gray('  ├── skills/'));
        console.log(chalk.gray('  ├── sessions/'));
        console.log(chalk.gray('  └── audit/'));
        console.log();
        console.log(chalk.cyan(`${t('init.quickStart')}`));
        console.log(chalk.white('  npm run dev'));
        console.log();
      }
    }
  } catch {
    spinner.stop(t('init.connectionFailed'));
    console.log(chalk.yellow(t('init.cannotConnect')));
    console.log(chalk.gray('请确保 Ollama 正在运行: ollama serve'));
    
    const continueAnyway = await p.confirm({
      message: t('init.continueAnyway'),
      initialValue: true,
    });
    
    if (continueAnyway) {
      // 使用默认配置继续
      const config: Config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      config.model.baseUrl = ollamaUrl as string;
      config.language = selectedLocale as LocaleCode;
      saveConfig(config);
      saveLocaleToConfig(selectedLocale as LocaleCode);
      console.log(chalk.green(`\n${t('init.savedConfig')}`));
      console.log(chalk.gray(t('init.startOllama')));
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
      message: t('agent.agentId'),
      placeholder: t('agent.agentIdPlaceholder'),
      validate: (value) => {
        if (!value) return t('agent.agentIdError');
        if (!/^[a-z0-9_]+$/i.test(value)) return t('agent.agentIdFormatError');
        if (config.agents.some((a: AgentConfig) => a.id === value)) return t('agent.agentIdExists');
        return undefined;
      },
    });
    
    if (p.isCancel(agentId)) break;
    
    const agentName = await p.text({
      message: t('agent.agentName'),
      placeholder: t('agent.agentNamePlaceholder'),
    });
    
    if (p.isCancel(agentName)) break;
    
    const profile = await p.select({
      message: t('agent.permissionPreset'),
      options: [
        { value: 'minimal', label: t('agent.permissionMinimal'), hint: t('agent.permissionMinimalHint') },
        { value: 'coding', label: t('agent.permissionCoding'), hint: t('agent.permissionCodingHint') },
        { value: 'messaging', label: t('agent.permissionMessaging'), hint: t('agent.permissionMessagingHint') },
        { value: 'full', label: t('agent.permissionFull'), hint: t('agent.permissionFullHint') },
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
    console.log(chalk.green(t('agent.agentAdded', { name: newAgent.name })));
    
    const continueAdd = await p.confirm({
      message: t('agent.continueAdding'),
      initialValue: false,
    });
    
    if (p.isCancel(continueAdd) || !continueAdd) break;
  }
}

/**
 * 显示当前配置
 */
export async function showCurrentConfig(): Promise<void> {
  console.log(chalk.cyan.bold(`\n${t('config.currentConfig')}\n`));
  
  try {
    const config = loadConfig();
    
    // 加载语言设置
    if (config.language) {
      setLocale(config.language);
    }
    
    console.log(chalk.white(`${t('config.modelConfig')}`));
    console.log(`  ${t('config.model', { model: config.model.model })}`);
    console.log(`  ${t('config.address', { address: config.model.baseUrl ?? 'http://localhost:11434' })}`);
    console.log();
    
    console.log(chalk.white(`${t('config.rootDirTitle')}`));
    const rootDir = getRootDir(config);
    console.log(`  ${rootDir}`);
    console.log(chalk.gray(`  ├── agents/     ${t('init.agentsDir').split('/')[1]?.trim() ?? 'Agent workspaces'}`));
    console.log(chalk.gray(`  ├── memory/     ${t('init.memoryDir').split('/')[1]?.trim() ?? 'Memory data'}`));
    console.log(chalk.gray(`  ├── skills/     ${t('init.skillsDir').split('/')[1]?.trim() ?? 'Skills'}`));
    console.log(chalk.gray(`  ├── sessions/   ${t('init.sessionsDir').split('/')[1]?.trim() ?? 'Sessions'}`));
    console.log(chalk.gray(`  └── audit/      ${t('init.auditDir').split('/')[1]?.trim() ?? 'Audit logs'}`));
    console.log();
    
    console.log(chalk.white(`${t('config.agentList')}`));
    for (const agent of config.agents) {
      const defaultTag = agent.default ? chalk.green(` ${t('config.defaultTag')}`) : '';
      console.log(`  ${agent.id} - ${agent.name}${defaultTag}`);
    }
    console.log();
    
    console.log(chalk.gray(t('config.configFile', { path: getConfigPath() })));
  } catch {
    console.log(chalk.yellow(t('config.configNotFound')));
  }
}