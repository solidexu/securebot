/**
 * CLI HITL 交互测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatInterrupt, formatDecision, formatPendingInterrupts, HitlCli } from './hitl-interaction';
import { HumanInteractionManager, MemoryInterruptStore } from '../core/collaboration/index.js';

// Mock console to avoid noise
vi.spyOn(console, 'log').mockImplementation(() => {});

function createTestInterrupt(overrides: Partial<any> = {}) {
  return {
    threadId: 'test-thread-001',
    nodeId: 'agent-a',
    reason: '需要审批',
    interruptType: 'before_node',
    currentState: { messages: [], currentNode: 'agent-a', context: {} },
    pending: true,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('formatInterrupt', () => {
  it('应该格式化中断信息', () => {
    const interrupt = createTestInterrupt();
    const output = formatInterrupt(interrupt);
    
    expect(output).toContain('等待人类决策');
    expect(output).toContain('agent-a');
    expect(output).toContain('需要审批');
    expect(output).toContain('节点前');
  });

  it('应该处理不同类型的中断', () => {
    const interrupt = createTestInterrupt({ interruptType: 'after_node' });
    const output = formatInterrupt(interrupt);
    
    expect(output).toContain('节点后');
  });

  it('应该处理工具调用中断', () => {
    const interrupt = createTestInterrupt({
      interruptType: 'tool_call',
      toolCall: { name: 'search', args: { query: 'test' } },
    });
    const output = formatInterrupt(interrupt);
    
    expect(output).toContain('工具调用');
  });

  it('应该包含状态快照信息', () => {
    const interrupt = createTestInterrupt({
      currentState: { messages: [{ role: 'user', content: 'Hello' }], currentNode: 'agent-a', context: {} },
    });
    const output = formatInterrupt(interrupt);
    
    expect(output).toContain('当前状态');
  });
});

describe('formatDecision', () => {
  it('应该格式化 approve 决策', () => {
    const decision = { action: 'approve' as const, reason: 'Looks good' };
    const output = formatDecision(decision);
    
    expect(output).toContain('通过');
    expect(output).toContain('Looks good');
  });

  it('应该格式化 reject 决策', () => {
    const decision = { action: 'reject' as const, goto: 'fallback', reason: 'Not good' };
    const output = formatDecision(decision);
    
    expect(output).toContain('拒绝');
    expect(output).toContain('fallback');
  });

  it('应该格式化 abort 决策', () => {
    const decision = { action: 'abort' as const };
    const output = formatDecision(decision);
    
    expect(output).toContain('终止');
  });
});

describe('formatPendingInterrupts', () => {
  it('空列表应该显示没有待处理中断', () => {
    const output = formatPendingInterrupts([]);
    expect(output).toContain('没有待处理的中断');
  });

  it('应该格式化多个中断', () => {
    const interrupts = [
      createTestInterrupt({ threadId: 't1', nodeId: 'a' }),
      createTestInterrupt({ threadId: 't2', nodeId: 'b' }),
    ];
    const output = formatPendingInterrupts(interrupts);
    
    expect(output).toContain('2 个');
    expect(output).toContain('t1');
    expect(output).toContain('t2');
  });
});

describe('HitlCli', () => {
  let manager: HumanInteractionManager;
  let cli: HitlCli;

  beforeEach(() => {
    manager = new HumanInteractionManager(new MemoryInterruptStore());
    cli = new HitlCli(manager, { nonInteractive: true });
  });

  it('status 应该返回空列表', async () => {
    const result = await cli.status();
    expect(result).toContain('没有待处理的中断');
  });

  it('status 应该返回待处理中断', async () => {
    // 创建中断（异步）
    const interruptPromise = manager.createInterrupt(
      'test-thread', 'node-a', 'Need approval', 'before_node',
      { messages: [], currentNode: 'node-a', context: {} }
    );

    // 等待中断被创建但不等待它完成
    await new Promise(r => setTimeout(r, 10));

    const result = await cli.status();
    expect(result).toContain('test-thread');
    expect(result).toContain('node-a');

    // 清理：提交决策让 createInterrupt 完成
    manager.submitDecision('test-thread', { action: 'approve' });
    await interruptPromise;
  });

  it('approve 应该批准中断', async () => {
    // 创建中断
    const interruptPromise = manager.createInterrupt(
      'test-thread', 'node-a', 'Need approval', 'before_node',
      { messages: [], currentNode: 'node-a', context: {} }
    );

    await new Promise(r => setTimeout(r, 10));

    const result = await cli.approve('test-thread');
    expect(result).toContain('已批准');

    manager.submitDecision('test-thread', { action: 'approve' });
    await interruptPromise;
  });

  it('reject 应该拒绝中断', async () => {
    const interruptPromise = manager.createInterrupt(
      'test-thread', 'node-a', 'Need approval', 'before_node',
      { messages: [], currentNode: 'node-a', context: {} }
    );

    await new Promise(r => setTimeout(r, 10));

    const result = await cli.reject('test-thread', 'fallback');
    expect(result).toContain('已拒绝');
    expect(result).toContain('fallback');

    manager.submitDecision('test-thread', { action: 'reject', goto: 'fallback' });
    await interruptPromise;
  });

  it('skip 应该跳过中断', async () => {
    const interruptPromise = manager.createInterrupt(
      'test-thread', 'node-a', 'Need approval', 'before_node',
      { messages: [], currentNode: 'node-a', context: {} }
    );

    await new Promise(r => setTimeout(r, 10));

    const result = await cli.skip('test-thread');
    expect(result).toContain('已跳过');

    manager.submitDecision('test-thread', { action: 'skip' });
    await interruptPromise;
  });

  it('abort 应该终止中断', async () => {
    const interruptPromise = manager.createInterrupt(
      'test-thread', 'node-a', 'Need approval', 'before_node',
      { messages: [], currentNode: 'node-a', context: {} }
    );

    await new Promise(r => setTimeout(r, 10));

    const result = await cli.abort('test-thread');
    expect(result).toContain('已终止');

    manager.submitDecision('test-thread', { action: 'abort' });
    await interruptPromise;
  });

  it('editState 应该更新状态', async () => {
    const interruptPromise = manager.createInterrupt(
      'test-thread', 'node-a', 'Need approval', 'before_node',
      { messages: [], currentNode: 'node-a', context: {} }
    );

    await new Promise(r => setTimeout(r, 10));

    const result = await cli.editState('test-thread', '{"key": "value"}');
    expect(result).toContain('状态已更新');

    manager.submitDecision('test-thread', { action: 'approve' });
    await interruptPromise;
  });

  it('editState 无效 JSON 应该返回错误', async () => {
    const result = await cli.editState('test-thread', 'invalid json');
    expect(result).toContain('无效');
  });
});
