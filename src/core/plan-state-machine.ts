/**
 * 任务计划状态机
 * 
 * 管理计划执行过程中的状态转换，确保状态流转合法
 * 解决状态混乱、步骤重复完成等问题
 */

import chalk from 'chalk';
import type { TaskPlan, TaskStep } from './smart-task.js';
import type { Session } from './types.js';
import { updateStepStatus, getNextPendingStep } from './smart-task.js';
import { savePlanToSession } from '../cli/repl-plan.js';

// ============ 状态定义 ============

/**
 * 计划级别状态
 */
export type PlanState = 
  | 'idle'        // 空闲，无计划
  | 'planning'    // 规划中，等待用户确认
  | 'ready'       // 计划已确认，准备执行
  | 'executing'   // 执行中
  | 'paused'      // 暂停（等待用户输入）
  | 'completed'   // 所有步骤完成
  | 'failed'      // 任务失败
  | 'cancelled';  // 用户取消

/**
 * 步骤级别状态
 */
export type StepState = TaskStep['status'];

/**
 * 状态转换事件
 */
export type StateEvent = 
  | 'create_plan'      // 创建计划
  | 'confirm_plan'     // 确认计划
  | 'start_step'       // 开始步骤
  | 'complete_step'    // 完成步骤
  | 'fail_step'        // 步骤失败
  | 'retry_step'       // 重试步骤
  | 'skip_step'        // 跳过步骤
  | 'pause'            // 暂停
  | 'resume'           // 恢复
  | 'cancel'           // 取消
  | 'complete_all';    // 所有完成

/**
 * 状态转换结果
 */
export interface TransitionResult {
  success: boolean;
  fromState: PlanState;
  toState: PlanState;
  message?: string;
  error?: string;
}

// ============ 状态机类 ============

/**
 * 任务计划状态机
 * 
 * 核心职责：
 * 1. 管理计划级别的状态转换
 * 2. 验证状态转换的合法性
 * 3. 记录状态历史
 * 4. 提供状态查询接口
 */
export class TaskPlanStateMachine {
  private plan: TaskPlan | null = null;
  private session: Session;
  private state: PlanState = 'idle';
  private stateHistory: Array<{ state: PlanState; timestamp: number; event?: StateEvent }> = [];
  private currentStepIndex: number = -1;
  
  /**
   * 状态转换规则
   * 定义从每个状态可以转换到哪些状态
   */
  private transitions: Record<PlanState, PlanState[]> = {
    idle: ['planning'],
    planning: ['ready', 'cancelled', 'idle'],
    ready: ['executing', 'cancelled', 'idle'],
    executing: ['executing', 'paused', 'completed', 'failed', 'cancelled'],
    paused: ['executing', 'cancelled', 'failed'],
    completed: ['idle'],
    failed: ['executing', 'idle'],
    cancelled: ['idle'],
  };
  
  /**
   * 事件触发的状态转换
   */
  private eventTransitions: Record<StateEvent, { from: PlanState[]; to: PlanState }> = {
    create_plan: { from: ['idle'], to: 'planning' },
    confirm_plan: { from: ['planning'], to: 'ready' },
    start_step: { from: ['ready', 'executing', 'paused'], to: 'executing' },
    complete_step: { from: ['executing'], to: 'executing' }, // 步骤完成可能还在执行
    fail_step: { from: ['executing', 'paused'], to: 'failed' },
    retry_step: { from: ['failed', 'paused'], to: 'executing' },
    skip_step: { from: ['executing', 'paused'], to: 'executing' },
    pause: { from: ['executing'], to: 'paused' },
    resume: { from: ['paused'], to: 'executing' },
    cancel: { from: ['planning', 'ready', 'executing', 'paused'], to: 'cancelled' },
    complete_all: { from: ['executing'], to: 'completed' },
  };
  
  constructor(session: Session) {
    this.session = session;
    
    // 从 session 恢复状态
    if (session.plan) {
      this.restoreFromSession();
    }
  }
  
  // ============ 状态查询 ============
  
  /**
   * 获取当前状态
   */
  getState(): PlanState {
    return this.state;
  }
  
  /**
   * 获取当前计划
   */
  getPlan(): TaskPlan | null {
    return this.plan;
  }
  
  /**
   * 获取当前步骤
   */
  getCurrentStep(): TaskStep | null {
    if (!this.plan || this.currentStepIndex < 0) {
      return null;
    }
    return this.plan.steps[this.currentStepIndex] ?? null;
  }
  
