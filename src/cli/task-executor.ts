/**
 * 复杂任务执行器
 * 
 * 负责复杂任务的计划执行、进度追踪和中断恢复
 */

import chalk from 'chalk';
import type { Session } from '../core/types.js';
import type { TaskPlan, TaskStep } from '../core/smart-task.js';
import { updateStepStatus, getNextPendingStep } from '../core/smart-task.js';
import { savePlanToSession } from './repl-plan.js';

// ============ 类型定义 ============

/**
 * 执行策略
 */
export type ExecutionStrategy = 'auto' | 'step-by-step' | 'guided';

/**
 * 执行状态
 */
export interface ExecutionState {
  /** 当前步骤索引 */
  currentStepIndex: number;
  /** 已完成步骤数 */
  completedSteps: number;
  /** 总步骤数 */
  totalSteps: number;
  /** 开始时间 */
  startTime: number;
  /** 最后活动时间 */
  lastActivityTime: number;
  /** 执行策略 */
  strategy: ExecutionStrategy;
  /** 是否暂停 */
  paused: boolean;
}

/**
 * 进度条选项
 */
export interface ProgressBarOptions {
  /** 宽度 */
  width: number;
  /** 完成字符 */
  completeChar: string;
  /** 未完成字符 */
  incompleteChar: string;
  /** 显示百分比 */
  showPercent: boolean;
  /** 显示 ETA */
  showEta: boolean;
}

// ============ 进度显示 ============

/**
 * 显示进度条
 */
export function showProgressBar(
  completed: number,
  total: number,
  options: Partial<ProgressBarOptions> = {}
): string {
  const {
    width = 30,
    completeChar = '█',
    incompleteChar = '░',
    showPercent = true,
  } = options;
  
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const filled = Math.round((completed / total) * width);
  const empty = width - filled;
  
  const bar = completeChar.repeat(filled) + incompleteChar.repeat(empty);
  
  let result = `[${bar}] ${completed}/${total}`;
  if (showPercent) {
    result += ` (${percent}%)`;
  }
  
  return result;
}

/**
 * 显示任务进度
 */
export function showTaskProgress(
  plan: TaskPlan,
  executionState?: ExecutionState
): string {
  const lines: string[] = [];
  
  // 标题
  lines.push(chalk.cyan.bold(`\n📋 ${plan.title}`));
  
  // 进度条
  const completed = plan.steps.filter(s => s.status === 'completed').length;
  const total = plan.steps.length;
  lines.push(chalk.gray(showProgressBar(completed, total)));
  lines.push('');
  
  // 步骤列表
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]!;
    const statusIcon = getStepIcon(step.status);
    const statusColor = getStepColor(step.status);
    const isCurrent = step.status === 'in_progress';
    
    const prefix = isCurrent ? '→ ' : '  ';
    const stepText = `${prefix}${statusIcon} ${step.description}`;
    
    lines.push(statusColor(stepText));
    
    // 如果是当前步骤，显示更多细节
    if (isCurrent && step.result) {
      lines.push(chalk.gray(`     结果: ${step.result.slice(0, 50)}...`));
    }
  }
  
  // 执行时间
  if (executionState) {
    const elapsed = Math.round((Date.now() - executionState.startTime) / 1000);
    lines.push('');
    lines.push(chalk.gray(`⏱️  已用时: ${formatDuration(elapsed)}`));
  }
  
  return lines.join('\n');
}

/**
 * 获取步骤图标
 */
function getStepIcon(status: TaskStep['status']): string {
  switch (status) {
    case 'completed': return '✅';
    case 'in_progress': return '🔄';
    case 'failed': return '❌';
    case 'skipped': return '⏭️';
    default: return '⬜';
  }
}

/**
 * 获取步骤颜色
 */
function getStepColor(status: TaskStep['status']) {
  switch (status) {
    case 'completed': return chalk.green;
    case 'in_progress': return chalk.yellow;
    case 'failed': return chalk.red;
    case 'skipped': return chalk.gray;
    default: return chalk.white;
  }
}

/**
 * 格式化持续时间
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}分${secs}秒`;
}

// ============ 步骤执行提示 ============

/**
 * 构建下一步执行提示
 */
export function buildNextStepPrompt(
  plan: TaskPlan,
  lastToolResult?: { success: boolean; content?: string }
): string {
  const nextStep = getNextPendingStep(plan);
  
  if (!nextStep) {
    return '所有步骤已完成。请总结任务执行结果。';
  }
  
  const completedCount = plan.steps.filter(s => s.status === 'completed').length;
  const totalCount = plan.steps.length;
  
  const lines: string[] = [];
  
  // 进度
  lines.push(`\n当前进度: ${completedCount}/${totalCount} 步骤已完成`);
  lines.push(showProgressBar(completedCount, totalCount));
  lines.push('');
  
  // 上一步结果
  if (lastToolResult) {
    if (lastToolResult.success) {
      lines.push('✓ 上一步执行成功');
    } else {
      lines.push('⚠️ 上一步执行失败，请处理或跳过');
    }
  }
  
  // 下一步提示
  lines.push('');
  lines.push(`📍 下一步: ${nextStep.description}`);
  lines.push('');
  lines.push('请使用可用工具完成这个步骤。完成后告诉我"继续"或"下一步"。');
  
  return lines.join('\n');
}

