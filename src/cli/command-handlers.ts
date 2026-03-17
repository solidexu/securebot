/**
 * 命令处理器
 * 
 * 从 repl.ts 提取的命令处理逻辑
 */

import chalk from 'chalk';
import type { ReplState, Agent, Session } from '../core/types.js';
import { getSessionStorage } from '../core/session-storage.js';
import { getMemoryManager } from '../core/memory.js';
import { getAuditLogger } from '../core/audit.js';
import { getConfirmationManager } from '../core/confirmation.js';
import { getSkillManager } from '../core/skills.js';
import { renderHierarchicalPlan } from './repl-utils.js';
import type readline from 'node:readline';

// ============ 类型定义 ============

export interface CommandContext {
  state: ReplState;
  agent: Agent;
  session: Session;
  rl: readline.Interface;
  arg: string;
  sessionStorage: ReturnType<typeof getSessionStorage>;
}

export type CommandHandler = (ctx: CommandContext) => Promise<void> | void;

// ============ 命令注册表 ============

const commandHandlers: Map<string, CommandHandler> = new Map();

/**
 * 注册命令处理器
 */
export function registerCommand(name: string, handler: CommandHandler): void {
  commandHandlers.set(name, handler);
}

/**
 * 获取命令处理器
 */
export function getCommandHandler(name: string): CommandHandler | undefined {
  return commandHandlers.get(name);
}

/**
 * 获取所有命令名称
 */
export function getCommandNames(): string[] {
  return Array.from(commandHandlers.keys());
}

// ============ 内置命令处理器 ============

// /help 命令
registerCommand('help', () => {
  printHelp();
});
registerCommand('h', getCommandHandler('help')!);
registerCommand('?', getCommandHandler('help')!);

// /exit 命令
registerCommand('exit', (ctx: CommandContext) => {
  ctx.state.running = false;
});
registerCommand('quit', getCommandHandler('exit')!);
registerCommand('q', getCommandHandler('exit')!);

// /clear 命令
registerCommand('clear', () => {
  console.clear();
});

// /agent 命令
registerCommand('agent', (ctx: CommandContext) => {
  const { state, arg } = ctx;
  if (!arg) {
    const currentAgent = state.agents.get(state.currentAgentId);
    console.log(chalk.cyan(`当前 Agent: ${currentAgent?.name || state.currentAgentId}`));
    return;
  }

  const targetAgent = Array.from(state.agents.values()).find(
    a => a.id === arg || a.name.toLowerCase() === arg.toLowerCase()
  );

  if (targetAgent) {
    state.currentAgentId = targetAgent.id;
    console.log(chalk.green(`✓ 切换到 Agent: ${targetAgent.name}`));
  } else {
    console.log(chalk.yellow(`未找到 Agent: ${arg}`));
  }
});

// /agents 命令
registerCommand('agents', (ctx: CommandContext) => {
  const { state } = ctx;
  console.log(chalk.cyan('\n可用 Agent 列表:\n'));
  for (const agent of state.agents.values()) {
    const isCurrent = agent.id === state.currentAgentId;
    const prefix = isCurrent ? '→ ' : '  ';
    const nameColor = isCurrent ? chalk.green : chalk.white;
    console.log(`${prefix}${nameColor(agent.name)} ${chalk.gray(`(${agent.id})`)}`);
  }
  console.log();
});

// /memory 命令
registerCommand('memory', async (ctx: CommandContext) => {
  const { state, arg } = ctx;
  const memoryManager = getMemoryManager();

  if (arg === 'stats') {
    const stats = memoryManager.getStats();
    console.log(chalk.cyan('\n记忆系统统计:'));
    console.log(`  总条目: ${stats.totalEntries}`);
    console.log(`  每日记忆: ${stats.dailyMemoryCount}`);
  } else if (arg?.startsWith('search ')) {
    const query = arg.slice(7);
    const entries = await memoryManager.search(query, { agentId: state.currentAgentId });
    console.log(chalk.cyan(`\n搜索结果 (${entries.length} 条):\n`));
    for (const entry of entries.slice(0, 10)) {
      const time = new Date(entry.timestamp).toLocaleDateString('zh-CN');
      console.log(`  ${chalk.gray(time)} ${entry.content.slice(0, 80)}...`);
    }
  } else {
    console.log(chalk.gray('用法: /memory stats | /memory search <关键词>'));
  }
});