  /**
   * 获取状态历史
   */
  getStateHistory(): Array<{ state: PlanState; timestamp: number; event?: StateEvent }> {
    return [...this.stateHistory];
  }
  
  /**
   * 检查是否可以执行指定事件
   */
  canExecute(event: StateEvent): boolean {
    const transition = this.eventTransitions[event];
    return transition.from.includes(this.state);
  }
  
  /**
   * 检查是否可以转换到指定状态
   */
  canTransitionTo(targetState: PlanState): boolean {
    return this.transitions[this.state]?.includes(targetState) ?? false;
  }
  
  /**
   * 获取进度摘要
   */
  getProgressSummary(): {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    failed: number;
    skipped: number;
    percent: number;
  } {
    if (!this.plan) {
      return { total: 0, completed: 0, inProgress: 0, pending: 0, failed: 0, skipped: 0, percent: 0 };
    }
    
    const steps = this.plan.steps;
    const completed = steps.filter(s => s.status === 'completed').length;
    const inProgress = steps.filter(s => s.status === 'in_progress').length;
    const pending = steps.filter(s => s.status === 'pending').length;
    const failed = steps.filter(s => s.status === 'failed').length;
    const skipped = steps.filter(s => s.status === 'skipped').length;
    const total = steps.length;
    
    return {
      total,
      completed,
      inProgress,
      pending,
      failed,
      skipped,
      percent: total > 0 ? Math.round(((completed + skipped) / total) * 100) : 0,
    };
  }
  
  // ============ 状态转换 ============
  
  /**
   * 执行状态转换
   */
  transition(event: StateEvent, data?: { plan?: TaskPlan; stepIndex?: number; error?: string }): TransitionResult {
    const transition = this.eventTransitions[event];
    const fromState = this.state;
    
    // 验证转换合法性
    if (!transition.from.includes(fromState)) {
      return {
        success: false,
        fromState,
        toState: fromState,
        error: `事件 "${event}" 不能在状态 "${fromState}" 下执行`,
      };
    }
    
    const toState = transition.to;
    
    // 执行转换前的处理
    const preResult = this.preTransition(event, data);
    if (!preResult.success) {
      return {
        success: false,
        fromState,
        toState: fromState,
        error: preResult.error,
      };
    }
    
    // 更新状态
    this.state = toState;
    this.recordStateChange(fromState, toState, event);
    
    // 执行转换后的处理
    this.postTransition(event, data);
    
    return {
      success: true,
      fromState,
      toState,
      message: this.getTransitionMessage(event, fromState, toState),
    };
  }
  
  /**
   * 创建计划
   */
  createPlan(plan: TaskPlan): TransitionResult {
    const result = this.transition('create_plan', { plan });
    
    if (result.success) {
      this.plan = plan;
      this.currentStepIndex = -1;
      this.saveToSession();
    }
    
    return result;
  }
  
  /**
   * 确认计划
   */
  confirmPlan(): TransitionResult {
    const result = this.transition('confirm_plan');
    
    if (result.success && this.plan && this.plan.steps.length > 0) {
      // 将第一个步骤标记为 in_progress
      this.currentStepIndex = 0;
      updateStepStatus(this.plan, this.plan.steps[0]!.id, 'in_progress');
      this.saveToSession();
    }
    
    return result;
  }
  
  /**
   * 开始步骤
   */
  startStep(stepId: string): TransitionResult {
    if (!this.plan) {
      return {
        success: false,
        fromState: this.state,
        toState: this.state,
        error: '没有活动计划',
      };
    }
    
    const stepIndex = this.plan.steps.findIndex(s => s.id === stepId);
    if (stepIndex < 0) {
      return {
        success: false,
        fromState: this.state,
        toState: this.state,
        error: `步骤不存在: ${stepId}`,
      };
    }
    
    const step = this.plan.steps[stepIndex]!;
    
    // 验证步骤状态
    if (step.status !== 'pending' && step.status !== 'failed') {
      return {
        success: false,
        fromState: this.state,
        toState: this.state,
        error: `步骤状态不正确: ${step.status}，只能开始 pending 或 failed 的步骤`,
      };
    }
    
    // 执行状态转换
    const result = this.transition('start_step');
    
    if (result.success) {
      this.currentStepIndex = stepIndex;
      updateStepStatus(this.plan, stepId, 'in_progress');
      this.saveToSession();
    }
    
    return result;
  }
  
