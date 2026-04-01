/**
 * 图结构测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Graph } from './graph';
import { GraphBuilder, createGraph, createNode, keywordsCondition } from './builder';
import { loadFromYaml, validateYamlConfig } from './loader';

describe('Graph', () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph('test-graph', 'Test Graph');
  });

  describe('节点操作', () => {
    it('应该能添加节点', () => {
      const node = createNode('agent-a', 'Agent A', 'Worker', 'You are a worker');
      graph.addNode(node);
      
      expect(graph.getNode('agent-a')).toBeDefined();
      expect(graph.getNode('agent-a')?.name).toBe('Agent A');
    });

    it('应该能批量添加节点', () => {
      const nodes = [
        createNode('agent-a', 'Agent A', 'Worker', 'You are a worker'),
        createNode('agent-b', 'Agent B', 'Manager', 'You are a manager'),
      ];
      
      graph.addNodes(nodes);
      
      expect(graph.getNodes().size).toBe(2);
    });

    it('应该能删除节点', () => {
      const node = createNode('agent-a', 'Agent A', 'Worker', 'You are a worker');
      graph.addNode(node);
      graph.removeNode('agent-a');
      
      expect(graph.getNode('agent-a')).toBeUndefined();
    });

    it('删除节点时应该删除相关边', () => {
      graph
        .addNode(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .addNode(createNode('agent-b', 'Agent B', 'Worker', 'Prompt'))
        .addDirectEdge('agent-a', 'agent-b')
        .removeNode('agent-b');
      
      expect(graph.getEdges().length).toBe(0);
    });
  });

  describe('边操作', () => {
    beforeEach(() => {
      graph
        .addNode(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .addNode(createNode('agent-b', 'Agent B', 'Worker', 'Prompt'))
        .setEntryPoint('agent-a');
    });

    it('应该能添加直接边', () => {
      graph.addDirectEdge('agent-a', 'agent-b');
      
      const edges = graph.getEdges();
      expect(edges.length).toBe(1);
      expect(edges[0].type).toBe('direct');
    });

    it('应该能添加条件边', () => {
      graph.addConditionalEdge('agent-a', 'agent-b', keywordsCondition('help'));
      
      const edges = graph.getEdges();
      expect(edges.length).toBe(1);
      expect(edges[0].type).toBe('conditional');
      expect(edges[0].condition?.keywords).toContain('help');
    });

    it('应该能获取节点的出边', () => {
      graph.addDirectEdge('agent-a', 'agent-b');
      
      const outEdges = graph.getOutEdges('agent-a');
      expect(outEdges.length).toBe(1);
      expect(outEdges[0].target).toBe('agent-b');
    });
  });

  describe('验证', () => {
    it('没有节点时应该验证失败', () => {
      const result = graph.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No nodes in graph');
    });

    it('没有入口点时应该验证失败', () => {
      graph.addNode(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'));
      const result = graph.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Entry point not set');
    });

    it('完整图应该验证通过', () => {
      graph
        .addNode(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .setEntryPoint('agent-a');
      
      const result = graph.validate();
      expect(result.valid).toBe(true);
    });
  });

  describe('导出', () => {
    it('应该能导出为 JSON', () => {
      graph
        .addNode(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .setEntryPoint('agent-a');
      
      const json = graph.toJSON() as any;
      expect(json.id).toBe('test-graph');
      expect(json.nodes.length).toBe(1);
    });

    it('应该能导出为 DOT', () => {
      graph
        .addNode(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .addNode(createNode('agent-b', 'Agent B', 'Worker', 'Prompt'))
        .setEntryPoint('agent-a')
        .addDirectEdge('agent-a', 'agent-b');
      
      const dot = graph.toDot();
      expect(dot).toContain('digraph');
      expect(dot).toContain('agent-a');
      expect(dot).toContain('agent-b');
    });
  });
});

describe('GraphBuilder', () => {
  it('应该能用流式 API 构建图', () => {
    const graph = createGraph('test', 'Test')
      .mode('lightweight')
      .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
      .addAgent(createNode('agent-b', 'Agent B', 'Worker', 'Prompt'))
      .entry('agent-a')
      .addDirectEdge('agent-a', 'agent-b')
      .build();
    
    expect(graph.getNodes().size).toBe(2);
    expect(graph.getEntryPoint()).toBe('agent-a');
    expect(graph.getEdges().length).toBe(1);
  });

  it('应该能添加条件边', () => {
    const graph = createGraph('test', 'Test')
      .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
      .addAgent(createNode('agent-b', 'Agent B', 'Worker', 'Prompt'))
      .entry('agent-a')
      .addConditionalEdge('agent-a', 'agent-b', keywordsCondition('help'))
      .build();
    
    const edges = graph.getEdges();
    expect(edges[0].type).toBe('conditional');
    expect(edges[0].condition?.keywords).toContain('help');
  });
});

describe('YAML 加载器', () => {
  const validYaml = `
id: test-workflow
name: Test Workflow
mode: lightweight
entry: agent-a

agents:
  - id: agent-a
    name: Agent A
    role: Worker
    systemPrompt: You are a worker

edges:
  - source: agent-a
    target: __end__
    type: direct
`;

  it('应该能加载有效的 YAML', () => {
    const graph = loadFromYaml(validYaml);
    
    expect(graph.getId()).toBe('test-workflow');
    expect(graph.getName()).toBe('Test Workflow');
    expect(graph.getNodes().size).toBe(1);
  });

  it('应该能验证 YAML 配置', () => {
    const result = validateYamlConfig(validYaml);
    
    expect(result.valid).toBe(true);
    expect(result.config).toBeDefined();
  });

  it('应该检测缺失字段', () => {
    const invalidYaml = `
name: Missing ID
`;
    const result = validateYamlConfig(invalidYaml);
    
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});