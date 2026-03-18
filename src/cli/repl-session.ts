/**
 * REPL 会话模块
 * 
 * 会话持久化和确认对话框
 */

import * as readlinePromises from 'node:readline/promises';
import chalk from 'chalk';
import type { Agent } from '../core/types.js';
import { getSessionStorage } from '../core/session-storage.js';
import { getOrCreateMainSession } from '../core/agent.js';
import type { ConfirmationRequest } from '../core/confirmation.js';

// ============ 会话持久化 ============

/**
 * 加载持久化的会话
 */
export async function loadPersistedSessions(
  agents: Map<string, Agent>,
  sessionStorage: ReturnType<typeof getSessionStorage>
): Promise<number> {
  let loaded = 0;
  
  for (const [agentId, agent] of agents) {
    const sessionKey = `agent:${agentId}:main`;
    const session = await sessionStorage.loadSession(sessionKey);
    
    if (session && session.history.length > 0) {
      // 将加载的会话添加到 agent
      agent.sessions.set(sessionKey, session);
      loaded++;
    }
  }
  
  return loaded;
}

/**
 * 保存所有会话
 */
export async function saveAllSessions(
  agents: Map<string, Agent>,
  sessionStorage: ReturnType<typeof getSessionStorage>
): Promise<number> {
  let saved = 0;
  
  for (const agent of agents.values()) {
    for (const session of agent.sessions.values()) {
      if (session.history.length > 0) {
        await sessionStorage.saveSession(session);
        saved++;
      }
    }
  }
  
  return saved;
}

/**
 * 保存单个 Agent 的会话
 */
export async function saveAgentSession(
  agent: Agent,
  sessionStorage: ReturnType<typeof getSessionStorage>
): Promise<void> {
  const session = getOrCreateMainSession(agent);
  if (session.history.length > 0) {
    await sessionStorage.saveSession(session);
  }
}

// ============ 确认对话框 ============

/**
 * 显示确认对话框
 */
export async function showConfirmationDialog(
  request: ConfirmationRequest,
  rl: readlinePromises.Interface
): Promise<{ confirmed: boolean; remember?: boolean; rememberScope?: 'tool' | 'pattern' }> {
  console.log();
  console.log(chalk.yellow.bold('⚠️  敏感操作确认'));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(chalk.cyan(`工具: ${request.tool}`));
  console.log(chalk.white(request.message));
  
  if (request.risk) {
    console.log(chalk.yellow(`风险: ${request.risk}`));
  }
  
  if (request.suggestions && request.suggestions.length > 0) {
    console.log(chalk.gray('建议:'));
    for (const suggestion of request.suggestions) {
      console.log(chalk.gray(`  • ${suggestion}`));
    }
  }
  
  console.log(chalk.gray('─'.repeat(40)));
  
  const levelEmoji: Record<string, string> = {
    safe: '✅',
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    critical: '🔴',
  };
  
  const emoji = levelEmoji[request.level] ?? '❓';
  console.log(chalk.gray(`敏感级别: ${emoji} ${request.level.toUpperCase()}`));
  console.log();
  
  // 询问用户
  console.log(chalk.cyan('请选择:'));
  console.log(chalk.white('  y = 本次确认'));
  console.log(chalk.white('  N = 拒绝执行（默认）'));
  console.log(chalk.white('  a = 总是允许此工具的所有操作'));
  // 如果有路径参数，显示目录选项
  if (request.params['path']) {
    console.log(chalk.white('  p = 总是允许此目录的操作'));
  }
  console.log();
  
  const answer = await rl.question(
    chalk.cyan('确认执行? [y/N/a] ')
  );
  
  const input = answer.trim().toLowerCase();
  
  if (input === 'y' || input === 'yes') {
    return { confirmed: true };
  }
  
  if (input === 'a' || input === 'always') {
    return { confirmed: true, remember: true, rememberScope: 'tool' };
  }
  
  if (input === 'p' && request.params['path']) {
    return { confirmed: true, remember: true, rememberScope: 'pattern' };
  }
  
  console.log(chalk.red('✗ 操作已取消'));
  return { confirmed: false };
}

// ============ 辅助函数 ============

/**
 * 格式化回复内容
 */
export function formatResponse(content: string): string {
  if (!content) return '(无回复)';
  return content
    .split('\n')
    .map(line => `  ${line}`)
    .join('\n');
}