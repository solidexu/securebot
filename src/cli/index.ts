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
  .option('--tui', '启用 Ink 分屏界面（现代 React 界面）')
  .option('--legacy-tui', '启用旧版 blessed 分屏界面')
  .action(async (options) => {
    if (options.legacyTui) {
      const { startTuiRepl: startLegacyTui } = await import('./tui.js');
      await startLegacyTui({
        defaultAgent: options.agent,
        model: options.model,
      });
    } else if (options.tui) {
      const { startTuiRepl } = await import('./tui/index.js');
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

// skill version 命令
skillCmd
  .command('versions <skillId>')
  .description('查看技能版本历史')
  .action(async (skillId: string) => {
    const { listVersions } = await import('./commands/skill-version.js');
    await listVersions(skillId);
  });

skillCmd
  .command('save <skillId>')
  .description('保存当前版本')
  .option('-m, --message <msg>', '版本变更说明')
  .action(async (skillId: string, options) => {
    const { saveVersion } = await import('./commands/skill-version.js');
    await saveVersion(skillId, options.message);
  });

skillCmd
  .command('rollback <skillId> [version]')
  .description('回滚到指定版本')
  .action(async (skillId: string, version?: string) => {
    const { rollbackVersion } = await import('./commands/skill-version.js');
    await rollbackVersion(skillId, version);
  });

skillCmd
  .command('diff <skillId> [version1] [version2]')
  .description('对比两个版本')
  .action(async (skillId: string, version1?: string, version2?: string) => {
    const { diffVersions } = await import('./commands/skill-version.js');
    await diffVersions(skillId, version1, version2);
  });

// skill pack 命令
skillCmd
  .command('pack <skillId>')
  .description('打包技能为 .skill 文件')
  .option('-o, --output <path>', '输出目录')
  .action(async (skillId: string, options) => {
    const { packSkill } = await import('./commands/skill-pack.js');
    await packSkill(skillId, options.output);
  });

skillCmd
  .command('install <source>')
  .description('安装技能（本地文件或 URL）')
  .option('-f, --force', '覆盖已存在的技能')
  .option('-d, --dir <path>', '安装目录')
  .action(async (source: string, options) => {
    const { installSkill } = await import('./commands/skill-pack.js');
    await installSkill(source, { overwrite: options.force, targetDir: options.dir });
  });

skillCmd
  .command('verify <skillFile>')
  .description('验证技能包')
  .action(async (skillFile: string) => {
    const { verifySkill } = await import('./commands/skill-pack.js');
    await verifySkill(skillFile);
  });

skillCmd
  .command('inspect <skillFile>')
  .description('查看技能包内容')
  .action(async (skillFile: string) => {
    const { inspectSkill } = await import('./commands/skill-pack.js');
    await inspectSkill(skillFile);
  });

skillCmd
  .command('export-all')
  .description('导出所有技能')
  .option('-o, --output <path>', '输出目录')
  .action(async (options) => {
    const { exportAllSkills } = await import('./commands/skill-pack.js');
    await exportAllSkills(options.output);
  });

// skill discovery 命令
skillCmd
  .command('search <query>')
  .description('搜索远程技能')
  .action(async (query: string) => {
    const { searchSkills } = await import('./commands/skill-discover.js');
    await searchSkills(query);
  });

skillCmd
  .command('explore')
  .description('浏览热门和最新技能')
  .option('-t, --type <type>', 'popular 或 latest', 'popular')
  .option('-l, --limit <number>', '显示数量', '10')
  .action(async (options) => {
    const { showPopular, showLatest } = await import('./commands/skill-discover.js');
    const limit = parseInt(options.limit) || 10;
    if (options.type === 'latest') {
      await showLatest(limit);
    } else {
      await showPopular(limit);
    }
  });

skillCmd
  .command('show-remote <skillId>')
  .description('查看远程技能详情')
  .action(async (skillId: string) => {
    const { showRemoteSkill } = await import('./commands/skill-discover.js');
    await showRemoteSkill(skillId);
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

// kb 命令（知识库管理）
const kbCmd = program
  .command('kb')
  .description('知识库管理');

kbCmd
  .command('list')
  .description('列出所有知识库')
  .action(async () => {
    const { listKnowledgeBases } = await import('./commands/kb.js');
    await listKnowledgeBases();
  });

kbCmd
  .command('create')
  .description('创建新知识库')
  .action(async () => {
    const { createKnowledgeBaseInteractive } = await import('./commands/kb.js');
    await createKnowledgeBaseInteractive();
  });

kbCmd
  .command('index [kbId]')
  .description('索引知识库')
  .action(async (kbId?: string) => {
    const { indexKnowledgeBase } = await import('./commands/kb.js');
    await indexKnowledgeBase(kbId);
  });

kbCmd
  .command('delete [kbId]')
  .description('删除知识库')
  .action(async (kbId?: string) => {
    const { deleteKnowledgeBaseInteractive } = await import('./commands/kb.js');
    await deleteKnowledgeBaseInteractive(kbId);
  });

kbCmd
  .command('search <query>')
  .description('搜索知识库')
  .action(async (query: string) => {
    const { searchKnowledgeBases } = await import('./commands/kb.js');
    await searchKnowledgeBases(query);
  });

// sandbox 命令
const sandboxCmd = program
  .command('sandbox')
  .description('沙箱管理');

sandboxCmd
  .command('status [agentId]')
  .description('显示沙箱状态')
  .action(async (agentId?: string) => {
    const { showSandboxStatus } = await import('./commands/sandbox.js');
    await showSandboxStatus(agentId);
  });

sandboxCmd
  .command('init')
  .description('初始化沙箱环境（构建 Docker 镜像）')
  .option('-f, --force', '强制重新构建镜像')
  .action(async (options: { force?: boolean }) => {
    const { initSandbox } = await import('./commands/sandbox.js');
    await initSandbox(options.force);
  });

sandboxCmd
  .command('start <agentId>')
  .description('启动 Agent 的沙箱容器')
  .option('-w, --workspace <path>', '工作区路径')
  .action(async (agentId: string, options: { workspace?: string }) => {
    const { startSandboxContainer } = await import('./commands/sandbox.js');
    const { getAgentsDir, loadConfig } = await import('../core/config.js');
    const config = loadConfig();
    const agentsDir = getAgentsDir(config);
    const workspace = options.workspace || `${agentsDir}/${agentId}`;
    await startSandboxContainer(agentId, workspace);
  });

sandboxCmd
  .command('list <agentId>')
  .description('列出 Agent 允许访问的目录')
  .action(async (agentId: string) => {
    const { listAllowedDirs } = await import('./commands/sandbox.js');
    await listAllowedDirs(agentId);
  });

sandboxCmd
  .command('allow <agentId> <path>')
  .description('授权 Agent 访问目录')
  .option('-r, --readonly', '只读模式')
  .action(async (agentId: string, path: string, options: { readonly?: boolean }) => {
    const { allowDir } = await import('./commands/sandbox.js');
    await allowDir(agentId, path, options.readonly);
  });

sandboxCmd
  .command('deny <agentId> <path>')
  .description('移除 Agent 的目录访问权限')
  .action(async (agentId: string, path: string) => {
    const { denyDir } = await import('./commands/sandbox.js');
    await denyDir(agentId, path);
  });

sandboxCmd
  .command('reset <agentId>')
  .description('重置沙箱配置')
  .action(async (agentId: string) => {
    const { resetSandboxCmd } = await import('./commands/sandbox.js');
    await resetSandboxCmd(agentId);
  });

sandboxCmd
  .command('stop-all')
  .description('停止所有沙箱容器')
  .action(async () => {
    const { stopAllSandoxContainers } = await import('./commands/sandbox.js');
    await stopAllSandoxContainers();
  });

// graph 命令（Agent协作图管理）
const graphCmd = program
  .command('graph')
  .description('Agent协作图管理');

// 动态注册graph子命令
(async () => {
  const { registerGraphCommand } = await import('./commands/graph.js');
  registerGraphCommand(graphCmd);
})();

program.parse();