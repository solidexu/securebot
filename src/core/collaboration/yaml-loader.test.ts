/**
 * YAML加载器单元测试
 */

import { describe, it, expect } from 'vitest';
import { loadFromYaml, validateYamlConfig } from './loader.js';

describe('YAML加载器', () => {
  describe('loadFromYaml', () => {
    it('应该成功加载简单工作流', () => {
      const yaml = `
id: test-workflow
name: 测试工作流
mode: lightweight
entry: agent-a

agents:
  - id: agent-a
    name: Agent A
    role: Worker
    systemPrompt: 你是Agent A

  - id: agent-b
    name: Agent B
    role: Manager
    systemPrompt: 你是Agent B

edges:
  - source: agent-a
    target: agent-b
    type: direct
`;

      const graph = loadFromYaml(yaml);
      
      expect(graph.getId()).toBe('test-workflow');
      expect(graph.getName()).toBe('测试工作流');
      expect(graph.getExecutionMode()).toBe('lightweight');
      expect(graph.getEntryPoint()).toBe('agent-a');
      expect(graph.getNodes().size).toBe(2);
      expect(graph.getEdges().length).toBe(1);
    });

    it('应该成功加载条件路由', () => {
      const yaml = `
id: conditional-flow
name: 条件流程
entry: router

agents:
  - id: router
    name: 路由器
    role: Router
    systemPrompt: 路由用户请求

  - id: path-a
    name: 路径A
    role: Handler
    systemPrompt: 处理路径A

  - id: path-b
    name: 路径B
    role: Handler
    systemPrompt: 处理路径B

edges:
  - source: router
    target: path-a
    type: conditional
    condition:
      keywords: [help, 帮助]

  - source: router
    target: path-b
    type: conditional
    condition:
      keywords: [buy, 购买]
`;

      const graph = loadFromYaml(yaml);
      
      expect(graph.getNodes().size).toBe(3);
      expect(graph.getEdges().length).toBe(2);
      
      const conditionalEdges = graph.getEdges().filter(e => e.type === 'conditional');
      expect(conditionalEdges.length).toBe(2);
      
      const edge1 = conditionalEdges.find(e => e.target === 'path-a');
      expect(edge1?.condition?.keywords).toContain('help');
    });

    it('应该正确解析Agent配置', () => {
      const yaml = `
id: agent-test
name: Agent测试
entry: worker

agents:
  - id: worker
    name: 工作者
    role: Worker
    description: 执行任务的工作者
    systemPrompt: 你是一个工作者
    tools:
      - tool1
      - tool2
    model:
      provider: openai
      name: gpt-4
      params:
        temperature: 0.7
    behavior:
      isAsync: true
      timeout: 30000
      retryPolicy:
        maxAttempts: 3

edges: []
`;

      const graph = loadFromYaml(yaml);
      const node = graph.getNode('worker');
      
      expect(node).toBeDefined();
      expect(node?.name).toBe('工作者');
      expect(node?.role).toBe('Worker');
      expect(node?.description).toBe('执行任务的工作者');
      expect(node?.tools).toEqual(['tool1', 'tool2']);
      expect(node?.model?.provider).toBe('openai');
      expect(node?.model?.name).toBe('gpt-4');
      expect(node?.model?.params?.temperature).toBe(0.7);
      expect(node?.behavior?.isAsync).toBe(true);
      expect(node?.behavior?.timeout).toBe(30000);
      expect(node?.behavior?.retryPolicy?.maxAttempts).toBe(3);
    });
  });

  describe('validateYamlConfig', () => {
    it('应该验证通过正确的配置', () => {
      const yaml = `
id: valid-workflow
name: 有效工作流
entry: agent-a

agents:
  - id: agent-a
    name: Agent A
    role: Worker
    systemPrompt: Test
`;

      const result = validateYamlConfig(yaml);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.config).toBeDefined();
      expect(result.config?.id).toBe('valid-workflow');
    });

    it('应该检测缺少的必需字段', () => {
      const yaml = `
id: incomplete
name: 不完整
`;

      const result = validateYamlConfig(yaml);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: entry');
      expect(result.errors).toContain('No agents defined');
    });

    it('应该检测不存在的入口节点', () => {
      const yaml = `
id: wrong-entry
name: 错误入口
entry: not-exist

agents:
  - id: agent-a
    name: Agent A
    role: Worker
    systemPrompt: Test
`;

      const result = validateYamlConfig(yaml);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Entry agent not found: not-exist');
    });

    it('应该检测边引用不存在的节点', () => {
      const yaml = `
id: invalid-edges
name: 无效边
entry: agent-a

agents:
  - id: agent-a
    name: Agent A
    role: Worker
    systemPrompt: Test

edges:
  - source: agent-a
    target: not-exist
    type: direct

  - source: not-exist
    target: agent-a
    type: direct
`;

      const result = validateYamlConfig(yaml);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Edge target not found: not-exist');
      expect(result.errors).toContain('Edge source not found: not-exist');
    });

    it('应该检测YAML语法错误', () => {
      const yaml = `
id: syntax-error
name: 语法错误
invalid: [yaml content
  - unclosed bracket
`;

      const result = validateYamlConfig(yaml);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('YAML parse error');
    });

    it('应该允许边指向__end__', () => {
      const yaml = `
id: end-node-test
name: 结束节点测试
entry: agent-a

agents:
  - id: agent-a
    name: Agent A
    role: Worker
    systemPrompt: Test

edges:
  - source: agent-a
    target: __end__
    type: direct
`;

      const result = validateYamlConfig(yaml);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('边类型测试', () => {
    it('应该正确处理直接边', () => {
      const yaml = `
id: direct-edge
name: 直接边测试
entry: a

agents:
  - id: a
    name: A
    role: Worker
    systemPrompt: A

  - id: b
    name: B
    role: Worker
    systemPrompt: B

edges:
  - source: a
    target: b
    type: direct
    metadata:
      label: A到B
      priority: 1
`;

      const graph = loadFromYaml(yaml);
      const edges = graph.getEdges();
      
      expect(edges.length).toBe(1);
      expect(edges[0].type).toBe('direct');
      expect(edges[0].source).toBe('a');
      expect(edges[0].target).toBe('b');
      expect(edges[0].metadata?.label).toBe('A到B');
      expect(edges[0].metadata?.priority).toBe(1);
    });

    it('应该正确处理条件边', () => {
      const yaml = `
id: conditional-edge
name: 条件边测试
entry: a

agents:
  - id: a
    name: A
    role: Worker
    systemPrompt: A

  - id: b
    name: B
    role: Worker
    systemPrompt: B

edges:
  - source: a
    target: b
    type: conditional
    condition:
      keywords: [help, 协助]
      expression: "input.includes('帮助')"
    metadata:
      label: 需要帮助
`;

      const graph = loadFromYaml(yaml);
      const edges = graph.getEdges();
      
      expect(edges.length).toBe(1);
      expect(edges[0].type).toBe('conditional');
      expect(edges[0].condition?.keywords).toEqual(['help', '协助']);
      expect(edges[0].condition?.expression).toBe("input.includes('帮助')");
    });
  });
});