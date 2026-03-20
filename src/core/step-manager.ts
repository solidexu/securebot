/**
 * 步骤管理器
 * 
 * 统一管理复杂任务的步骤推进、失败处理和状态更新
 * 解决步骤推进逻辑分散的问题
 */

import chalk from 'chalk';
import type { Session } from './types.js';
import type { TaskPlan, TaskStep } from './smart-task.js';
import { updateStepStatus, getNextPendingStep } from './smart-task.js';
import { savePlanToSession } from '../cli/repl-plan.js';

// ============ 类型定义 ============

/** 步骤推进结果 */
export interface StepAdvanceResult {
  /** 是否推进成功 */
  success: boolean;
  /** 推进后的步骤 */
  nextStep?: TaskStep;
  /** 是否所有步骤完成 */
  allCompleted: boolean;
  /** 消息 */
  message: string;
}

/** 步骤失败处理结果 */
export interface StepFailureResult {
  /** 处理动作 */
  action: 'retry' | 'skip' | 'abort';
  /** 步骤 */
  step: TaskStep;
  /** 消息 */
  message: string;
}

/** 步骤状态摘要 */
export interface StepSummary {
  total: number;
  completed: number;
  inProgress: number;
  failed: number;
  skipped: number;
  pending: number;
  progress: number;  // 0-100
}

// ============ 步骤管理器类 ============

/**
 * 步骤管理器
 * 
 * 统一管理步骤状态，提供原子操作
 */
export class StepManager {
  private plan: TaskPlan;
  private session: Session;
  
  constructor(plan: TaskPlan, session: Session) {
    this.plan = plan;
    this.session = session;
  }
  
  // ============ 状态查询 ============
  
  /**
   * 获取步骤状态摘要
   */
  getSummary(): StepSummary {
    const steps = this.plan.steps;
    const completed = steps.filter(s => s.status === 'completed').length;
    const inProgress = steps.filter(s => s.status === 'in_progress').length;
    const failed = steps.filter(s => s.status === 'failed').length;
    const skipped = steps.filter(s => s.status === 'skipped').length;
    const pending = steps.filter(s => s.status === 'pending').length;
    const total = steps.length;
    
    return {
      total,
      completed,
      inProgress,
      failed,
      skipped,
      pending,
      progress: total > 0 ? Math.round(((completed + skipped) / total) * 100) : 0,
    };
  }
  
  /**
   * 获取当前进行中的步骤
   */
  getCurrentStep(): TaskStep | null {
    return this.plan.steps.find(s => s.status === 'in_progress') ?? null;
  }
  
  /**
   * 获取下一个待执行步骤
   */
  getNextStep(): TaskStep | null {
    return getNextPendingStep(this.plan);
  }
  
  /**
   * 检查是否所有步骤完成
   */
  isAllCompleted(): boolean {
    return this.plan.steps.every(s => 
      s.status === 'completed' || s.status === 'skipped' || s.status === 'failed'
    );
  }
  
  /**
   * 检查是否有步骤失败
   */
  hasFailedSteps(): boolean {
    return this.plan.steps.some(s => s.status === 'failed');
  }
  
  /**
   * 获取失败的步骤
   */
  getFailedSteps(): TaskStep[] {
    return this.plan.steps.filter(s => s.status === 'failed');
  }
  
  // ============ 状态更新（原子操作） ============
  
  /**
   * 开始执行步骤
   * 
   * 将指定步骤标记为进行中
   */
  startStep(stepId: string): boolean {
    const step = this.plan.steps.find(s => s.id === stepId);
    if (!step || step.status !== 'pending') {
      return false;
    }
    
    updateStepStatus(this.plan, stepId, 'in_progress');
    this.save();
    return true;
  }
  
  /**
   * 完成当前步骤并推进到下一步
   * 
   * 原子操作：完成当前 → 推进下一步
   */
  advanceStep(result?: string): StepAdvanceResult {
    const currentStep = this.getCurrentStep();
    
    // 如果有进行中的步骤，标记为完成
    if (currentStep) {
      updateStepStatus(this.plan, currentStep.id, 'completed', result);
    }
    
    // 获取下一步
    const nextStep = this.getNextStep();
    
    if (nextStep) {
      updateStepStatus(this.plan, nextStep.id, 'in_progress');
      this.save();
      
      return {
        success: true,
        nextStep,
        allCompleted: false,
        message: this.formatAdvanceMessage(currentStep, nextStep),
      };
    }
    
    // 所有步骤完成
    this.save();
    return {
      success: true,
      allCompleted: true,
      message: this.formatCompletionMessage(),
    };
  }
  