  /**
   * 完成当前步骤
   */
  completeStep(resultData?: string): TransitionResult {
    if (!this.plan) {
      return {
        success: false,
        fromState: this.state,
        toState: this.state,
        error: '没有活动计划',
      };
    }
    
    const currentStep = this.getCurrentStep();
    if (!currentStep) {
      return {
        success: false,
        fromState: this.state,
        toState: this.state,
        error: '没有进行中的步骤',
      };
    }
    
    // 验证步骤状态
    if (currentStep.status !== 'in_progress') {
      return {
        success: false,
        fromState: this.state,
        toState: this.state,
        error: `步骤状态不正确: ${currentStep.status}，只能完成 in_progress 的步骤`,
      };
    }
    
    // 标记步骤完成
    updateStepStatus(this.plan, currentStep.id, 'completed', resultData);
    
    // 检查是否有下一步
    const nextStep = getNextPendingStep(this.plan);
    
    if (nextStep) {
      // 还有下一步，保持在 executing 状态
      this.transition('complete_step');
      updateStepStatus(this.plan, nextStep.id, 'in_progress');
      this.currentStepIndex = this.plan.steps.findIndex(s => s.id === nextStep.id);
    } else {
      // 所有步骤完成
      this.transition('complete_all');
    }
    
    this.saveToSession();
    
    return {
      success: true,
      fromState: this.state,
      toState: this.state,
      message: nextStep 
        ? `步骤完成，下一步: ${nextStep.description}`
        : '所有步骤已完成',
    };
  }
  
  /**
   * 步骤失败
   */
  failStep(error: string): TransitionResult {
    if (!this.plan) {
      return {
        success: false,
        fromState: this.state,
        toState: this.state,
        error: '没有活动计划',
      };
    }
    
    const currentStep = this.getCurrentStep();
    if (!currentStep) {
      return {
        success: false,
        fromState: this.state,
        toState: this.state,
        error: '没有进行中的步骤',
      };
    }
    
    // 标记步骤失败
    updateStepStatus(this.plan, currentStep.id, 'failed', error);
    
    // 转换到失败状态
    const result = this.transition('fail_step');
    this.saveToSession();
    
    return result;
  }
  
  /**
   * 重试步骤
   */
  retryStep(stepId?: string): TransitionResult {
    if (!this.plan) {
      return {
        success: false,
        fromState: this.state,
        toState: this.state,
        error: '没有活动计划',
      };
    }
    
    // 找到要重试的步骤
    const step = stepId 
      ? this.plan.steps.find(s => s.id === stepId)
      : this.plan.steps.find(s => s.status === 'failed');
    
    if (!step) {
      return {
        success: false,
        fromState: this.state,
        toState: this.state,
        error: '没有可重试的步骤',
      };
    }
    
    if (step.status !== 'failed') {
      return {
        success: false,
        fromState: this.state,
        toState: this.state,
        error: `只能重试失败的步骤，当前状态: ${step.status}`,
      };
    }
    
    // 执行状态转换
    const result = this.transition('retry_step');
    
    if (result.success) {
      // 重置步骤状态
      updateStepStatus(this.plan, step.id, 'pending');
      this.currentStepIndex = this.plan.steps.findIndex(s => s.id === step.id);
      this.saveToSession();
    }
    
    return result;
  }
  
  /**
   * 跳过步骤
   */
  skipStep(stepId: string, reason?: string): TransitionResult {
    if (!this.plan) {
      return {
        success: false,
        fromState: this.state,
        toState: this.state,
        error: '没有活动计划',
      };
    }
    
    const step = this.plan.steps.find(s => s.id === stepId);
    if (!step) {
      return {
        success: false,
        fromState: this.state,
        toState: this.state,
        error: `步骤不存在: ${stepId}`,
      };
    }
    
    // 验证步骤状态
    if (step.status !== 'in_progress' && step.status !== 'failed') {
      return {
        success: false,
        fromState: this.state,
        toState: this.state,
        error: `只能跳过 in_progress 或 failed 的步骤`,
      };
    }
    
    // 标记跳过
    updateStepStatus(this.plan, stepId, 'skipped', reason);
    
    // 执行状态转换
    this.transition('skip_step');
    
    // 检查是否有下一步
    const nextStep = getNextPendingStep(this.plan);
    if (nextStep) {
      updateStepStatus(this.plan, nextStep.id, 'in_progress');
      this.currentStepIndex = this.plan.steps.findIndex(s => s.id === nextStep.id);
    } else {
      this.transition('complete_all');
    }
    
    this.saveToSession();
    
    return {
      success: true,
      fromState: this.state,
      toState: this.state,
    };
  }
  
