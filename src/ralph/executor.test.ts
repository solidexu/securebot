/**
 * Ralph Executor 测试
 */

import { describe, it, expect } from 'vitest';
import { 
  validatePRD, 
  getNextTask, 
  allTasksComplete,
} from './executor.js';
import type { RalphPRD } from './types.js';

describe('validatePRD', () => {
  it('should validate a valid PRD', () => {
    const prd: RalphPRD = {
      branchName: 'feature/test',
      userStories: [
        {
          id: 'US-001',
          title: 'Test task',
          acceptanceCriteria: ['AC1', 'AC2'],
          priority: 1,
          passes: false,
          notes: '',
        },
      ],
    };
    
    const result = validatePRD(prd);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
  
  it('should fail on missing branch name', () => {
    const prd: RalphPRD = {
      branchName: '',
      userStories: [
        {
          id: 'US-001',
          title: 'Test task',
          acceptanceCriteria: ['AC1'],
          priority: 1,
          passes: false,
          notes: '',
        },
      ],
    };
    
    const result = validatePRD(prd);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('分支名称太短或缺失');
  });
  
  it('should fail on empty user stories', () => {
    const prd: RalphPRD = {
      branchName: 'feature/test',
      userStories: [],
    };
    
    const result = validatePRD(prd);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('没有定义任何任务');
  });
  
  it('should fail on missing acceptance criteria', () => {
    const prd: RalphPRD = {
      branchName: 'feature/test',
      userStories: [
        {
          id: 'US-001',
          title: 'Test task',
          acceptanceCriteria: [],
          priority: 1,
          passes: false,
          notes: '',
        },
      ],
    };
    
    const result = validatePRD(prd);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i: string) => i.includes('缺少验收标准'))).toBe(true);
  });
  
  it('should fail on duplicate task IDs', () => {
    const prd: RalphPRD = {
      branchName: 'feature/test',
      userStories: [
        {
          id: 'US-001',
          title: 'Task 1',
          acceptanceCriteria: ['AC1'],
          priority: 1,
          passes: false,
          notes: '',
        },
        {
          id: 'US-001',
          title: 'Task 2',
          acceptanceCriteria: ['AC2'],
          priority: 2,
          passes: false,
          notes: '',
        },
      ],
    };
    
    const result = validatePRD(prd);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('存在重复的任务 ID');
  });
});

describe('getNextTask', () => {
  it('should return the first incomplete task', () => {
    const prd: RalphPRD = {
      branchName: 'feature/test',
      userStories: [
        { id: 'US-001', title: 'Task 1', acceptanceCriteria: [], priority: 1, passes: true, notes: '' },
        { id: 'US-002', title: 'Task 2', acceptanceCriteria: [], priority: 2, passes: false, notes: '' },
        { id: 'US-003', title: 'Task 3', acceptanceCriteria: [], priority: 3, passes: false, notes: '' },
      ],
    };
    
    const task = getNextTask(prd);
    expect(task?.id).toBe('US-002');
  });
  
  it('should return null when all tasks are complete', () => {
    const prd: RalphPRD = {
      branchName: 'feature/test',
      userStories: [
        { id: 'US-001', title: 'Task 1', acceptanceCriteria: [], priority: 1, passes: true, notes: '' },
        { id: 'US-002', title: 'Task 2', acceptanceCriteria: [], priority: 2, passes: true, notes: '' },
      ],
    };
    
    const task = getNextTask(prd);
    expect(task).toBeNull();
  });
  
  it('should return null when no tasks exist', () => {
    const prd: RalphPRD = {
      branchName: 'feature/test',
      userStories: [],
    };
    
    const task = getNextTask(prd);
    expect(task).toBeNull();
  });
});

describe('allTasksComplete', () => {
  it('should return true when all tasks are complete', () => {
    const prd: RalphPRD = {
      branchName: 'feature/test',
      userStories: [
        { id: 'US-001', title: 'Task 1', acceptanceCriteria: [], priority: 1, passes: true, notes: '' },
        { id: 'US-002', title: 'Task 2', acceptanceCriteria: [], priority: 2, passes: true, notes: '' },
      ],
    };
    
    expect(allTasksComplete(prd)).toBe(true);
  });
  
  it('should return false when some tasks are incomplete', () => {
    const prd: RalphPRD = {
      branchName: 'feature/test',
      userStories: [
        { id: 'US-001', title: 'Task 1', acceptanceCriteria: [], priority: 1, passes: true, notes: '' },
        { id: 'US-002', title: 'Task 2', acceptanceCriteria: [], priority: 2, passes: false, notes: '' },
      ],
    };
    
    expect(allTasksComplete(prd)).toBe(false);
  });
  
  it('should return true when no tasks exist', () => {
    const prd: RalphPRD = {
      branchName: 'feature/test',
      userStories: [],
    };
    
    expect(allTasksComplete(prd)).toBe(true);
  });
});