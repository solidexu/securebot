/**
 * Agent 协作系统集成测试
 * 
 * 测试完整工作流执行、监控、心跳、告警等功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createGraph,
  createNode,
  keywordsCondition,
  GraphExecutor,
  UnifiedOrchestrator,
  createOrchestrator,
  loadFromYaml,
} from '../core/collaboration';
import { HeartbeatManager, createLocalHeartbeatClient } from '../core/heartbeat';
import { EventBroadcaster, MetricsCollector, AlertSystem } from '../core/monitoring';

// ============ Mock LLM Client ============

function createMockLLMClient(responses: any[] = []) {
  let callCount = 0;
  
  return {
    chat: vi.fn(async (params: any) => {
      const response = responses[callCount] || { content: 'default response' };
      callCount++;
      return response;
    }),
  };
}

// ============ 模型训练场景测试 ============

describe('模型训练场景', () => {
  it('应该能执行完整的模型训练工作流', async () => {
    // 构建图
    const graph = createGraph('model-training', '模型训练')
      .mode('lightweight')
      .addAgents([
        createNode('coordinator', '协调器', '项目经理', '你是协调器...'),
        createNode('data-engineer', '数据工程师', '数据处理', '你是数据工程师...'),
        createNode('trainer', '训练员', '模型训练', '你是训练员...'),
      ])
      .entry('coordinator')
      .addConditionalEdges('coordinator', [
        { target: 'data-engineer', condition: keywordsCondition('数据') },
        { target: 'trainer', condition: keywordsCondition('训练') },
      ])
      .addDirectEdge('data-engineer', 'coordinator')
      .addDirectEdge('trainer', 'coordinator')
      .build();

    // 创建监控组件
    const broadcaster = new EventBroadcaster();
    const collector = new MetricsCollector();

    // 创建执行器
    const mockLLM = createMockLLMClient([
      { content: '数据已处理完成' },
      { content: '模型训练完成' },
    ]);

    const executor = new GraphExecutor(graph);
    executor.setEventEmitter((event) => {
      collector.recordEvent(event as any);
    });

    // 运行
    const result = await executor.run('处理数据并训练模型', mockLLM);

    // 验证
    expect(result.success).toBe(true);
    expect(result.history.length).toBeGreaterThan(0);
    
    // 验证指标
    const agentMetrics = collector.getAllAgentMetrics();
    expect(agentMetrics.length).toBeGreaterThan(0);
  });

  it('应该能处理 Handoff 链', async () => {
    const graph = createGraph('chain-test', '链式测试')
      .addAgents([
        createNode('agent-a', 'Agent A', 'Worker', 'Agent A'),
        createNode('agent-b', 'Agent B', 'Worker', 'Agent B'),
        createNode('agent-c', 'Agent C', 'Worker', 'Agent C'),
      ])
      .entry('agent-a')
      .addDirectEdge('agent-a', 'agent-b')
      .addDirectEdge('agent-b', 'agent-c')
      .build();

    const mockLLM = createMockLLMClient([
      { content: 'A done', toolCall: { name: 'transfer_to_agent-b', args: {} } },
      { content: 'B done', toolCall: { name: 'transfer_to_agent-c', args: {} } },
      { content: 'C done' },
    ]);

    const orchestrator = createOrchestrator(graph, mockLLM);
    const result = await orchestrator.run('start');

    expect(result.success).toBe(true);
    expect(result.result).toBe('C done');
  });
});

// ============ 代码审查场景测试 ============

describe('代码审查场景', () => {
  it('应该能执行顺序代码审查流程', async () => {
    const graph = createGraph('code-review', '代码审查')
      .mode('lightweight')
      .addAgents([
        createNode('style-checker', '风格检查', '检查代码风格', '检查风格...'),
        createNode('bug-finder', 'Bug检查', '发现Bug', '发现Bug...'),
        createNode('security-scanner', '安全扫描', '检查安全', '检查安全...'),
      ])
      .entry('style-checker')
      .addDirectEdge('style-checker', 'bug-finder')
      .addDirectEdge('bug-finder', 'security-scanner')
      .build();

    const mockLLM = createMockLLMClient([
      { content: '风格检查通过' },
      { content: '发现2个潜在Bug' },
      { content: '安全检查通过，报告完成' },
    ]);

    const orchestrator = createOrchestrator(graph, mockLLM);
    const result = await orchestrator.run('审查这段代码');

    expect(result.success).toBe(true);
  });
});

// ============ 心跳管理测试 ============

describe('心跳管理', () => {
  let heartbeatManager: HeartbeatManager;

  beforeEach(() => {
    heartbeatManager = new HeartbeatManager({
      interval: 100,
      timeout: 200,
      checkInterval: 50,
      maxMissed: 2,
    });
  });

  afterEach(() => {
    heartbeatManager.stop();
  });

  it('应该能检测 Agent 离线', async () => {
    const offlineCallback = vi.fn();
    heartbeatManager.subscribe(offlineCallback);
    heartbeatManager.start();

    // 注册 Agent
    heartbeatManager.registerAgent('agent-a');

    // 发送心跳
    heartbeatManager.receiveHeartbeat({
      agentId: 'agent-a',
      status: 'idle',
      timestamp: Date.now() - 500, // 500ms 前
    });

    // 等待检查
    await new Promise((r) => setTimeout(r, 150));

    // 应该触发离线事件
    expect(offlineCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent_offline',
        agentId: 'agent-a',
      })
    );
  });

  it('应该能使用本地心跳客户端', async () => {
    heartbeatManager.start();
    
    const client = createLocalHeartbeatClient('agent-a', heartbeatManager);
    client.start();

    // 等待一次心跳周期
    await new Promise((r) => setTimeout(r, 150));

    const state = heartbeatManager.getAgentState('agent-a');
    expect(state).toBeDefined();
    expect(state?.status).toBe('online');

    client.stop();
  });
});

// ============ 监控测试 ============

describe('监控系统', () => {
  it('应该能收集和广播事件', () => {
    const broadcaster = new EventBroadcaster();
    const collector = new MetricsCollector();

    const receivedEvents: any[] = [];
    broadcaster.subscribe({}, (event) => {
      receivedEvents.push(event);
    });

    const event = {
      type: 'node_enter' as const,
      nodeId: 'agent-a',
      nodeName: 'Agent A',
      timestamp: Date.now(),
    };

    broadcaster.broadcast('thread-1', event);
    collector.recordEvent(event);

    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0]).toEqual(event);

    const metrics = collector.getAgentMetrics('agent-a');
    expect(metrics?.callCount).toBe(1);
  });

  it('应该能统计系统指标', () => {
    const collector = new MetricsCollector();

    // 模拟多个事件
    collector.recordEvent({
      type: 'workflow_start',
      graphId: 'test-graph',
      threadId: 'thread-1',
      input: 'test',
      timestamp: Date.now(),
    });

    collector.recordEvent({
      type: 'node_enter',
      nodeId: 'agent-a',
      nodeName: 'Agent A',
      timestamp: Date.now(),
    });

    collector.recordEvent({
      type: 'node_exit',
      nodeId: 'agent-a',
      result: 'done',
      duration: 100,
      timestamp: Date.now(),
    });

    const systemMetrics = collector.getSystemMetrics();
    expect(systemMetrics.totalEvents).toBe(3);
  });
});

// ============ 告警测试 ============

describe('告警系统', () => {
  it('应该能匹配规则并触发告警', async () => {
    const alertSystem = new AlertSystem();
    const alertCallback = vi.fn();

    alertSystem.addRule({
      id: 'test-rule',
      name: '测试规则',
      condition: 'event.type === "node_error"',
      channels: ['log'],
      severity: 'high',
      enabled: true,
    });

    // 触发错误事件
    const errorEvent = {
      type: 'node_error' as const,
      nodeId: 'agent-a',
      error: 'Something went wrong',
      timestamp: Date.now(),
    };

    alertSystem.checkEvent(errorEvent as any);

    const history = alertSystem.getAlertHistory();
    expect(history.length).toBe(1);
    expect(history[0].ruleId).toBe('test-rule');
  });

  it('应该遵守冷却时间', async () => {
    const alertSystem = new AlertSystem();

    alertSystem.addRule({
      id: 'cooldown-rule',
      name: '冷却测试',
      condition: 'true',
      channels: ['log'],
      severity: 'low',
      enabled: true,
      cooldown: 1000, // 1秒
    });

    const event = {
      type: 'node_enter' as const,
      nodeId: 'agent-a',
      nodeName: 'Agent A',
      timestamp: Date.now(),
    };

    // 触发两次
    alertSystem.checkEvent(event as any);
    alertSystem.checkEvent(event as any);

    const history = alertSystem.getAlertHistory();
    expect(history.length).toBe(1); // 只触发一次
  });
});

// ============ LangGraph 模式测试 ============

describe('LangGraph 模式', () => {
  it('应该能创建 LangGraph 适配器', async () => {
    const graph = createGraph('langgraph-test', 'LangGraph 测试')
      .mode('langgraph')
      .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
      .entry('agent-a')
      .build();

    const { LangGraphAdapter } = await import('../core/collaboration/langgraph-adapter');
    
    // 不提供 langgraph 模块，测试降级
    const adapter = new LangGraphAdapter(graph);
    
    const available = await adapter.isLangGraphAvailable();
    // 如果没有安装 @langchain/langgraph，应该返回 false
    expect(typeof available).toBe('boolean');
  });
});

// ============ YAML 加载测试 ============

describe('YAML 加载', () => {
  it('应该能加载有效的 YAML 工作流', () => {
    const yaml = `
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

    const graph = loadFromYaml(yaml);
    
    expect(graph.getId()).toBe('test-workflow');
    expect(graph.getName()).toBe('Test Workflow');
    expect(graph.getNodes().size).toBe(1);
  });
});

// ============ 性能测试 ============

describe('性能测试', () => {
  it('应该能处理大量节点', () => {
    const builder = createGraph('large-graph', '大图测试');
    
    // 创建 100 个节点
    for (let i = 0; i < 100; i++) {
      builder.addAgent(createNode(`agent-${i}`, `Agent ${i}`, 'Worker', 'Prompt'));
    }
    
    builder.entry('agent-0');
    
    // 添加链式边
    for (let i = 0; i < 99; i++) {
      builder.addDirectEdge(`agent-${i}`, `agent-${i + 1}`);
    }

    const start = Date.now();
    const graph = builder.build();
    const buildTime = Date.now() - start;

    expect(graph.getNodes().size).toBe(100);
    expect(buildTime).toBeLessThan(100); // 构建时间 < 100ms
  });

  it('应该能处理并发心跳', async () => {
    const manager = new HeartbeatManager({
      interval: 100,
      timeout: 200,
      checkInterval: 50,
    });

    manager.start();

    // 注册 100 个 Agent
    for (let i = 0; i < 100; i++) {
      manager.registerAgent(`agent-${i}`);
    }

    // 并发发送心跳
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      manager.receiveHeartbeat({
        agentId: `agent-${i}`,
        status: 'idle',
        timestamp: Date.now(),
      });
    }
    const processTime = Date.now() - start;

    expect(processTime).toBeLessThan(100); // 处理时间 < 100ms

    manager.stop();
  });
});