// /monitor 命令
registerCommand('monitor', () => {
  try {
    const { getPerformanceMonitor } = require('../core/handlers/performance-handler.js');
    const { getErrorTracker } = require('../core/handlers/error-handler.js');

    const monitor = getPerformanceMonitor();
    const tracker = getErrorTracker();
    const summary = monitor.getSummary();
    const stats = tracker.getStats();

    console.log(chalk.cyan('\n📊 监控报告'));
    console.log('─'.repeat(50));
    console.log(`运行时间: ${summary.uptime}s | 事件: ${summary.totalEvents} | 错误: ${stats.totalErrors}`);
    console.log('─'.repeat(50));
  } catch {
    console.log(chalk.yellow('监控系统未初始化'));
  }
});

// /plan 命令
registerCommand('plan', (ctx: CommandContext) => {
  const { session, arg, sessionStorage } = ctx;
  
  if (arg === 'clear') {
    session.planStack = [];
    delete session.plan;
    sessionStorage.saveSession(session);
    console.log(chalk.green('✓ 已清除所有任务规划'));
  } else if (session.plan) {
    console.log(chalk.cyan.bold('\n📋 当前任务规划\n'));
    console.log(renderHierarchicalPlan(session));
  } else {
    console.log(chalk.gray('当前没有进行中的任务规划'));
  }
});

// /history 命令
registerCommand('history', (ctx: CommandContext) => {
  const { session } = ctx;
  console.log(chalk.cyan(`\n对话历史 (${session.history.length} 条):\n`));
  for (const msg of session.history.slice(-20)) {
    const role = msg.role === 'user' ? '👤' : '🤖';
    const content = msg.content?.slice(0, 80) || '(空)';
    console.log(`${role} ${chalk.gray(content)}...`);
  }
});

// /save 命令
registerCommand('save', async (ctx: CommandContext) => {
  await ctx.sessionStorage.saveSession(ctx.session);
  console.log(chalk.green('✓ 会话已保存'));
});

// /reset 命令
registerCommand('reset', (ctx: CommandContext) => {
  ctx.session.history = [];
  delete ctx.session.plan;
  ctx.session.planStack = [];
  console.log(chalk.green('✓ 会话已重置'));
});

// /skills 命令
registerCommand('skills', async () => {
  const skillManager = getSkillManager();
  const skills = await skillManager.listPublicSkills();
  console.log(chalk.cyan('\n可用技能:\n'));
  for (const skill of skills) {
    console.log(`  ${chalk.white(skill.name)}`);
  }
});

// /audit 命令
registerCommand('audit', (ctx: CommandContext) => {
  const { arg } = ctx;
  const auditLogger = getAuditLogger();
  
  if (arg === 'off') {
    auditLogger.setEnabled(false);
    console.log(chalk.green('✓ 已关闭审计日志'));
  } else if (arg === 'on') {
    auditLogger.setEnabled(true);
    console.log(chalk.green('✓ 已开启审计日志'));
  } else {
    const stats = auditLogger.getStats();
    console.log(chalk.cyan('审计统计:'));
    console.log(`  总调用次数: ${stats.totalCalls}`);
    console.log(`  成功率: ${(stats.successRate * 100).toFixed(1)}%`);
  }
});

// /confirm 命令
registerCommand('confirm', (ctx: CommandContext) => {
  const confirmationManager = getConfirmationManager();
  
  if (ctx.arg === 'off') {
    confirmationManager.updatePolicy({ mode: 'off' });
    console.log(chalk.green('✓ 已关闭操作确认'));
  } else if (ctx.arg === 'on' || ctx.arg === 'always') {
    confirmationManager.updatePolicy({ mode: 'always' });
    console.log(chalk.green('✓ 已开启所有操作确认'));
  } else {
    console.log(chalk.gray('用法: /confirm on | off | always'));
  }
});

// ============ 辅助函数 ============

/**
 * 打印帮助
 */
export function printHelp(): void {
  console.log(chalk.cyan('命令列表:'));
  console.log('  /help, /h, /?    显示帮助');
  console.log('  /exit, /quit, /q  退出');
  console.log('  /agent [name]    显示/切换当前 Agent');
  console.log('  /agents          列出所有 Agent');
  console.log('  /init-memory     初始化记忆系统');
  console.log('  /skills          显示技能');
  console.log('  /plan            查看任务规划');
  console.log('  /history         显示对话历史');
  console.log('  /memory stats    记忆系统统计');
  console.log('  /monitor         显示监控报告');
  console.log('  /audit [on/off]  审计日志管理');
  console.log('  /save            保存会话');
  console.log('  /reset           重置会话');
  console.log('  /clear           清屏');
}