  /**
   * 暂停
   */
  pause(): TransitionResult {
    return this.transition('pause');
  }
  
  /**
   * 恢复
   */
  resume(): TransitionResult {
    return this.transition('resume');
  }
  
  /**
   * 取消
   */
  cancel(): TransitionResult {
    const result = this.transition('cancel');
    
    if (result.success) {
      this.clearPlan();
    }
    
    return result;
  }
  
  /**
   * 重置
   */
  reset(): void {
    this.plan = null;
    this.state = 'idle';
    this.currentStepIndex = -1;
    this.stateHistory = [];
    this.clearPlan();
  }
  
  // ============ 私有方法 ============
  
  private preTransition(event: StateEvent, data?: { plan?: TaskPlan; stepIndex?: number }): { success: boolean; error?: string } {
    // 特殊验证
    switch (event) {
      case 'confirm_plan':
        if (!this.plan) {
          return { success: false, error: '没有计划可确认' };
        }
        break;
      case 'complete_step':
        if (!this.getCurrentStep()) {
          return { success: false, error: '没有进行中的步骤' };
        }
        break;
    }
    
    return { success: true };
  }
  
  private postTransition(event: StateEvent, data?: { plan?: TaskPlan; stepIndex?: number; error?: string }): void {
    // 转换后的处理
    switch (event) {
      case 'create_plan':
        if (data?.plan) {
          this.plan = data.plan;
        }
        break;
      case 'fail_step':
        if (data?.error && this.plan) {
          const step = this.getCurrentStep();
          if (step) {
            updateStepStatus(this.plan, step.id, 'failed', data.error);
          }
        }
        break;
    }
  }
  
  private recordStateChange(from: PlanState, to: PlanState, event: StateEvent): void {
    this.stateHistory.push({
      state: to,
      timestamp: Date.now(),
      event,
    });
    
    // 限制历史长度
    if (this.stateHistory.length > 50) {
      this.stateHistory = this.stateHistory.slice(-50);
    }
  }
  
  private getTransitionMessage(event: StateEvent, from: PlanState, to: PlanState): string {
    const messages: Record<StateEvent, string> = {
      create_plan: '计划已创建',
      confirm_plan: '计划已确认，开始执行',
      start_step: '步骤已开始',
      complete_step: '步骤已完成',
      fail_step: '步骤失败',
      retry_step: '步骤重试中',
      skip_step: '步骤已跳过',
      pause: '任务已暂停',
      resume: '任务已恢复',
      cancel: '任务已取消',
      complete_all: '所有步骤已完成',
    };
    
    return messages[event] ?? `状态从 ${from} 变更为 ${to}`;
  }
  
  private saveToSession(): void {
    if (this.plan) {
      savePlanToSession(this.session, this.plan);
    }
  }
  
  private clearPlan(): void {
    savePlanToSession(this.session, null);
  }
  
  private restoreFromSession(): void {
    if (!this.session.plan) return;
    
    // 恢复状态
    const hasPending = this.session.plan.steps.some(s => 
      s.status === 'pending' || s.status === 'in_progress'
    );
    const hasFailed = this.session.plan.steps.some(s => s.status === 'failed');
    const allCompleted = this.session.plan.steps.every(s => 
      s.status === 'completed' || s.status === 'skipped'
    );
    
    if (allCompleted) {
      this.state = 'completed';
    } else if (hasFailed) {
      this.state = 'failed';
    } else if (hasPending) {
      this.state = 'executing';
    }
    
    // 找到当前步骤
    const inProgressIndex = this.session.plan.steps.findIndex(s => s.status === 'in_progress');
    this.currentStepIndex = inProgressIndex >= 0 ? inProgressIndex : -1;
    
    this.recordStateChange('idle', this.state, 'create_plan');
  }
}

// ============ 工厂函数 ============

/**
 * 创建状态机实例
 */
export function createPlanStateMachine(session: Session): TaskPlanStateMachine {
  return new TaskPlanStateMachine(session);
}