import chalk from 'chalk';
import * as readlinePromises from 'node:readline/promises';
import { CollaborationSessionManager } from './collaboration-session-manager.js';
import type { DelegationRequest } from '../core/collaboration.js';

export interface CollaborationSessionOptions {
  delegation: DelegationRequest;
  state: any;
  rl: readlinePromises.Interface;
  collaborationManager: any;
}

export async function startCollaborationSession(
  options: CollaborationSessionOptions
): Promise<boolean> {
  const { delegation, state, rl, collaborationManager } = options;
  
  const sessionManager = new CollaborationSessionManager();
  const isDelegator = delegation.delegator === state.currentAgentId;
  let shouldRefresh = false;
  let running = true;

  // 启动文件监听
  const dataDir = '/home/' + require('os').homedir().split('/').pop() + '/.securebot/collaboration';
  sessionManager.startWatching(delegation.id, dataDir);

  // 文件变化监听
  sessionManager.on('fileChanged', async () => {
    // 触发刷新（在下一轮循环中）
    shouldRefresh = true;
  });

  try {
    while (running) {
      // 如果需要刷新，重新加载任务数据
      if (shouldRefresh) {
        const updated = collaborationManager.getDelegationManager()
          .getDelegations(state.currentAgentId, undefined, true)
          .find((d: DelegationRequest) => d.id === delegation.id);
        
        if (updated) {
          Object.assign(delegation, updated);
        }
        shouldRefresh = false;
      }

      console.clear();
      renderSessionHeader(delegation, isDelegator, sessionManager);
      renderConversation(delegation, isDelegator);
      
      const actions = getAvailableActions(delegation, isDelegator, sessionManager);
      renderActions(actions, delegation);
      
      const answer = await rl.question(chalk.yellow('\n请选择: '));
      
      const action = actions.find(a => a.key === answer.toLowerCase());
      if (action) {
        const result = await action.handler();
        if (result === 'exit') {
          running = false;
        } else if (result === 'refresh') {
          shouldRefresh = true;
        }
      }
    }
  } finally {
    sessionManager.cleanup();
  }

  return shouldRefresh;
}

function renderSessionHeader(
  delegation: DelegationRequest,
  isDelegator: boolean,
  sessionManager: CollaborationSessionManager
): void {
  console.log(chalk.cyan.bold('\n💬 协作会话'));
  console.log(chalk.cyan.bold('═'.repeat(70)));
  
  const otherParty = isDelegator ? delegation.delegatee : delegation.delegator;
  const roleText = isDelegator ? '委托者' : '被委托者';
  
  console.log(chalk.white(`任务: ${delegation.task}`));
  console.log(chalk.gray(`ID: ${delegation.id.slice(0, 8)} | 角色: ${roleText} | 对方: ${otherParty}`));
  console.log(chalk.white(`状态: ${getStatusText(delegation.status)} | 轮次: ${delegation.currentRound || 0}/${delegation.maxRounds || 5}`));
  
  // 紧急决策提示
  if (sessionManager.hasUrgentDecisions()) {
    console.log(chalk.red.bold('\n  ⚡⚡⚡ 有待处理的紧急决策！'));
  }
  
  console.log(chalk.cyan.bold('═'.repeat(70)));
}

function renderConversation(delegation: DelegationRequest, isDelegator: boolean): void {
  const history = delegation.conversationHistory || [];
  
  console.log(chalk.cyan('\n💬 协作对话:'));
  console.log(chalk.gray('─'.repeat(66)));
  
  if (history.length === 0) {
    console.log(chalk.gray('  (暂无对话记录)'));
    console.log(chalk.gray('  提示: 按 m 发送消息开始对话'));
  } else {
    const recentMessages = history.slice(-12);
    for (const msg of recentMessages) {
      renderMessage(msg, delegation, isDelegator);
    }
  }
  
  console.log(chalk.gray('─'.repeat(66)));
}

function renderMessage(msg: any, delegation: DelegationRequest, isDelegator: boolean): void {
  const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const senderName = msg.sender === delegation.delegator ? '委托者' :
                     msg.sender === delegation.delegatee ? '被委托者' :
                     msg.sender;
  
  let prefix = '';
  let color = chalk.white;
  
  switch (msg.type) {
    case 'system':
      prefix = '[系统]';
      color = chalk.gray;
      break;
    case 'tool_call':
      prefix = '[工具调用]';
      color = chalk.yellow;
      break;
    case 'tool_result':
      prefix = '[工具结果]';
      color = chalk.green;
      break;
    case 'execution_log':
      prefix = '[执行]';
      color = chalk.blue;
      break;
    case 'decision_request':
      prefix = '⚡[决策]';
      color = chalk.red.bold;
      break;
    default:
      prefix = `[${senderName}]`;
      color = msg.sender === delegation.delegator ? chalk.magenta : chalk.cyan;
  }
  
  const content = msg.content.length > 80 ? msg.content.slice(0, 80) + '...' : msg.content;
  
  console.log(color(`  ${prefix} ${time}`));
  console.log(color(`    ${content}`));
}

function getAvailableActions(
  delegation: DelegationRequest,
  isDelegator: boolean,
  sessionManager: CollaborationSessionManager
): Array<{ key: string; label: string; handler: () => Promise<'exit' | 'refresh' | 'none'> }> {
  const actions: Array<{ key: string; label: string; handler: () => Promise<'exit' | 'refresh' | 'none'> }> = [];
  
  // 发送消息（始终可用）
  actions.push({
    key: 'm',
    label: '发送消息',
    handler: async () => {
      return 'none'; // 实际实现在主函数中
    }
  });
  
  // 接受任务（被委托者 + pending）
  if (!isDelegator && delegation.status === 'pending') {
    actions.push({
      key: 'a',
      label: '接受任务',
      handler: async () => {
        return 'none';
      }
    });
  }
  
  // 验收任务（委托者 + pending_review）
  if (isDelegator && delegation.status === 'pending_review') {
    actions.push({
      key: 'r',
      label: '验收任务',
      handler: async () => 'none'
    });
  }
  
  // 查看工作空间
  if (delegation.sharedWorkspace) {
    actions.push({
      key: 'w',
      label: '查看工作空间',
      handler: async () => 'none'
    });
  }
  
  // 退出
  actions.push({
    key: 'q',
    label: '退出会话',
    handler: async () => 'exit'
  });
  
  return actions;
}

function renderActions(actions: any[], delegation: DelegationRequest): void {
  console.log(chalk.yellow('\n操作选项:'));
  actions.forEach((action, i) => {
    const separator = i < actions.length - 1 ? ' | ' : '';
    console.log(chalk.white(`  ${action.key}. ${action.label}${separator}`));
  });
}

function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    'pending': '⏸ 待接受',
    'accepted': '✓ 已接受',
    'in_progress': '🔄 执行中',
    'pending_review': '⏳ 待验收',
    'completed': '✅ 已完成',
    'failed': '❌ 已失败',
    'rejected': '✗ 已拒绝'
  };
  return statusMap[status] || status;
}