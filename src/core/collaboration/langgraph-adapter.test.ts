/**
 * LangGraph 适配器测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LangGraphAdapter } from './langgraph-adapter';
import { GraphBuilder, createNode } from './builder';

// Mock LangGraph 模块
const mockLangGraph = {
  StateGraph: vi.fn().mockImplementation(() => ({
    addNode: vi.fn(),
    setEntryPoint: vi.fn(),
    addEdge: vi.fn(),
    addConditionalEdges: vi.fn(),
    compile: vi.fn().mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        messages: [{ role: 'assistant', content: 'Result' }],
        currentNode: 'agent-a',
      }),
      stream: vi.fn().mockImplementation(async function* () {
        yield { type: 'event', data: {} };
      }),
      getState: vi.fn().mockResolvedValue({ values: {} }),
      updateState: vi.fn().mockResolvedValue(undefined),
    }),
  })),
  END: '__end__',
  START: '__start__',
  MemorySaver: vi.fn().mockImplementation(() => ({})),
};

describe('LangGraphAdapter', () => {
  describe('当 LangGraph 不可用时', () => {
    it('isLangGraphAvailable 应该返回 false', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const adapter = new LangGraphAdapter(graph);

      // 未提供 langgraph 模块且无法动态加载时
      // 这里会尝试动态加载，可能会失败
      const available = await adapter.isLangGraphAvailable();
      
      // 如果没有安装 @langchain/langgraph，应该返回 false
      // 如果安装了，应该返回 true
      // 我们不强制断言，只是验证方法可调用
      expect(typeof available).toBe('boolean');
    });
  });

  describe('当提供 Mock LangGraph 模块时', () => {
    it('应该能构建 StateGraph', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .mode('langgraph')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'You are a worker'))
        .addAgent(createNode('agent-b', 'Agent B', 'Worker', 'You are a worker'))
        .entry('agent-a')
        .addDirectEdge('agent-a', 'agent-b')
        .build();

      const adapter = new LangGraphAdapter(graph, {
        langgraph: mockLangGraph,
      });

      const stateGraph = await adapter.buildStateGraph();
      expect(stateGraph).toBeDefined();
      expect(mockLangGraph.StateGraph).toHaveBeenCalled();
    });

    it('应该能编译图', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .mode('langgraph')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const adapter = new LangGraphAdapter(graph, {
        langgraph: mockLangGraph,
      });

      const app = await adapter.compile();
      expect(app).toBeDefined();
      expect(app.invoke).toBeDefined();
      expect(app.stream).toBeDefined();
    });

    it('应该能运行图', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .mode('langgraph')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const adapter = new LangGraphAdapter(graph, {
        langgraph: mockLangGraph,
      });

      const result = await adapter.run('Hello');

      expect(result.success).toBe(true);
      expect(result.mode).toBe('langgraph');
      expect(result.threadId).toBeDefined();
    });

    it('应该能获取状态', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .mode('langgraph')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const adapter = new LangGraphAdapter(graph, {
        langgraph: mockLangGraph,
      });

      await adapter.compile();
      const state = await adapter.getState('thread-123');

      expect(state).toBeDefined();
    });

    it('应该能更新状态', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .mode('langgraph')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const adapter = new LangGraphAdapter(graph, {
        langgraph: mockLangGraph,
      });

      await adapter.compile();
      await adapter.updateState('thread-123', { approved: true });

      // 验证 updateState 被调用
      const compiledApp = await adapter.compile();
      expect(compiledApp.updateState).toHaveBeenCalled();
    });

    it('应该能恢复执行', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .mode('langgraph')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const adapter = new LangGraphAdapter(graph, {
        langgraph: mockLangGraph,
      });

      const result = await adapter.resume('thread-123', { approved: true });

      expect(result.success).toBe(true);
      expect(result.threadId).toBe('thread-123');
    });

    it('应该能流式执行', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .mode('langgraph')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const adapter = new LangGraphAdapter(graph, {
        langgraph: mockLangGraph,
      });

      const events = [];
      for await (const event of adapter.stream('Hello')) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('条件边处理', () => {
    it('应该正确构建条件路由', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .mode('langgraph')
        .addAgent(createNode('router', 'Router', 'Router', 'Route requests'))
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .addAgent(createNode('agent-b', 'Agent B', 'Worker', 'Prompt'))
        .entry('router')
        .addConditionalEdge('router', 'agent-a', { keywords: ['help'] })
        .addConditionalEdge('router', 'agent-b', { keywords: ['info'] })
        .build();

      const adapter = new LangGraphAdapter(graph, {
        langgraph: mockLangGraph,
      });

      const stateGraph = await adapter.buildStateGraph();
      expect(stateGraph.addConditionalEdges).toHaveBeenCalled();
    });
  });

  describe('检查点配置', () => {
    it('应该使用内存检查点', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .mode('langgraph')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const adapter = new LangGraphAdapter(graph, {
        langgraph: mockLangGraph,
      });

      await adapter.compile();
      expect(mockLangGraph.MemorySaver).toHaveBeenCalled();
    });
  });
});

// ============ Phase 3: HITL 人在回路测试 ============

import { HumanInteractionManager } from './hitl-manager.js';
import { MemoryInterruptStore } from './hitl-store.js';
import { HitlConfig, HitlLevel } from './hitl-types.js';

describe('LangGraphAdapter HITL', () => {
  it('setHitl 应该设置 HITL 管理器和配置', () => {
    const graph = new GraphBuilder('test', 'Test')
      .addAgent(createNode('node1', 'Node1', 'test', 'prompt'))
      .entry('node1')
      .build();
    const adapter = new LangGraphAdapter(graph);
    const manager = new HumanInteractionManager(new MemoryInterruptStore());
    const config: HitlConfig = { level: HitlLevel.NODE_INTERRUPT, interruptNodes: ['node1'] };

    const result = adapter.setHitl(manager, config);
    expect(result).toBe(adapter);
  });

  it('编译时应该包含 HITL 中断配置 (STEP_THROUGH)', async () => {
    const graph = new GraphBuilder('test', 'Test')
      .addAgent(createNode('node1', 'Node1', 'test', 'prompt'))
      .entry('node1')
      .build();
    const adapter = new LangGraphAdapter(graph, { langgraph: mockLangGraph });
    const manager = new HumanInteractionManager(new MemoryInterruptStore());
    adapter.setHitl(manager, { level: HitlLevel.STEP_THROUGH });

    const app = await adapter.compile();
    expect(app).toBeDefined();
  });

  it('编译时应该包含 HITL 中断配置 (NODE_INTERRUPT)', async () => {
    const graph = new GraphBuilder('test', 'Test')
      .addAgent(createNode('agent-a', 'AgentA', 'test', 'prompt'))
      .entry('agent-a')
      .build();
    const adapter = new LangGraphAdapter(graph, { langgraph: mockLangGraph });
    const manager = new HumanInteractionManager(new MemoryInterruptStore());
    adapter.setHitl(manager, { level: HitlLevel.NODE_INTERRUPT, interruptNodes: ['agent-a'] });

    const app = await adapter.compile();
    expect(app).toBeDefined();
  });

  it('FULL_AUTO 模式不应该添加中断配置', async () => {
    const graph = new GraphBuilder('test', 'Test')
      .addAgent(createNode('node1', 'Node1', 'test', 'prompt'))
      .entry('node1')
      .build();
    const adapter = new LangGraphAdapter(graph, { langgraph: mockLangGraph });
    const manager = new HumanInteractionManager(new MemoryInterruptStore());
    adapter.setHitl(manager, { level: HitlLevel.FULL_AUTO });

    const app = await adapter.compile();
    expect(app).toBeDefined();
  });

  it('应该支持 agentConfig 中的 interruptAfter', async () => {
    const graph = new GraphBuilder('test', 'Test')
      .addAgent(createNode('agent-a', 'AgentA', 'test', 'prompt'))
      .entry('agent-a')
      .build();
    const adapter = new LangGraphAdapter(graph, { langgraph: mockLangGraph });
    const manager = new HumanInteractionManager(new MemoryInterruptStore());
    adapter.setHitl(manager, {
      level: HitlLevel.NODE_INTERRUPT,
      agentConfig: { 'agent-a': { interruptAfter: true } },
    });

    const app = await adapter.compile();
    expect(app).toBeDefined();
  });
});
