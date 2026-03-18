/**
 * 消息格式化模块
 * 
 * 提供彩色输出和上下文感知提示
 */

import chalk from 'chalk';
import type { TaskPlan } from '../core/smart-task.js';

// 消息类型
export type MessageType = 
  | 'success' 
  | 'error' 
  | 'warning' 
  | 'info' 
  | 'hint' 
  | 'progress'
  | 'plan'
  | 'tool'
  | 'agent';

/**
 * 格式化消息
 */
export class MessageFormatter {
  /**
   * 成功消息
   */
  static success(message: string): string {
    return chalk.green('✓ ') + message;
  }
  
  /**
   * 错误消息
   */
  static error(message: string): string {
    return chalk.red('✗ ') + message;
  }
  
  /**
   * 警告消息
   */
  static warning(message: string): string {
    return chalk.yellow('⚠ ') + message;
  }
  
  /**
   * 信息消息
   */
  static info(message: string): string {
    return chalk.blue('ℹ ') + message;
  }
  
  /**
   * 提示消息
   */
  static hint(message: string): string {
    return chalk.gray('💡 ') + chalk.gray(message);
  }
  
  /**
   * 进度消息
   */
  static progress(message: string, current?: number, total?: number): string {
    if (current !== undefined && total !== undefined) {
      const percent = Math.floor((current / total) * 100);
      return chalk.cyan('▶ ') + message + ' ' + chalk.gray(`[${current}/${total}]`) + ' ' + chalk.bold(`${percent}%`);
    }
    return chalk.cyan('▶ ') + message;
  }
  
  /**
   * 计划消息
   */
  static plan(title: string, steps: string[]): string {
    const lines = [
      chalk.cyan('┌─────────────────────────────────────┐'),
      chalk.cyan('│') + chalk.white.bold(` 📋 ${title}`).padEnd(38) + chalk.cyan('│'),
      chalk.cyan('├─────────────────────────────────────┤'),
    ];
    
    for (const step of steps) {
      lines.push(chalk.cyan('│') + ' ' + chalk.white('○ ' + step).slice(0, 37).padEnd(37) + chalk.cyan('│'));
    }
    
    lines.push(chalk.cyan('└─────────────────────────────────────┘'));
    
    return lines.join('\n');
  }
  
  /**
   * 工具调用消息
   */
  static tool(toolName: string, status: 'calling' | 'success' | 'error'): string {
    switch (status) {
      case 'calling':
        return chalk.blue('🔧 调用工具: ') + chalk.cyan(toolName);
      case 'success':
        return chalk.green('✓ ') + chalk.gray(toolName);
      case 'error':
        return chalk.red('✗ ') + chalk.gray(toolName);
    }
  }
  
  /**
   * Agent 消息
   */
  static agent(agentName: string, message: string): string {
    return '\n' + chalk.cyan(`[${agentName}]`) + ' ' + message;
  }
  
  /**
   * 分隔线
   */
  static separator(): string {
    return chalk.gray('─'.repeat(40));
  }
  
  /**
   * 标题
   */
  static title(text: string): string {
    return '\n' + chalk.cyan.bold(text) + '\n';
  }
  
  /**
   * 子标题
   */
  static subtitle(text: string): string {
    return chalk.white.bold(text);
  }
  
  /**
   * 列表项
   */
  static listItem(text: string, indent = 0): string {
    return ' '.repeat(indent) + chalk.gray('• ') + text;
  }
  
  /**
   * 代码块
   */
  static codeBlock(code: string, language?: string): string {
    const lines = code.split('\n');
    const formatted = lines.map(line => chalk.gray('  ') + line).join('\n');
    return '\n' + (language ? chalk.gray(`[${language}]`) + '\n' : '') + formatted + '\n';
  }
}

/**
 * 上下文感知提示
 */
