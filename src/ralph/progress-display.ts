/**
 * Ralph 进度显示组件
 * 
 * 提供实时进度条和状态显示
 */

import chalk from 'chalk';
import type { RalphPRD, RalphStory } from './types.js';

// ============ 进度条 ============

/**
 * 渲染进度条
 */
export function renderProgressBar(
  current: number,
  total: number,
  width: number = 20
): string {
  const percent = total > 0 ? (current / total) * 100 : 0;
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percentStr = percent.toFixed(0).padStart(3, ' ');
  
  return `${bar} ${percentStr}%`;
}

/**
 * 渲染任务状态图标
 */
export function renderStatusIcon(
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
): string {
  const icons = {
    pending: chalk.gray('○'),
    running: chalk.cyan('◉'),
    completed: chalk.green('✓'),
    failed: chalk.red('✗'),
    skipped: chalk.yellow('⊘'),
  };
  return icons[status];
}

/**
 * 渲染单个任务行
 */
export function renderTaskLine(
  story: RalphStory,
  isCurrent: boolean = false
): string {
  const icon = renderStatusIcon(story.passes ? 'completed' : 'pending');
  const prefix = isCurrent ? chalk.cyan('→ ') : '  ';
  const title = isCurrent ? chalk.white(story.title) : chalk.gray(story.title);
  
  return `${prefix}${icon} ${story.id}: ${title}`;
}

/**
 * 渲染完整任务列表
 */
export function renderTaskList(
  prd: RalphPRD,
  currentTaskId?: string
): string {
  const lines: string[] = [];
  const total = prd.userStories.length;
  const completed = prd.userStories.filter(s => s.passes).length;
  
  // 进度条
  lines.push(chalk.cyan.bold('📊 总进度'));
  lines.push(`  ${renderProgressBar(completed, total)}  ${completed}/${total} 任务`);
  lines.push('');
  
  // 任务列表
  lines.push(chalk.cyan.bold('📋 任务列表'));
  for (const story of prd.userStories) {
    const isCurrent = story.id === currentTaskId;
    lines.push(renderTaskLine(story, isCurrent));
  }
  
  return lines.join('\n');
}

// ============ 实时状态显示 ============

/**
 * 进度状态管理器
 */
export class ProgressDisplay {
  private startTime: number = 0;
  
  constructor() {
    this.startTime = Date.now();
  }
  
  /**
   * 开始新任务
   */
  startTask(taskId: string, taskTitle: string, iteration: number, maxIterations: number): void {
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    
    console.log('');
    console.log(chalk.cyan.bold(`═══ 迭代 ${iteration}/${maxIterations} ═══`));
    console.log(chalk.white(`📋 任务: ${taskId} - ${taskTitle}`));
    console.log(chalk.gray(`⏱️ 已运行: ${elapsed}秒`));
    console.log('');
  }
  
  /**
   * 更新工具调用状态
   */
  updateToolStatus(toolName: string, status: 'calling' | 'success' | 'error', message?: string): void {
    switch (status) {
      case 'calling':
        console.log(chalk.blue(`  → ${toolName}...`));
        break;
      case 'success':
        console.log(chalk.green(`  ✓ ${toolName}`) + (message ? chalk.gray(`: ${message.slice(0, 50)}...`) : ''));
        break;
      case 'error':
        console.log(chalk.red(`  ✗ ${toolName}`) + (message ? chalk.gray(`: ${message}`) : ''));
        break;
    }
  }
  
  /**
   * 完成任务
   */
  completeTask(success: boolean, message?: string): void {
    if (success) {
      console.log(chalk.green.bold('\n✓ 任务完成'));
    } else {
      console.log(chalk.yellow.bold('\n⚠ 任务未完成'));
      if (message) {
        console.log(chalk.gray(`  原因: ${message}`));
      }
    }
  }
  
  /**
   * 显示整体进度
   */
  showOverallProgress(prd: RalphPRD): void {
    const completed = prd.userStories.filter(s => s.passes).length;
    const total = prd.userStories.length;
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    
    console.log('');
    console.log(chalk.cyan('📊 总进度'));
    console.log(`  ${renderProgressBar(completed, total)}  ${completed}/${total}`);
    console.log(chalk.gray(`  ⏱️ 总耗时: ${elapsed}秒`));
    console.log('');
  }
  
  /**
   * 显示完成摘要
   */
  showCompletionSummary(
    success: boolean,
    iterations: number,
    completedStories: number,
    totalStories: number,
    duration: number
  ): void {
    console.log('');
    console.log('═'.repeat(40));
    
    if (success) {
      console.log(chalk.green.bold('\n  🎉 Ralph Loop 完成！\n'));
    } else {
      console.log(chalk.yellow.bold('\n  ⚠️ Ralph Loop 结束\n'));
    }
    
    console.log(chalk.white('  统计信息:'));
    console.log(chalk.gray(`  ├─ 迭代次数: ${iterations}`));
    console.log(chalk.gray(`  ├─ 完成任务: ${completedStories}/${totalStories}`));
    console.log(chalk.gray(`  └─ 总耗时: ${duration}秒`));
    console.log('');
    console.log('═'.repeat(40));
    console.log('');
  }
}

// ============ 动画效果 ============

/**
 * 简单的加载动画
 */
export class LoadingAnimation {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private frameIndex = 0;
  private interval: NodeJS.Timeout | null = null;
  
  start(message: string = '处理中'): void {
    this.interval = setInterval(() => {
      const frame = this.frames[this.frameIndex];
      process.stdout.write(`\r${chalk.cyan(frame)} ${message}...`);
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, 80);
  }
  
  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (finalMessage) {
      process.stdout.write(`\r${finalMessage}\n`);
    } else {
      process.stdout.write('\r' + ' '.repeat(50) + '\r');
    }
  }
}