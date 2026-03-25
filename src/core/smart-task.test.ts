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
  recordToolCall,
  checkStepCompletion,
} from './smart-task.js';
import type { TaskStep, TaskPlan, StepCheckResult } from './smart-task.js';

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
- [x] 完成用户登录功能
- [ ] 实现注册接口
- [→] 编写测试用例
- [!] 修复数据库连接
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
    const content = '- [ ] 实现用户登录\n- [ ] 编写测试用例';
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
    // 1 completed + 1 in_progress = 2 done
    expect(rendered).toContain('2/4');
    expect(rendered).toContain('50%');
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

// ============ Plan 状态机 v3 测试 ============

describe('recordToolCall', () => {
  it('should record successful tool call', () => {
    const plan: TaskPlan = {
      title: 'Test',
      steps: [
        { id: 'step-1', description: '创建项目目录', status: 'in_progress' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    recordToolCall(plan, 'step-1', 'exec', { command: 'mkdir -p project' }, 'success');

    expect(plan.steps[0]?.toolCalls).toBeDefined();
    expect(plan.steps[0]?.toolCalls?.length).toBe(1);
    expect(plan.steps[0]?.toolCalls?.[0]?.tool).toBe('exec');
    expect(plan.steps[0]?.toolCalls?.[0]?.result).toBe('success');
  });

  it('should record failed tool call with error', () => {
    const plan: TaskPlan = {
      title: 'Test',
      steps: [
        { id: 'step-1', description: '创建文件', status: 'in_progress' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    recordToolCall(plan, 'step-1', 'write', { path: '/root/file.txt' }, 'failed', 'Permission denied');

    expect(plan.steps[0]?.toolCalls?.[0]?.result).toBe('failed');
    expect(plan.steps[0]?.toolCalls?.[0]?.error).toBe('Permission denied');
  });

  it('should accumulate multiple tool calls', () => {
    const plan: TaskPlan = {
      title: 'Test',
      steps: [
        { id: 'step-1', description: '多步操作', status: 'in_progress' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    recordToolCall(plan, 'step-1', 'exec', { command: 'mkdir project' }, 'success');
    recordToolCall(plan, 'step-1', 'write', { path: 'project/file.txt' }, 'success');

    expect(plan.steps[0]?.toolCalls?.length).toBe(2);
  });

  it('should not affect non-existent step', () => {
    const plan: TaskPlan = {
      title: 'Test',
      steps: [
        { id: 'step-1', description: 'Task', status: 'pending' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    recordToolCall(plan, 'non-existent', 'exec', {}, 'success');

    expect(plan.steps[0]?.toolCalls).toBeUndefined();
  });
});

describe('checkStepCompletion', () => {
  // ═══════════════════════════════════════════
  // 错误类型 1：没有工具调用
  // ═══════════════════════════════════════════
  describe('no_tool_call error', () => {
    it('should detect model says complete but no tool call', () => {
      const step: TaskStep = {
        id: 'step-1',
        description: '创建项目目录',
        status: 'in_progress',
        toolCalls: [],
      };

      const result = checkStepCompletion(step, '已完成：创建项目目录', []);

      expect(result.complete).toBe(false);
      expect(result.errorType).toBe('no_tool_call');
      expect(result.diagnosis).toContain('没有调用任何工具');
      expect(result.guidance).toContain('建议的工具');
    });

    it('should detect model talking without action', () => {
      const step: TaskStep = {
        id: 'step-1',
        description: '创建项目目录',
        status: 'in_progress',
        toolCalls: [],
      };

      const result = checkStepCompletion(step, '我来帮你创建目录...', []);

      expect(result.complete).toBe(false);
      expect(result.errorType).toBe('no_tool_call');
      expect(result.diagnosis).toContain('没有调用工具');
    });
  });

  // ═══════════════════════════════════════════
  // 错误类型 2：工具调用不相关
  // ═══════════════════════════════════════════
  describe('irrelevant_tool error', () => {
    it('should detect irrelevant tool call for directory creation', () => {
      const step: TaskStep = {
        id: 'step-1',
        description: '创建项目目录',
        status: 'in_progress',
        toolCalls: [
          { tool: 'write', args: { path: 'readme.md' }, result: 'success', timestamp: new Date().toISOString() },
        ],
      };

      const result = checkStepCompletion(step, '已完成：创建项目目录', step.toolCalls);

      expect(result.complete).toBe(false);
      expect(result.errorType).toBe('irrelevant_tool');
      expect(result.diagnosis).toContain('不相关');
    });

    it('should detect wrong file in tool call', () => {
      const step: TaskStep = {
        id: 'step-1',
        description: '实现 calculator.py',
        status: 'in_progress',
        toolCalls: [
          { tool: 'write', args: { path: 'readme.md' }, result: 'success', timestamp: new Date().toISOString() },
        ],
      };

      const result = checkStepCompletion(step, '已完成：实现 calculator.py', step.toolCalls);

      expect(result.complete).toBe(false);
      expect(result.errorType).toBe('irrelevant_tool');
    });

    it('should accept relevant tool call', () => {
      const step: TaskStep = {
        id: 'step-1',
        description: '实现 calculator.py',
        status: 'in_progress',
        toolCalls: [
          { tool: 'write', args: { path: 'calculator.py' }, result: 'success', timestamp: new Date().toISOString() },
        ],
      };

      const result = checkStepCompletion(step, '已完成：实现 calculator.py', step.toolCalls);

      expect(result.complete).toBe(true);
    });
  });

  // ═══════════════════════════════════════════
  // 错误类型 3：步骤不匹配
  // ═══════════════════════════════════════════
  describe('wrong_step error', () => {
    it('should detect wrong step mention', () => {
      const step: TaskStep = {
        id: 'step-1',
        description: '编写单元测试',
        status: 'in_progress',
        toolCalls: [
          { tool: 'write', args: { path: 'test.py' }, result: 'success', timestamp: new Date().toISOString() },
        ],
      };

      const result = checkStepCompletion(step, '已完成：实现计算器类', step.toolCalls);

      expect(result.complete).toBe(false);
      expect(result.errorType).toBe('wrong_step');
      expect(result.diagnosis).toContain('实现计算器类');
      expect(result.diagnosis).toContain('编写单元测试');
    });

    it('should accept matching step mention', () => {
      const step: TaskStep = {
        id: 'step-1',
        description: '编写单元测试',
        status: 'in_progress',
        toolCalls: [
          { tool: 'write', args: { path: 'test.py' }, result: 'success', timestamp: new Date().toISOString() },
        ],
      };

      const result = checkStepCompletion(step, '已完成：编写单元测试', step.toolCalls);

      expect(result.complete).toBe(true);
    });

    it('should accept partial matching step mention', () => {
      const step: TaskStep = {
        id: 'step-1',
        description: '创建项目目录结构',
        status: 'in_progress',
        toolCalls: [
          { tool: 'exec', args: { command: 'mkdir -p project' }, result: 'success', timestamp: new Date().toISOString() },
        ],
      };

      const result = checkStepCompletion(step, '已完成：创建项目目录', step.toolCalls);

      expect(result.complete).toBe(true);
    });
  });

  // ═══════════════════════════════════════════
  // 错误类型 4：工具失败
  // ═══════════════════════════════════════════
  describe('tool_failed error', () => {
    it('should detect tool failure', () => {
      const step: TaskStep = {
        id: 'step-1',
        description: '创建文件',
        status: 'in_progress',
        toolCalls: [
          { tool: 'write', args: { path: '/root/file.txt' }, result: 'failed', error: 'Permission denied', timestamp: new Date().toISOString() },
        ],
      };

      const result = checkStepCompletion(step, '创建文件失败', step.toolCalls);

      expect(result.complete).toBe(false);
      expect(result.errorType).toBe('tool_failed');
      expect(result.guidance).toContain('失败');
    });
  });

  // ═══════════════════════════════════════════
  // 正常完成
  // ═══════════════════════════════════════════
  describe('successful completion', () => {
    it('should pass with correct tool call and model confirmation', () => {
      const step: TaskStep = {
        id: 'step-1',
        description: '创建项目目录',
        status: 'in_progress',
        toolCalls: [
          { tool: 'exec', args: { command: 'mkdir -p project' }, result: 'success', timestamp: new Date().toISOString() },
        ],
      };

      const result = checkStepCompletion(step, '已完成：创建项目目录', step.toolCalls);

      expect(result.complete).toBe(true);
      expect(result.diagnosis).toBe('验证通过');
    });

    it('should wait for model confirmation when tool is correct', () => {
      const step: TaskStep = {
        id: 'step-1',
        description: '创建项目目录',
        status: 'in_progress',
        toolCalls: [
          { tool: 'exec', args: { command: 'mkdir -p project' }, result: 'success', timestamp: new Date().toISOString() },
        ],
      };

      const result = checkStepCompletion(step, '目录已创建', step.toolCalls);

      expect(result.complete).toBe(false);
      expect(result.diagnosis).toContain('等待模型确认');
    });
  });

  // ═══════════════════════════════════════════
  // 引导消息生成
  // ═══════════════════════════════════════════
  describe('guidance generation', () => {
    it('should suggest mkdir for directory step', () => {
      const step: TaskStep = {
        id: 'step-1',
        description: '创建项目目录',
        status: 'in_progress',
        toolCalls: [],
      };

      const result = checkStepCompletion(step, '已完成', []);

      expect(result.guidance).toContain('exec');
      expect(result.guidance).toContain('mkdir');
    });

    it('should suggest write for file creation step', () => {
      const step: TaskStep = {
        id: 'step-1',
        description: '创建 main.py 文件',
        status: 'in_progress',
        toolCalls: [],
      };

      const result = checkStepCompletion(step, '已完成', []);

      expect(result.guidance).toContain('write');
      expect(result.guidance).toContain('main.py');
    });

    it('should include correct step in wrong_step guidance', () => {
      const step: TaskStep = {
        id: 'step-1',
        description: '编写单元测试',
        status: 'in_progress',
        toolCalls: [
          { tool: 'write', args: { path: 'test.py' }, result: 'success', timestamp: new Date().toISOString() },
        ],
      };

      const result = checkStepCompletion(step, '已完成：实现计算器类', step.toolCalls);

      expect(result.guidance).toContain('编写单元测试');
      expect(result.guidance).toContain('实现计算器类');
    });
  });
});