/**
 * 构建步骤完成确认
 */
export function buildStepCompletionPrompt(
  plan: TaskPlan,
  completedStep: TaskStep
): string {
  const nextStep = getNextPendingStep(plan);
  
  const lines: string[] = [];
  
  lines.push(`✓ 已完成: ${completedStep.description}`);
  
  if (nextStep) {
    lines.push('');
    lines.push(`下一步: ${nextStep.description}`);
    lines.push('');
    lines.push('输入"继续"执行下一步，或提出修改意见。');
  } else {
    lines.push('');
    lines.push('🎉 所有计划步骤已完成！');
    lines.push('');
    lines.push('请总结任务执行结果。');
  }
  
  return lines.join('\n');
}

// ============ 自动步骤推进 ============

/**
 * 检查并推进到下一步
 */
export function advanceToNextStep(
  plan: TaskPlan,
  session: Session
): { advanced: boolean; nextStep?: TaskStep; message?: string } {
  const currentStep = plan.steps.find(s => s.status === 'in_progress');
  
  // 如果当前有进行中的步骤，标记为完成
  if (currentStep) {
    updateStepStatus(plan, currentStep.id, 'completed');
    savePlanToSession(session, plan);
  }
  
  // 获取下一步
  const nextStep = getNextPendingStep(plan);
  
  if (nextStep) {
    updateStepStatus(plan, nextStep.id, 'in_progress');
    savePlanToSession(session, plan);
    
    return {
      advanced: true,
      nextStep,
      message: buildNextStepPrompt(plan),
    };
  }
  
  return {
    advanced: false,
    message: '所有步骤已完成。',
  };
}

/**
 * 标记步骤失败并询问处理方式
 */
export function handleStepFailure(
  plan: TaskPlan,
  step: TaskStep,
  error: string,
  session: Session
): { action: 'retry' | 'skip' | 'abort'; message: string } {
  updateStepStatus(plan, step.id, 'failed', error);
  savePlanToSession(session, plan);
  
  const message = `
❌ 步骤执行失败: ${step.description}
错误: ${error}

选择处理方式:
- 输入 "重试" 重新执行此步骤
- 输入 "跳过" 跳过此步骤继续
- 输入 "停止" 终止任务
`.trim();
  
  return {
    action: 'retry',  // 默认重试，实际由用户决定
    message,
  };
}

// ============ 执行状态管理 ============

/**
 * 创建执行状态
 */
export function createExecutionState(
  plan: TaskPlan,
  strategy: ExecutionStrategy = 'guided'
): ExecutionState {
  return {
    currentStepIndex: 0,
    completedSteps: 0,
    totalSteps: plan.steps.length,
    startTime: Date.now(),
    lastActivityTime: Date.now(),
    strategy,
    paused: false,
  };
}

/**
 * 更新执行状态
 */
export function updateExecutionState(
  state: ExecutionState,
  event: 'step_complete' | 'step_fail' | 'step_skip' | 'pause' | 'resume'
): void {
  state.lastActivityTime = Date.now();
  
  switch (event) {
    case 'step_complete':
      state.completedSteps++;
      state.currentStepIndex++;
      break;
    case 'step_fail':
    case 'step_skip':
      state.currentStepIndex++;
      break;
    case 'pause':
      state.paused = true;
      break;
    case 'resume':
      state.paused = false;
      break;
  }
}

// ============ 中断恢复 ============

/**
 * 检查是否有未完成的计划
 */
export function hasUnfinishedPlan(session: Session): boolean {
  return !!(session.plan && session.plan.steps.some(s => 
    s.status === 'pending' || s.status === 'in_progress'
  ));
}

/**
 * 构建恢复提示
 */
export function buildResumePrompt(plan: TaskPlan): string {
  const completed = plan.steps.filter(s => s.status === 'completed').length;
  const total = plan.steps.length;
  const inProgress = plan.steps.find(s => s.status === 'in_progress');
  
  const lines: string[] = [];
  
  lines.push(chalk.cyan('📋 检测到未完成的任务计划'));
  lines.push('');
  lines.push(`任务: ${plan.title}`);
  lines.push(`进度: ${completed}/${total}`);
  lines.push('');
  
  if (inProgress) {
    lines.push(`当前步骤: ${inProgress.description}`);
    lines.push('');
    lines.push('输入"继续"恢复执行，或"重新开始"从头开始。');
  } else {
    lines.push('输入"继续"执行下一步，或"重新开始"从头开始。');
  }
  
  return lines.join('\n');
}