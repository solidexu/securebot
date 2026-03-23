/**
 * Ralph 状态桥接模块
 * 
 * 实现 PRD 与 TaskPlan 的双向转换，使 Ralph Loop 可以
 * 与 Securebot 现有的任务系统无缝集成
 */

import type { TaskPlan, TaskStep } from '../core/smart-task.js';
import type { RalphPRD, RalphStory } from './types.js';

// ============ 类型映射 ============

/**
 * 将 RalphStory 的优先级数字转换为 TaskStep 的优先级枚举
 */
function mapPriority(priority: number): 'low' | 'medium' | 'high' {
  if (priority <= 1) return 'low';
  if (priority <= 3) return 'medium';
  return 'high';
}

/**
 * 将 TaskStep 的优先级枚举转换为数字
 */
function mapPriorityToNumber(priority?: 'low' | 'medium' | 'high'): number {
  switch (priority) {
    case 'low': return 1;
    case 'medium': return 2;
    case 'high': return 3;
    default: return 2;
  }
}

/**
 * 将 RalphStory 的 passes 状态转换为 TaskStep 的 status
 */
function mapPassesToStatus(passes: boolean): TaskStep['status'] {
  return passes ? 'completed' : 'pending';
}

/**
 * 将 TaskStep 的 status 转换为 passes 状态
 */
function mapStatusToPasses(status: TaskStep['status']): boolean {
  return status === 'completed';
}

// ============ PRD → TaskPlan 转换 ============

/**
 * 将 RalphStory 转换为 TaskStep
 */
export function storyToTaskStep(story: RalphStory): TaskStep {
  return {
    id: story.id,
    description: story.title,
    status: mapPassesToStatus(story.passes),
    result: story.notes,
    priority: mapPriority(story.priority),
  };
}

/**
 * 将 RalphPRD 转换为 TaskPlan
 */
export function prdToTaskPlan(prd: RalphPRD): TaskPlan {
  const now = new Date();
  
  return {
    title: prd.branchName,
    steps: prd.userStories.map(storyToTaskStep),
    createdAt: prd.createdAt ? new Date(prd.createdAt) : now,
    updatedAt: prd.updatedAt ? new Date(prd.updatedAt) : now,
    taskType: 'mixed',
    confidence: 1.0,
  };
}

// ============ TaskPlan → PRD 转换 ============

/**
 * 将 TaskStep 转换为 RalphStory
 */
export function taskStepToStory(step: TaskStep, _index: number): RalphStory {
  return {
    id: step.id,
    title: step.description,
    acceptanceCriteria: step.result ? [step.result] : [],
    priority: mapPriorityToNumber(step.priority),
    passes: mapStatusToPasses(step.status),
    notes: step.result,
  };
}

/**
 * 将 TaskPlan 转换为 RalphPRD
 */
export function taskPlanToPRD(plan: TaskPlan, branchName?: string): RalphPRD {
  const now = new Date().toISOString();
  
  return {
    branchName: branchName || plan.title,
    userStories: plan.steps.map((step, index) => taskStepToStory(step, index)),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: now,
  };
}

// ============ 状态同步 ============

/**
 * 将 PRD 的状态同步到现有的 TaskPlan
 * 
 * 用于：当 PRD 文件被外部修改时，更新内存中的 TaskPlan
 */
export function syncPRDToPlan(prd: RalphPRD, plan: TaskPlan): void {
  // 建立故事 ID 到故事的映射
  const storyMap = new Map<string, RalphStory>();
  for (const story of prd.userStories) {
    storyMap.set(story.id, story);
  }
  
  // 更新 TaskPlan 的步骤状态
  for (const step of plan.steps) {
    const story = storyMap.get(step.id);
    if (story) {
      step.status = mapPassesToStatus(story.passes);
      step.result = story.notes;
    }
  }
  
  plan.updatedAt = new Date();
}

/**
 * 将 TaskPlan 的状态同步到 PRD
 * 
 * 用于：当 TaskPlan 状态变化时，更新 PRD 文件
 */
export function syncPlanToPRD(plan: TaskPlan, prd: RalphPRD): void {
  // 建立步骤 ID 到步骤的映射
  const stepMap = new Map<string, TaskStep>();
  for (const step of plan.steps) {
    stepMap.set(step.id, step);
  }
  
  // 更新 PRD 的故事状态
  for (const story of prd.userStories) {
    const step = stepMap.get(story.id);
    if (step) {
      story.passes = mapStatusToPasses(step.status);
      story.notes = step.result;
    }
  }
  
  prd.updatedAt = new Date().toISOString();
}

// ============ 差异计算 ============

/**
 * 计算两个 PRD 之间的差异
 */
export interface PRDDiff {
  added: RalphStory[];
  removed: string[];  // 被删除的故事 ID
  updated: RalphStory[];
  unchanged: RalphStory[];
}

/**
 * 比较两个 PRD 的差异
 */
export function diffPRD(oldPRD: RalphPRD, newPRD: RalphPRD): PRDDiff {
  const oldStories = new Map<string, RalphStory>();
  const newStories = new Map<string, RalphStory>();
  
  for (const story of oldPRD.userStories) {
    oldStories.set(story.id, story);
  }
  
  for (const story of newPRD.userStories) {
    newStories.set(story.id, story);
  }
  
  const added: RalphStory[] = [];
  const removed: string[] = [];
  const updated: RalphStory[] = [];
  const unchanged: RalphStory[] = [];
  
  // 检查新增和更新
  for (const [id, story] of newStories) {
    if (!oldStories.has(id)) {
      added.push(story);
    } else {
      const oldStory = oldStories.get(id)!;
      if (oldStory.passes !== story.passes || oldStory.notes !== story.notes) {
        updated.push(story);
      } else {
        unchanged.push(story);
      }
    }
  }
  
  // 检查删除
  for (const id of oldStories.keys()) {
    if (!newStories.has(id)) {
      removed.push(id);
    }
  }
  
  return { added, removed, updated, unchanged };
}

// ============ 统计信息 ============

/**
 * 获取 PRD 的完成统计
 */
export interface PRDStats {
  total: number;
  completed: number;
  pending: number;
  inProgress: number;
  progress: number;  // 0-100
}

/**
 * 计算 PRD 的统计信息
 */
export function getPRDStats(prd: RalphPRD): PRDStats {
  const total = prd.userStories.length;
  const completed = prd.userStories.filter(s => s.passes).length;
  const pending = total - completed;
  
  return {
    total,
    completed,
    pending,
    inProgress: 0,  // Ralph 模式下没有 in_progress 状态
    progress: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

/**
 * 格式化 PRD 统计信息为字符串
 */
export function formatPRDStats(stats: PRDStats): string {
  const bar = formatProgressBar(stats.progress);
  return `${bar} ${stats.completed}/${stats.total} (${stats.progress}%)`;
}

/**
 * 格式化进度条
 */
function formatProgressBar(percent: number, width: number = 10): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}