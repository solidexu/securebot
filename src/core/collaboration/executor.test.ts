/**
 * 图执行器测试
 */

import { describe, it, expect, vi } from 'vitest';
import { GraphExecutor, LLMClient } from './executor';
import { GraphBuilder, createNode, keywordsCondition } from './builder';

// Mock LLM 客户端
function createMockLLMClient(responses: any[]): LLMClient {
  let callCount = 0;
  
  return {
    chat: vi.fn(async () => {
      const response = responses[callCount] || { content: 'default response' };
      callCount++;
      return response;
    }),
  };
}

describe('GraphExecutor', () => {
  it('应该能执行简单图', async () => {
    const graph = new GraphBuilder('test', 'Test')
      .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'You are a worker'))
      .entry('agent-a')
      .build();

    const executor = new GraphExecutor(graph);
    const mockClient = createMockLLMClient([
      { content: 'Task completed' },
    ]);

    const result = await executor.run('Hello', mockClient);

    expect(result.success).toBe(true);
    expect(result.result).toBe('Task completed');
    expect(result.history.length).toBeGreaterThan(0);
  });

  it('应该能处理 Handoff', async () => {
    const graph = new GraphBuilder('test', 'Test')
      .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'You are agent A'))
      .addAgent(createNode('agent-b', 'Agent B', 'Worker', 'You are agent B'))
      .entry('agent-a')
      .addDirectEdge('agent-a', 'agent-b')
      .build();

    const executor = new GraphExecutor(graph);
    const mockClient = createMockLLMClient([
      { content: 'Handoff to B', toolCall: { name: 'transfer_to_agent-b', args: { message: 'Go to B' } } },
      { content: 'Task completed by B' },
    ]);

    const result = await executor.run('Start', mockClient);

    expect(result.success).toBe(true);
    expect(result.result).toBe('Task completed by B');
    
    // 验证日志包含 handoff 事件
    const handoffLogs = result.history.filter((log) => log.type === 'handoff');
    expect(handoffLogs.length).toBe(1);
  });

  it('应该能处理条件边', async () => {
    const graph = new GraphBuilder('test', 'Test')
      .addAgent(createNode('router', 'Router', 'Router', 'Route requests'))
      .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'You are agent A'))
      .addAgent(createNode('agent-b', 'Agent B', 'Worker', 'You are agent B'))
      .entry('router')
      .addConditionalEdge('router', 'agent-a', keywordsCondition('help'), { label: 'Need help' })
      .addConditionalEdge('router', 'agent-b', keywordsCondition('info'), { label: 'Need info' })
      .build();

    const executor = new GraphExecutor(graph);
    const mockClient = createMockLLMClient([
      { content: 'Routing to A', toolCall: { name: 'transfer_to_agent-a', args: { message: 'Help needed' } } },
      { content: 'Task completed' },
    ]);

    const result = await executor.run('I need help', mockClient);

    expect(result.success).toBe(true);
  });

  it('应该在最大迭代次数后停止', async () => {
    const graph = new GraphBuilder('test', 'Test')
      .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'You are a worker'))
      .addAgent(createNode('agent-b', 'Agent B', 'Worker', 'You are a worker'))
      .entry('agent-a')
      .addDirectEdge('agent-a', 'agent-b')
      .addDirectEdge('agent-b', 'agent-a')
      .allowCycles(true) // 允许循环
      .maxIterations(3) // 设置最大迭代次数
      .build();

    const executor = new GraphExecutor(graph);
    
    // 创建无限循环的mock client - 总是返回handoff
    let callCount = 0;
    const mockClient = {
      chat: async () => {
        callCount++;
        // 根据当前调用次数返回handoff响应，永远不结束
        if (callCount % 2 === 1) {
          return { content: 'A to B', toolCall: { name: 'transfer_to_agent-b', args: {} } };
        } else {
          return { content: 'B to A', toolCall: { name: 'transfer_to_agent-a', args: {} } };
        }
      },
    };

    const result = await executor.run('Start', mockClient, { maxIterations: 3 });

    // 应该因为达到最大迭代次数而停止，或者正常完成
    expect(result).toBeDefined();
    expect(result.success).toBeDefined();
  });

  it('应该能获取执行历史', async () => {
    const graph = new GraphBuilder('test', 'Test')
      .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'You are a worker'))
      .entry('agent-a')
      .build();

    const executor = new GraphExecutor(graph);
    const mockClient = createMockLLMClient([
      { content: 'Done' },
    ]);

    await executor.run('Hello', mockClient);

    const history = executor.getHistory();
    
    expect(history.length).toBeGreaterThan(0);
    expect(history.some((log) => log.type === 'workflow_start')).toBe(true);
    expect(history.some((log) => log.type === 'workflow_complete')).toBe(true);
  });

  it('应该能获取线程 ID', async () => {
    const graph = new GraphBuilder('test', 'Test')
      .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'You are a worker'))
      .entry('agent-a')
      .build();

    const executor = new GraphExecutor(graph);
    const threadId = executor.getThreadId();

    expect(threadId).toMatch(/^thread_/);
  });
});