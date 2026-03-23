/**
 * Ralph 状态桥接模块测试
 */

import { describe, it, expect } from 'vitest';
import {
  prdToTaskPlan,
  taskPlanToPRD,
  storyToTaskStep,
  taskStepToStory,
  syncPRDToPlan,
  syncPlanToPRD,
  diffPRD,
  getPRDStats,
  formatPRDStats,
} from './state-bridge.js';
import type { RalphPRD, RalphStory } from './types.js';
import type { TaskPlan, TaskStep } from '../core/smart-task.js';

// ============ 测试数据 ============

const mockStory: RalphStory = {
  id: 'US-001',
  title: '实现用户登录功能',
  acceptanceCriteria: ['邮箱验证', '密码加密'],
  priority: 1,
  passes: false,
  notes: '需要 OAuth 支持',
};

const mockPRD: RalphPRD = {
  branchName: 'ralph/user-auth',
  userStories: [
    mockStory,
    {
      id: 'US-002',
      title: '实现用户注册功能',
      acceptanceCriteria: ['表单验证', '邮箱确认'],
      priority: 2,
      passes: true,
    },
  ],
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-15T12:00:00Z',
};

const mockTaskStep: TaskStep = {
  id: 'US-001',
  description: '实现用户登录功能',
  status: 'pending',
  result: '需要 OAuth 支持',
  priority: 'low',
};

const mockTaskPlan: TaskPlan = {
  title: 'ralph/user-auth',
  steps: [
    mockTaskStep,
    {
      id: 'US-002',
      description: '实现用户注册功能',
      status: 'completed',
      result: '已完成',
      priority: 'medium',
    },
  ],
  createdAt: new Date('2024-01-15T10:00:00Z'),
  updatedAt: new Date('2024-01-15T12:00:00Z'),
};

// ============ 测试用例 ============

describe('storyToTaskStep', () => {
  it('should convert RalphStory to TaskStep', () => {
    const result = storyToTaskStep(mockStory);
    
    expect(result.id).toBe('US-001');
    expect(result.description).toBe('实现用户登录功能');
    expect(result.status).toBe('pending');
    expect(result.result).toBe('需要 OAuth 支持');
    expect(result.priority).toBe('low');
  });

  it('should convert passes=true to completed status', () => {
    const completedStory: RalphStory = { ...mockStory, passes: true };
    const result = storyToTaskStep(completedStory);
    
    expect(result.status).toBe('completed');
  });

  it('should map priority correctly', () => {
    expect(storyToTaskStep({ ...mockStory, priority: 1 }).priority).toBe('low');
    expect(storyToTaskStep({ ...mockStory, priority: 2 }).priority).toBe('medium');
    expect(storyToTaskStep({ ...mockStory, priority: 5 }).priority).toBe('high');
  });
});

describe('taskStepToStory', () => {
  it('should convert TaskStep to RalphStory', () => {
    const result = taskStepToStory(mockTaskStep, 0);
    
    expect(result.id).toBe('US-001');
    expect(result.title).toBe('实现用户登录功能');
    expect(result.passes).toBe(false);
    expect(result.notes).toBe('需要 OAuth 支持');
    expect(result.priority).toBe(1);
  });

  it('should convert completed status to passes=true', () => {
    const completedStep: TaskStep = { ...mockTaskStep, status: 'completed' };
    const result = taskStepToStory(completedStep, 0);
    
    expect(result.passes).toBe(true);
  });
});

describe('prdToTaskPlan', () => {
  it('should convert RalphPRD to TaskPlan', () => {
    const result = prdToTaskPlan(mockPRD);
    
    expect(result.title).toBe('ralph/user-auth');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]?.id).toBe('US-001');
    expect(result.steps[1]?.status).toBe('completed');
    expect(result.taskType).toBe('mixed');
    expect(result.confidence).toBe(1.0);
  });

  it('should handle missing dates', () => {
    const prdNoDates: RalphPRD = {
      branchName: 'test',
      userStories: [mockStory],
    };
    
    const result = prdToTaskPlan(prdNoDates);
    
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });
});

describe('taskPlanToPRD', () => {
  it('should convert TaskPlan to RalphPRD', () => {
    const result = taskPlanToPRD(mockTaskPlan);
    
    expect(result.branchName).toBe('ralph/user-auth');
    expect(result.userStories).toHaveLength(2);
    expect(result.userStories[0]?.id).toBe('US-001');
    expect(result.userStories[1]?.passes).toBe(true);
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });

  it('should use custom branch name if provided', () => {
    const result = taskPlanToPRD(mockTaskPlan, 'custom/branch');
    
    expect(result.branchName).toBe('custom/branch');
  });
});

