#!/usr/bin/env node
/**
 * SecureBot CLI 入口
 */

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// 读取版本号
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8')
);

// CLI 程序
const program = new Command();

program
  .name('securebot')
  .description('安全可控的多 Agent AI 助手')
  .version(packageJson.version);

// chat 命令
program
  .command('chat')
  .description('启动交互式聊天')
  .option('-a, --agent <id>', '指定默认 Agent', 'dev')
  .option('-m, --model <name>', '指定模型')
  .option('--no-tools', '禁用所有工具')
  .option('--tui', '启用分屏界面（左侧聊天，右侧文件浏览器）')
  .action(async (options) => {
    if (options.tui) {
      const { startTuiRepl } = await import('./tui.js');
      await startTuiRepl({
        defaultAgent: options.agent,
        model: options.model,
      });
    } else {
      const { startRepl } = await import('./repl.js');
      await startRepl({
        defaultAgent: options.agent,
        model: options.model,
        noTools: options.noTools,
      });
    }
  });

// init 命令
program
  .command('init')
  .description('配置向导，交互式配置 SecureBot')
  .action(async () => {
    const { runConfigWizard } = await import('./commands/init.js');
    await runConfigWizard();
  });

// agent 命令
const agentCmd = program
  .command('agent')
  .description('管理 Agent');

agentCmd
  .command('list')
  .description('列出所有 Agent')
  .action(async () => {
    const { listAgents } = await import('./commands/agent-create.js');
    await listAgents();
  });

agentCmd
  .command('create')
  .description('交互式创建新 Agent')
  .action(async () => {
    const { createAgentInteractive } = await import('./commands/agent-create.js');
    await createAgentInteractive();
  });

agentCmd
  .command('delete')
  .description('删除 Agent')
  .action(async () => {
    const { deleteAgentInteractive } = await import('./commands/agent-create.js');
    await deleteAgentInteractive();
  });

// skill 命令
const skillCmd = program
  .command('skill')
  .description('技能管理');

skillCmd
  .command('list')
  .description('列出所有技能')
  .option('-p, --public', '仅显示公共技能')
  .option('-r, --private', '仅显示个人技能')
  .option('-a, --agent <id>', '显示指定 Agent 的技能')
  .action(async (options) => {
    const { listSkills } = await import('./commands/skill.js');
    await listSkills(options);
  });

skillCmd
  .command('create')
  .description('交互式创建新技能')
  .option('-a, --agent <id>', '创建个人技能给指定 Agent')
  .action(async (options) => {
    const { createSkillInteractive } = await import('./commands/skill.js');
    await createSkillInteractive(options);
  });

skillCmd
  .command('delete [skillId]')
  .description('删除技能')
  .action(async (skillId?: string) => {
    const { deleteSkillInteractive } = await import('./commands/skill.js');
    await deleteSkillInteractive(skillId);
  });

skillCmd
  .command('assign <skillId> <agentId>')
  .description('将技能分配给 Agent')
  .action(async (skillId: string, agentId: string) => {
    const { assignSkillToAgent } = await import('./commands/skill.js');
    await assignSkillToAgent(skillId, agentId);
  });

skillCmd
  .command('unassign <skillId> <agentId>')
  .description('从 Agent 移除技能')
  .action(async (skillId: string, agentId: string) => {
    const { removeSkillFromAgent } = await import('./commands/skill.js');
    await removeSkillFromAgent(skillId, agentId);
  });

// config 命令
program
  .command('config')
  .description('配置管理')
  .command('show')
  .description('显示当前配置')
  .action(async () => {
    const { showCurrentConfig } = await import('./commands/init.js');
    await showCurrentConfig();
  });

// model 命令
program
  .command('model')
  .description('模型管理')
  .command('list')
  .description('列出可用模型')
  .action(async () => {
    const { listModels } = await import('./commands/model.js');
    await listModels();
  });

// security 命令
program
  .command('security')
  .description('安全检查')
  .action(async () => {
    const { runSecurityCheck } = await import('./commands/security.js');
    await runSecurityCheck();
  });

// doctor 命令
program
  .command('doctor')
  .description('诊断和修复配置问题')
  .action(async () => {
    const { runDoctor } = await import('./commands/doctor.js');
    await runDoctor();
  });

// 解析参数
program.parse();