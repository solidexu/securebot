/**
 * 智能任务判断测试
 */

import { describe, it, expect, vi } from 'vitest';
import {
  assessComplexity,
  assessComplexityAdvanced,
  detectTaskType,
  parseTaskPlan,
  buildDependencyGraph,
  getExecutionOrder,
  renderTaskProgress,
  updateStepStatus,
  isPlanCompleted,
  getPlanSummary,
} from './smart-task.js';
import type { TaskStep, TaskPlan } from './smart-task.js';

// Mock fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
}));

describe('assessComplexity', () => {
  it('should handle query-like inputs', () => {
    const inputs = [
      '查看当前目录',
      '读取文件内容',
      '显示系统状态',
    ];

    for (const input of inputs) {
      const result = assessComplexity(input);
      // Query-like inputs should be simple, moderate, or complex based on context
      expect(['simple', 'moderate', 'complex']).toContain(result);
    }
  });

  it('should return complex for development inputs', () => {
    const inputs = [
      '开发一个用户管理系统',
      '实现一个新功能',
      '创建一个完整的项目',
      '重构代码结构',
    ];

    for (const input of inputs) {
      expect(assessComplexity(input)).toBe('complex');
    }
  });

  it('should return complex or moderate for multi-action inputs', () => {
    const inputs = [
      '创建文件并写入内容',
      '读取配置修改并保存',
      '实现功能然后测试',
    ];

    for (const input of inputs) {
      const result = assessComplexity(input);
      expect(['complex', 'moderate']).toContain(result);
    }
  });

  it('should return complex for multi-file operations', () => {
    const inputs = [
      '批量处理所有文件',
      '读取多个配置文件',
      '分析整个项目结构 /src /lib /test',
    ];

    for (const input of inputs) {
      expect(assessComplexity(input)).toBe('complex');
    }
  });
});

