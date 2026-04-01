/**
 * 统一协调器测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiedOrchestrator, createOrchestrator } from './orchestrator';
import { GraphBuilder, createNode, keywordsCondition } from './builder';

// Mock LLM 客户端
function createMockLLMClient() {
  return {
    chat: vi.fn().mockResolvedValue({
      content: 'Mock response',
    }),
  };
}

// Mock LangGraph
const mockLangGraph = {
  StateGraph: vi.fn().mockImplementation(() => ({
    addNode: vi.fn(),
    setEntryPoint: vi.fn(),
    addEdge: vi.fn(),
    addConditionalEdges: vi.fn(),
    compile: vi.fn().mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        messages: [{ role: 'assistant', content: 'Result from LangGraph' }],
        currentNode: 'agent-a',
      }),
      stream: vi.fn(),
      getState: vi.fn(),
      updateState: vi.fn(),
    }),
  })),
  END: '__end__',
  START: '__start__',
  MemorySaver: vi.fn(),
};

describe('UnifiedOrchestrator', () => {
  describe('模式检测', () => {
    it('应该默认使用轻量级模式', () => {
      const graph = new GraphBuilder('test', 'Test')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const orchestrator = new UnifiedOrchestrator(graph, {
        llmClient: createMockLLMClient(),
      });

      expect(orchestrator.getMode()).toBe('lightweight');
    });

    it('应该从配置读取模式', () => {
      const graph = new GraphBuilder('test', 'Test')
        .mode('langgraph')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const orchestrator = new UnifiedOrchestrator(graph, {
        llmClient: createMockLLMClient(),
      });

      expect(orchestrator.getMode()).toBe('langgraph');
    });

    it('应该优先使用显式配置的模式', () => {
      const graph = new GraphBuilder('test', 'Test')
        .mode('langgraph')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const orchestrator = new UnifiedOrchestrator(graph, {
        llmClient: createMockLLMClient(),
        mode: 'lightweight',
      });

      expect(orchestrator.getMode()).toBe('lightweight');
    });
  });

  describe('轻量级模式执行', () => {
    it('应该能执行图', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'You are a worker'))
        .entry('agent-a')
        .build();

      const orchestrator = new UnifiedOrchestrator(graph, {
        llmClient: createMockLLMClient(),
      });

      const result = await orchestrator.run('Hello');

      expect(result.success).toBe(true);
      expect(result.mode).toBe('lightweight');
    });

    it('应该发送事件', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const orchestrator = new UnifiedOrchestrator(graph, {
        llmClient: createMockLLMClient(),
      });

      const events: any[] = [];
      await orchestrator.run('Hello', {
        onEvent: (event) => events.push(event),
      });

      expect(events.some((e) => e.type === 'start')).toBe(true);
      expect(events.some((e) => e.type === 'complete')).toBe(true);
    });
  });

  describe('LangGraph 模式执行', () => {
    it('应该能执行图', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .mode('langgraph')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const orchestrator = new UnifiedOrchestrator(graph, {
        llmClient: createMockLLMClient(),
        langgraph: { langgraph: mockLangGraph },
      });

      const result = await orchestrator.run('Hello');

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

      const orchestrator = new UnifiedOrchestrator(graph, {
        llmClient: createMockLLMClient(),
        langgraph: { langgraph: mockLangGraph },
      });

      const state = await orchestrator.getState('thread-123');
      expect(state).toBeDefined();
    });

    it('应该能恢复执行', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .mode('langgraph')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const orchestrator = new UnifiedOrchestrator(graph, {
        llmClient: createMockLLMClient(),
        langgraph: { langgraph: mockLangGraph },
      });

      const result = await orchestrator.resume('thread-123', { approved: true });

      expect(result.success).toBe(true);
      expect(result.threadId).toBe('thread-123');
    });

    it('轻量级模式不应该支持恢复', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const orchestrator = new UnifiedOrchestrator(graph, {
        llmClient: createMockLLMClient(),
      });

      await expect(orchestrator.resume('thread-123')).rejects.toThrow(
        'Resume only supported in LangGraph mode'
      );
    });
  });

  describe('流式执行', () => {
    it('应该能流式执行', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .mode('langgraph')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const orchestrator = new UnifiedOrchestrator(graph, {
        llmClient: createMockLLMClient(),
        langgraph: { langgraph: mockLangGraph },
      });

      const events = [];
      for await (const event of orchestrator.stream('Hello')) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('start');
    });
  });

  describe('createOrchestrator 快捷方法', () => {
    it('应该能创建协调器', () => {
      const graph = new GraphBuilder('test', 'Test')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const orchestrator = createOrchestrator(graph, createMockLLMClient());

      expect(orchestrator).toBeInstanceOf(UnifiedOrchestrator);
      expect(orchestrator.getMode()).toBe('lightweight');
    });
  });
});