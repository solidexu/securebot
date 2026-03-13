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
  .action(async (options) => {
    const { startRepl } = await import('./repl.js');
    await startRepl({
      defaultAgent: options.agent,
      model: options.model,
      noTools: options.noTools,
    });
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

// config 命令
program
  .command('config')
  .description('配置管理')
  .command('show')
  .description('显示当前配置')
  .action(async () => {
    const { showConfig } = await import('./commands/config.js');
    await showConfig();
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