describe('syncPRDToPlan', () => {
  it('should sync PRD state to existing TaskPlan', () => {
    const plan: TaskPlan = {
      title: 'test',
      steps: [
        { id: 'US-001', description: 'Task 1', status: 'pending' },
        { id: 'US-002', description: 'Task 2', status: 'pending' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const prd: RalphPRD = {
      branchName: 'test',
      userStories: [
        { id: 'US-001', title: 'Task 1', acceptanceCriteria: [], priority: 1, passes: true, notes: 'Done' },
        { id: 'US-002', title: 'Task 2', acceptanceCriteria: [], priority: 1, passes: false },
      ],
    };
    
    syncPRDToPlan(prd, plan);
    
    expect(plan.steps[0]?.status).toBe('completed');
    expect(plan.steps[0]?.result).toBe('Done');
    expect(plan.steps[1]?.status).toBe('pending');
  });
});

describe('syncPlanToPRD', () => {
  it('should sync TaskPlan state to PRD', () => {
    const prd: RalphPRD = {
      branchName: 'test',
      userStories: [
        { id: 'US-001', title: 'Task 1', acceptanceCriteria: [], priority: 1, passes: false },
      ],
    };
    
    const plan: TaskPlan = {
      title: 'test',
      steps: [
        { id: 'US-001', description: 'Task 1', status: 'completed', result: 'Finished' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    syncPlanToPRD(plan, prd);
    
    expect(prd.userStories[0]?.passes).toBe(true);
    expect(prd.userStories[0]?.notes).toBe('Finished');
  });
});

describe('diffPRD', () => {
  it('should detect added stories', () => {
    const oldPRD: RalphPRD = {
      branchName: 'test',
      userStories: [{ id: 'US-001', title: 'Task 1', acceptanceCriteria: [], priority: 1, passes: false }],
    };
    
    const newPRD: RalphPRD = {
      branchName: 'test',
      userStories: [
        { id: 'US-001', title: 'Task 1', acceptanceCriteria: [], priority: 1, passes: false },
        { id: 'US-002', title: 'Task 2', acceptanceCriteria: [], priority: 1, passes: false },
      ],
    };
    
    const diff = diffPRD(oldPRD, newPRD);
    
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]?.id).toBe('US-002');
    expect(diff.removed).toHaveLength(0);
  });

  it('should detect removed stories', () => {
    const oldPRD: RalphPRD = {
      branchName: 'test',
      userStories: [
        { id: 'US-001', title: 'Task 1', acceptanceCriteria: [], priority: 1, passes: false },
        { id: 'US-002', title: 'Task 2', acceptanceCriteria: [], priority: 1, passes: false },
      ],
    };
    
    const newPRD: RalphPRD = {
      branchName: 'test',
      userStories: [{ id: 'US-001', title: 'Task 1', acceptanceCriteria: [], priority: 1, passes: false }],
    };
    
    const diff = diffPRD(oldPRD, newPRD);
    
    expect(diff.removed).toContain('US-002');
    expect(diff.added).toHaveLength(0);
  });

  it('should detect updated stories', () => {
    const oldPRD: RalphPRD = {
      branchName: 'test',
      userStories: [{ id: 'US-001', title: 'Task 1', acceptanceCriteria: [], priority: 1, passes: false }],
    };
    
    const newPRD: RalphPRD = {
      branchName: 'test',
      userStories: [{ id: 'US-001', title: 'Task 1', acceptanceCriteria: [], priority: 1, passes: true, notes: 'Done' }],
    };
    
    const diff = diffPRD(oldPRD, newPRD);
    
    expect(diff.updated).toHaveLength(1);
    expect(diff.unchanged).toHaveLength(0);
  });
});

describe('getPRDStats', () => {
  it('should calculate correct stats', () => {
    const stats = getPRDStats(mockPRD);
    
    expect(stats.total).toBe(2);
    expect(stats.completed).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.progress).toBe(50);
  });

  it('should handle empty PRD', () => {
    const stats = getPRDStats({ branchName: 'test', userStories: [] });
    
    expect(stats.total).toBe(0);
    expect(stats.progress).toBe(0);
  });
});

describe('formatPRDStats', () => {
  it('should format stats as string', () => {
    const stats = { total: 4, completed: 2, pending: 2, inProgress: 0, progress: 50 };
    const result = formatPRDStats(stats);
    
    expect(result).toContain('2/4');
    expect(result).toContain('50%');
  });
});