export class ContextualHints {
  private static readonly HINTS = {
    // 命令提示
    commands: [
      { trigger: ['错误', '失败', 'err'], hint: '使用 /errors 查看详细错误日志' },
      { trigger: ['慢', '慢', '性能'], hint: '使用 /perf 查看性能报告' },
      { trigger: ['记忆', '记忆'], hint: '使用 /memory 管理记忆系统' },
      { trigger: ['计划', '任务'], hint: '使用 /plan 管理任务计划' },
      { trigger: ['技能', 'skill'], hint: '使用 /skills 查看可用技能' },
      { trigger: ['重置', '清除'], hint: '使用 /reset 重置会话' },
      { trigger: ['历史', '历史'], hint: '使用 /history 查看对话历史' },
      { trigger: ['保存', '导出'], hint: '使用 /export 导出会话' },
      { trigger: ['agent', '助手'], hint: '使用 /agent 切换 Agent' },
      { trigger: ['帮助', 'help'], hint: '使用 /help 查看所有命令' },
    ],
    
    // 操作建议
    suggestions: [
      { trigger: ['继续', '继续'], suggestion: '输入"继续"执行下一步' },
      { trigger: ['确认', '确认'], suggestion: '输入"执行"或"开始"确认计划' },
      { trigger: ['取消', '取消'], suggestion: '输入"取消"或开始新话题' },
    ],
  };
  
  /**
   * 根据消息内容获取提示
   */
  static getHint(message: string): string | null {
    const lowerMessage = message.toLowerCase();
    
    // 检查命令提示
    for (const { trigger, hint } of this.HINTS.commands) {
      if (trigger.some(t => lowerMessage.includes(t.toLowerCase()))) {
        return MessageFormatter.hint(hint);
      }
    }
    
    return null;
  }
  
  /**
   * 根据上下文获取建议
   */
  static getSuggestion(context: 'plan-generated' | 'task-complete' | 'error' | 'waiting'): string | null {
    switch (context) {
      case 'plan-generated':
        return MessageFormatter.hint('输入"执行"开始执行，或"修改"调整计划');
      case 'task-complete':
        return MessageFormatter.hint('输入新任务继续对话，或 /reset 开始新会话');
      case 'error':
        return MessageFormatter.hint('使用 /errors 查看详细错误，或 /reset 重置会话');
      case 'waiting':
        return MessageFormatter.hint('输入消息继续对话');
    }
  }
  
  /**
   * 根据历史输入推荐命令
   */
  static recommendCommand(history: string[]): string | null {
    // 检查最近的输入
    const recent = history.slice(-5).join(' ').toLowerCase();
    
    // 如果用户经常使用某个功能，推荐相关命令
    if (recent.includes('文件') || recent.includes('写入')) {
      return MessageFormatter.hint('提示: /audit 查看文件操作审计日志');
    }
    
    if (recent.includes('模型') || recent.includes('ollama')) {
      return MessageFormatter.hint('提示: /models 查看可用模型');
    }
    
    return null;
  }
}

/**
 * 格式化工具调用结果
 */
export function formatToolResult(
  toolName: string,
  success: boolean,
  result?: string,
  duration?: number
): string {
  const lines: string[] = [];
  
  // 工具名称和状态
  const status = success ? chalk.green('✓') : chalk.red('✗');
  const durationStr = duration ? chalk.gray(` (${duration}ms)`) : '';
  lines.push(`${status} ${chalk.cyan(toolName)}${durationStr}`);
  
  // 结果预览
  if (result) {
    const preview = result.length > 200 ? result.slice(0, 200) + '...' : result;
    lines.push(chalk.gray('  ' + preview.split('\n').join('\n  ')));
  }
  
  return lines.join('\n');
}

/**
 * 格式化任务进度
 */
export function formatTaskProgress(plan: TaskPlan): string {
  const completed = plan.steps.filter(s => s.status === 'completed').length;
  const total = plan.steps.length;
  const percent = Math.floor((completed / total) * 100);
  
  const lines: string[] = [
    MessageFormatter.title(`📋 ${plan.title}`),
  ];
  
  for (const step of plan.steps) {
    let status: string;
    switch (step.status) {
      case 'completed':
        status = chalk.green('✓');
        break;
      case 'in_progress':
        status = chalk.cyan('▶');
        break;
      case 'failed':
        status = chalk.red('✗');
        break;
      default:
        status = chalk.gray('○');
    }
    lines.push(`  ${status} ${step.description}`);
  }
  
  lines.push('');
  lines.push(chalk.gray(`进度: ${completed}/${total} (${percent}%)`));
  
  return lines.join('\n');
}