  /**
   * 标记步骤失败
   * 
   * 只更新状态，不推进步骤
   */
  failStep(stepId: string, error: string): StepFailureResult {
    const step = this.plan.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`步骤不存在: ${stepId}`);
    }
    
    updateStepStatus(this.plan, stepId, 'failed', error);
    this.save();
    
    return {
      action: 'retry',  // 默认动作，实际由调用者决定
      step,
      message: this.formatFailureMessage(step, error),
    };
  }
  
  /**
   * 重试步骤
   * 
   * 将失败/进行中的步骤重置为待执行
   */
  retryStep(stepId: string): boolean {
    const step = this.plan.steps.find(s => s.id === stepId);
    if (!step) {
      return false;
    }
    
    // 只允许重试失败或进行中的步骤
    if (step.status !== 'failed' && step.status !== 'in_progress') {
      return false;
    }
    
    updateStepStatus(this.plan, stepId, 'pending');
    this.save();
    return true;
  }
  
  /**
   * 跳过步骤并推进到下一步
   * 
   * 原子操作：跳过当前 → 推进下一步
   */
  skipStep(stepId: string, reason?: string): StepAdvanceResult {
    const step = this.plan.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`步骤不存在: ${stepId}`);
    }
    
    updateStepStatus(this.plan, stepId, 'skipped', reason);
    
    // 获取下一步
    const nextStep = this.getNextStep();
    
    if (nextStep) {
      updateStepStatus(this.plan, nextStep.id, 'in_progress');
      this.save();
      
      return {
        success: true,
        nextStep,
        allCompleted: false,
        message: this.formatSkipMessage(step, nextStep),
      };
    }
    
    // 所有步骤处理完毕
    this.save();
    return {
      success: true,
      allCompleted: true,
      message: this.formatCompletionMessage(),
    };
  }
  
  // ============ 渲染辅助 ============
  
  /**
   * 渲染进度条
   */
  renderProgressBar(width: number = 30): string {
    const summary = this.getSummary();
    const filled = Math.round((summary.completed / summary.total) * width);
    const empty = width - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `[${bar}] ${summary.completed}/${summary.total} (${summary.progress}%)`;
  }
  
  /**
   * 渲染步骤列表
   */
  renderStepList(showAll: boolean = false): string {
    const lines: string[] = [];
    const summary = this.getSummary();
    
    lines.push(chalk.cyan.bold(`\n📋 ${this.plan.title}`));
    lines.push(chalk.gray(this.renderProgressBar()));
    lines.push('');
    
    const stepsToShow = showAll 
      ? this.plan.steps 
      : this.plan.steps.slice(0, 10);  // 默认只显示前10个
    
    for (const step of stepsToShow) {
      const icon = this.getStepIcon(step.status);
      const color = this.getStepColor(step.status);
      const prefix = step.status === 'in_progress' ? '→ ' : '  ';
      
      lines.push(color(`${prefix}${icon} ${step.description}`));
      
      // 显示失败原因
      if (step.status === 'failed' && step.error) {
        lines.push(chalk.red(`     错误: ${step.error.slice(0, 50)}`));
      }
    }
    
    if (!showAll && this.plan.steps.length > 10) {
      lines.push(chalk.gray(`  ... 还有 ${this.plan.steps.length - 10} 个步骤`));
    }
    
    return lines.join('\n');
  }
  
  // ============ 私有方法 ============
  
  private save(): void {
    savePlanToSession(this.session, this.plan);
  }
  
  private getStepIcon(status: TaskStep['status']): string {
    const icons: Record<TaskStep['status'], string> = {
      pending: '⬜',
      in_progress: '🔄',
      completed: '✅',
      failed: '❌',
      skipped: '⏭️',
    };
    return icons[status] ?? '⬜';
  }
  
  private getStepColor(status: TaskStep['status']): (text: string) => string {
    const colors: Record<TaskStep['status'], (text: string) => string> = {
      pending: chalk.gray,
      in_progress: chalk.yellow,
      completed: chalk.green,
      failed: chalk.red,
      skipped: chalk.gray,
    };
    return colors[status] ?? chalk.white;
  }
  
  private formatAdvanceMessage(completed: TaskStep | null, next: TaskStep): string {
    const lines: string[] = [];
    
    if (completed) {
      lines.push(chalk.green(`✓ 完成: ${completed.description}`));
    }
    
    lines.push(chalk.cyan(`📍 下一步: ${next.description}`));
    
    return lines.join('\n');
  }
  
  private formatCompletionMessage(): string {
    const summary = this.getSummary();
    const lines: string[] = [];
    
    lines.push(chalk.green.bold('\n✓ 任务完成'));
    lines.push(chalk.gray(this.renderProgressBar()));
    
    if (summary.skipped > 0) {
      lines.push(chalk.yellow(`  跳过: ${summary.skipped} 个步骤`));
    }
    if (summary.failed > 0) {
      lines.push(chalk.red(`  失败: ${summary.failed} 个步骤`));
    }
    
    return lines.join('\n');
  }
  
  private formatFailureMessage(step: TaskStep, error: string): string {
    return [
      chalk.red(`❌ 步骤失败: ${step.description}`),
      chalk.yellow(`原因: ${error}`),
      '',
      chalk.cyan('选择处理方式:'),
      chalk.gray('  r - 重试当前步骤'),
      chalk.gray('  s - 跳过并继续'),
      chalk.gray('  q - 停止任务'),
    ].join('\n');
  }
  
  private formatSkipMessage(skipped: TaskStep, next: TaskStep): string {
    return [
      chalk.yellow(`⏭️ 跳过: ${skipped.description}`),
      chalk.cyan(`📍 下一步: ${next.description}`),
    ].join('\n');
  }
}

// ============ 全局工厂函数 ============

/**
 * 创建步骤管理器
 */
export function createStepManager(plan: TaskPlan, session: Session): StepManager {
  return new StepManager(plan, session);
}

/**
 * 快速获取步骤摘要（不需要创建管理器实例）
 */
export function getStepSummary(plan: TaskPlan): StepSummary {
  const steps = plan.steps;
  const completed = steps.filter(s => s.status === 'completed').length;
  const inProgress = steps.filter(s => s.status === 'in_progress').length;
  const failed = steps.filter(s => s.status === 'failed').length;
  const skipped = steps.filter(s => s.status === 'skipped').length;
  const pending = steps.filter(s => s.status === 'pending').length;
  const total = steps.length;
  
  return {
    total,
    completed,
    inProgress,
    failed,
    skipped,
    pending,
    progress: total > 0 ? Math.round(((completed + skipped) / total) * 100) : 0,
  };
}