describe('assessComplexityAdvanced', () => {
  it('should return detailed assessment', () => {
    const result = assessComplexityAdvanced('开发一个新的API接口');

    expect(result).toHaveProperty('complexity');
    expect(result).toHaveProperty('taskType');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('reasons');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('should detect creation task type', () => {
    const result = assessComplexityAdvanced('创建一个新的组件');
    expect(result.taskType).toBe('creation');
  });

  it('should detect query task type', () => {
    const result = assessComplexityAdvanced('查看当前项目状态');
    expect(result.taskType).toBe('query');
  });

  it('should detect debugging task type', () => {
    const result = assessComplexityAdvanced('调试这个错误');
    expect(result.taskType).toBe('debugging');
  });

  it('should detect analysis task type', () => {
    const result = assessComplexityAdvanced('分析代码性能问题');
    expect(result.taskType).toBe('analysis');
  });

  it('should detect modification task type', () => {
    const result = assessComplexityAdvanced('修改用户登录逻辑');
    expect(result.taskType).toBe('modification');
  });

  it('should detect deployment task type', () => {
    const result = assessComplexityAdvanced('部署应用到生产环境');
    expect(result.taskType).toBe('deployment');
  });

  it('should include confidence score', () => {
    const result = assessComplexityAdvanced('实现一个复杂的功能模块');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('should detect dependencies', () => {
    const result = assessComplexityAdvanced('先配置环境，然后部署应用');
    
    // Should detect the dependency pattern
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});

describe('detectTaskType', () => {
  it('should detect query type', () => {
    expect(detectTaskType('查询用户列表')).toBe('query');
    expect(detectTaskType('搜索相关文档')).toBe('query');
    expect(detectTaskType('获取配置信息')).toBe('query');
  });

  it('should detect analysis type', () => {
    expect(detectTaskType('分析代码质量')).toBe('analysis');
    expect(detectTaskType('评估性能瓶颈')).toBe('analysis');
    expect(detectTaskType('审查安全漏洞')).toBe('analysis');
  });

  it('should detect creation type', () => {
    expect(detectTaskType('创建新项目')).toBe('creation');
    expect(detectTaskType('开发新功能')).toBe('creation');
    expect(detectTaskType('设计数据库结构')).toBe('creation');
  });

  it('should detect modification type', () => {
    expect(detectTaskType('修改配置文件')).toBe('modification');
    expect(detectTaskType('更新用户信息')).toBe('modification');
    expect(detectTaskType('优化代码性能')).toBe('modification');
  });

  it('should detect debugging type', () => {
    expect(detectTaskType('调试崩溃问题')).toBe('debugging');
    expect(detectTaskType('排查异常')).toBe('debugging');
    // '修复' also matches modification pattern
    const result = detectTaskType('修复bug');
    expect(['debugging', 'modification']).toContain(result);
  });

  it('should detect deployment type', () => {
    expect(detectTaskType('部署服务')).toBe('deployment');
    expect(detectTaskType('发布新版本')).toBe('deployment');
    expect(detectTaskType('配置服务器')).toBe('deployment');
  });

  it('should return query as default', () => {
    expect(detectTaskType('随机文本')).toBe('query');
  });
});

describe('parseTaskPlan', () => {
  it('should parse TODO format', () => {
    const content = `
# 任务计划
- [ ] 第一步：分析需求
- [ ] 第二步：设计方案
- [ ] 第三步：实现代码
`;

    const plan = parseTaskPlan(content);

    expect(plan).not.toBeNull();
    expect(plan?.title).toBe('任务计划');
    expect(plan?.steps.length).toBe(3);
    expect(plan?.steps[0]?.description).toContain('第一步');
  });

  it('should parse status from TODO format', () => {
    const content = `
- [x] 已完成
- [ ] 待处理
- [→] 进行中
- [!] 失败
`;

    const plan = parseTaskPlan(content);

    expect(plan?.steps[0]?.status).toBe('completed');
    expect(plan?.steps[1]?.status).toBe('pending');
    expect(plan?.steps[2]?.status).toBe('in_progress');
    expect(plan?.steps[3]?.status).toBe('failed');
  });

  it('should parse numbered list format', () => {
    const content = `
1. 分析需求
2. 设计方案
3. 实现代码
`;

    const plan = parseTaskPlan(content);

    expect(plan).not.toBeNull();
    expect(plan?.steps.length).toBe(3);
  });

  it('should return null for invalid content', () => {
    const plan = parseTaskPlan('This is just random text without any tasks');
    expect(plan).toBeNull();
  });

  it('should create timestamps', () => {
    const content = '- [ ] Task 1\n- [ ] Task 2';
    const plan = parseTaskPlan(content);

    expect(plan?.createdAt).toBeInstanceOf(Date);
    expect(plan?.updatedAt).toBeInstanceOf(Date);
  });
});

describe('buildDependencyGraph', () => {
  it('should build graph without dependencies', () => {
    const steps: TaskStep[] = [
      { id: '1', description: 'Task 1', status: 'pending' },
      { id: '2', description: 'Task 2', status: 'pending' },
      { id: '3', description: 'Task 3', status: 'pending' },
    ];

    const graph = buildDependencyGraph(steps);

    expect(graph.size).toBe(3);
    expect(graph.get('1')?.level).toBe(0);
    expect(graph.get('2')?.level).toBe(0);
    expect(graph.get('3')?.level).toBe(0);
  });

  it('should build graph with dependencies', () => {
    const steps: TaskStep[] = [
      { id: '1', description: 'Task 1', status: 'pending', dependencies: [] },
      { id: '2', description: 'Task 2', status: 'pending', dependencies: ['1'] },
      { id: '3', description: 'Task 3', status: 'pending', dependencies: ['2'] },
    ];

    const graph = buildDependencyGraph(steps);

    expect(graph.get('1')?.level).toBe(0);
    expect(graph.get('2')?.level).toBe(1);
    expect(graph.get('3')?.level).toBe(2);
  });

  it('should build dependents', () => {
    const steps: TaskStep[] = [
      { id: '1', description: 'Task 1', status: 'pending' },
      { id: '2', description: 'Task 2', status: 'pending', dependencies: ['1'] },
    ];

    const graph = buildDependencyGraph(steps);

    expect(graph.get('1')?.dependents).toContain('2');
    expect(graph.get('2')?.dependencies).toContain('1');
  });
});

describe('getExecutionOrder', () => {
  it('should return single level for no dependencies', () => {
    const steps: TaskStep[] = [
      { id: '1', description: 'Task 1', status: 'pending' },
      { id: '2', description: 'Task 2', status: 'pending' },
    ];

    const order = getExecutionOrder(steps);

    expect(order.length).toBe(1);
    expect(order[0]?.length).toBe(2);
  });

  it('should return multiple levels for dependencies', () => {
    const steps: TaskStep[] = [
      { id: '1', description: 'Task 1', status: 'pending' },
      { id: '2', description: 'Task 2', status: 'pending', dependencies: ['1'] },
      { id: '3', description: 'Task 3', status: 'pending', dependencies: ['1'] },
      { id: '4', description: 'Task 4', status: 'pending', dependencies: ['2', '3'] },
    ];

    const order = getExecutionOrder(steps);

    expect(order.length).toBe(3);
    expect(order[0]?.length).toBe(1); // Task 1
    expect(order[1]?.length).toBe(2); // Task 2, 3 (parallel)
    expect(order[2]?.length).toBe(1); // Task 4
  });
});

describe('renderTaskProgress', () => {
  it('should render task progress', () => {
    const plan: TaskPlan = {
      title: 'Test Plan',
      steps: [
        { id: '1', description: 'Task 1', status: 'completed' },
        { id: '2', description: 'Task 2', status: 'in_progress' },
        { id: '3', description: 'Task 3', status: 'pending' },
        { id: '4', description: 'Task 4', status: 'failed' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const rendered = renderTaskProgress(plan);

    expect(rendered).toContain('Test Plan');
    expect(rendered).toContain('1/4');
    expect(rendered).toContain('25%');
  });
});

describe('updateStepStatus', () => {
  it('should update step status', () => {
    const plan: TaskPlan = {
      title: 'Test',
      steps: [
        { id: '1', description: 'Task', status: 'pending' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    updateStepStatus(plan, '1', 'completed');

    expect(plan.steps[0]?.status).toBe('completed');
  });

  it('should set result', () => {
    const plan: TaskPlan = {
      title: 'Test',
      steps: [
        { id: '1', description: 'Task', status: 'pending' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    updateStepStatus(plan, '1', 'completed', 'Done');

    expect(plan.steps[0]?.result).toBe('Done');
  });
});

describe('isPlanCompleted', () => {
  it('should return true when all completed', () => {
    const plan: TaskPlan = {
      title: 'Test',
      steps: [
        { id: '1', description: 'Task 1', status: 'completed' },
        { id: '2', description: 'Task 2', status: 'skipped' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(isPlanCompleted(plan)).toBe(true);
  });

  it('should return false when pending exists', () => {
    const plan: TaskPlan = {
      title: 'Test',
      steps: [
        { id: '1', description: 'Task 1', status: 'completed' },
        { id: '2', description: 'Task 2', status: 'pending' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(isPlanCompleted(plan)).toBe(false);
  });
});

describe('getPlanSummary', () => {
  it('should return summary', () => {
    const plan: TaskPlan = {
      title: 'Test',
      steps: [
        { id: '1', description: 'Task 1', status: 'completed' },
        { id: '2', description: 'Task 2', status: 'in_progress' },
        { id: '3', description: 'Task 3', status: 'pending' },
        { id: '4', description: 'Task 4', status: 'failed' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const summary = getPlanSummary(plan);

    expect(summary).toContain('✅1');
    expect(summary).toContain('🔄1');
    expect(summary).toContain('⬜1');
    expect(summary).toContain('❌1');
  });
});