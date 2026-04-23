/**
 * HITL 人在回路管理器测试
 *
 * 测试 HumanInteractionManager、MemoryInterruptStore、FileInterruptStore
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  HumanInteractionManager,
  createHitlManager,
  isAbortDecision,
  isSkipDecision,
  hasStateModification,
  getDecisionGoto,
} from './hitl-manager';
import {
  MemoryInterruptStore,
  FileInterruptStore,
} from './hitl-store';
import { HitlLevel, HumanDecision, InterruptState } from './hitl-types';
import { GraphState } from './types';

// ============ 测试工具 ============

function createTestState(): GraphState {
  return {
    messages: [
      { role: 'user' as const, content: 'test input', timestamp: Date.now() },
    ],
    currentNode: 'test-node',
    context: { key: 'value' },
  };
}

function createTestDecision(action: HumanDecision['action'] = 'approve'): HumanDecision {
  return { action };
}

// ============ MemoryInterruptStore 测试 ============

describe('MemoryInterruptStore', () => {
  let store: MemoryInterruptStore;

  beforeEach(() => {
    store = new MemoryInterruptStore();
  });

  it('应该能保存和加载中断状态', async () => {
    const interrupt: InterruptState = {
      threadId: 'test-1',
      nodeId: 'node-a',
      reason: 'test reason',
      interruptType: 'before_node',
      currentState: createTestState(),
      pending: true,
      createdAt: Date.now(),
    };

    await store.save(interrupt);
    const loaded = await store.load('test-1');

    expect(loaded).toBeDefined();
    expect(loaded?.threadId).toBe('test-1');
    expect(loaded?.pending).toBe(true);
  });

  it('应该能删除中断状态', async () => {
    const interrupt: InterruptState = {
      threadId: 'test-2',
      nodeId: 'node-b',
      reason: 'test',
      interruptType: 'before_node',
      currentState: createTestState(),
      pending: true,
      createdAt: Date.now(),
    };

    await store.save(interrupt);
    await store.delete('test-2');
    const loaded = await store.load('test-2');

    expect(loaded).toBeUndefined();
  });

  it('应该只列出 pending 的中断', async () => {
    const pending: InterruptState = {
      threadId: 'pending-1',
      nodeId: 'node-a',
      reason: 'pending',
      interruptType: 'before_node',
      currentState: createTestState(),
      pending: true,
      createdAt: Date.now(),
    };

    const resolved: InterruptState = {
      threadId: 'resolved-1',
      nodeId: 'node-b',
      reason: 'resolved',
      interruptType: 'before_node',
      currentState: createTestState(),
      pending: false,
      decision: { action: 'approve' },
      createdAt: Date.now(),
    };

    await store.save(pending);
    await store.save(resolved);

    const list = await store.listPending();
    expect(list.length).toBe(1);
    expect(list[0].threadId).toBe('pending-1');
  });

  it('应该能保存和加载 checkpoint', async () => {
    const state = createTestState();
    await store.saveCheckpoint('cp-1', state);

    const loaded = await store.loadCheckpoint('cp-1');
    expect(loaded).toBeDefined();
    expect(loaded?.messages[0].content).toBe('test input');

    // 修改加载后的状态不应影响原始
    if (loaded) {
      loaded.messages[0].content = 'modified';
    }
    const reloaded = await store.loadCheckpoint('cp-1');
    expect(reloaded?.messages[0].content).toBe('test input');
  });

  it('clear 应该清空所有数据', async () => {
    const interrupt: InterruptState = {
      threadId: 'clear-1',
      nodeId: 'node-a',
      reason: 'test',
      interruptType: 'before_node',
      currentState: createTestState(),
      pending: true,
      createdAt: Date.now(),
    };

    await store.save(interrupt);
    await store.saveCheckpoint('clear-1', createTestState());
    store.clear();

    expect(await store.load('clear-1')).toBeUndefined();
    expect(await store.loadCheckpoint('clear-1')).toBeUndefined();
  });

  it('加载不存在的数据应返回 undefined', async () => {
    expect(await store.load('nonexistent')).toBeUndefined();
    expect(await store.loadCheckpoint('nonexistent')).toBeUndefined();
  });
});

// ============ FileInterruptStore 测试 ============

describe('FileInterruptStore', () => {
  let store: FileInterruptStore;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(process.cwd(), '.test-hitl-store');
    store = new FileInterruptStore({ basePath: testDir });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('应该能保存和加载中断状态', async () => {
    const interrupt: InterruptState = {
      threadId: 'file-test-1',
      nodeId: 'node-a',
      reason: 'file test',
      interruptType: 'before_node',
      currentState: createTestState(),
      pending: true,
      createdAt: Date.now(),
    };

    await store.save(interrupt);
    const loaded = await store.load('file-test-1');

    expect(loaded).toBeDefined();
    expect(loaded?.threadId).toBe('file-test-1');
  });

  it('应该能列出 pending 中断', async () => {
    const pending: InterruptState = {
      threadId: 'file-pending',
      nodeId: 'node-a',
      reason: 'pending',
      interruptType: 'before_node',
      currentState: createTestState(),
      pending: true,
      createdAt: Date.now(),
    };

    const resolved: InterruptState = {
      threadId: 'file-resolved',
      nodeId: 'node-b',
      reason: 'resolved',
      interruptType: 'before_node',
      currentState: createTestState(),
      pending: false,
      decision: { action: 'approve' },
      createdAt: Date.now(),
    };

    await store.save(pending);
    await store.save(resolved);

    const list = await store.listPending();
    expect(list.length).toBe(1);
    expect(list[0].threadId).toBe('file-pending');
  });

  it('应该能保存和加载 checkpoint', async () => {
    const state = createTestState();
    await store.saveCheckpoint('file-cp-1', state);

    const loaded = await store.loadCheckpoint('file-cp-1');
    expect(loaded).toBeDefined();
    expect(loaded?.currentNode).toBe('test-node');
  });

  it('应该能删除中断和 checkpoint', async () => {
    await store.save({
      threadId: 'file-del',
      nodeId: 'node-a',
      reason: 'test',
      interruptType: 'before_node',
      currentState: createTestState(),
      pending: true,
      createdAt: Date.now(),
    });
    await store.saveCheckpoint('file-del', createTestState());

    await store.delete('file-del');

    expect(await store.load('file-del')).toBeUndefined();
    expect(await store.loadCheckpoint('file-del')).toBeUndefined();
  });

  it('损坏的 JSON 文件应被跳过', async () => {
    const filePath = path.join(testDir, 'bad_file.json');
    fs.writeFileSync(filePath, 'not valid json', 'utf-8');

    const list = await store.listPending();
    expect(Array.isArray(list)).toBe(true);
  });
});

// ============ HumanInteractionManager 测试 ============

describe('HumanInteractionManager', () => {
  let manager: HumanInteractionManager;

  beforeEach(() => {
    manager = new HumanInteractionManager({
      store: new MemoryInterruptStore(),
    });
  });

  it('应该能创建中断', async () => {
    const state = createTestState();
    const interrupt = await manager.createInterrupt(
      'thread-1',
      'node-a',
      'test reason',
      'before_node',
      state
    );

    expect(interrupt.threadId).toBe('thread-1');
    expect(interrupt.nodeId).toBe('node-a');
    expect(interrupt.pending).toBe(true);
    expect(interrupt.decision).toBeUndefined();
  });

  it('创建中断应保存到 store', async () => {
    const state = createTestState();
    await manager.createInterrupt(
      'thread-store',
      'node-a',
      'test',
      'before_node',
      state
    );

    const list = await manager.listPendingInterrupts();
    expect(list.length).toBe(1);
  });

  it('应该能提交决策', async () => {
    const state = createTestState();
    await manager.createInterrupt(
      'thread-decision',
      'node-a',
      'test',
      'before_node',
      state
    );

    await manager.submitDecision('thread-decision', { action: 'approve' });

    const interrupt = manager.getInterrupt('thread-decision');
    expect(interrupt?.pending).toBe(false);
    expect(interrupt?.decision?.action).toBe('approve');
    expect(interrupt?.resolvedAt).toBeDefined();
  });

  it('应该能等待决策并在提交后返回', async () => {
    const state = createTestState();
    await manager.createInterrupt(
      'thread-wait',
      'node-a',
      'test',
      'before_node',
      state
    );

    // 异步提交决策
    setTimeout(async () => {
      await manager.submitDecision('thread-wait', {
        action: 'approve',
        reason: 'looks good',
      });
    }, 50);

    const decision = await manager.waitForDecision('thread-wait');
    expect(decision.action).toBe('approve');
    expect(decision.reason).toBe('looks good');
  });

  it('超时后应自动批准', async () => {
    const state = createTestState();
    await manager.createInterrupt(
      'thread-timeout',
      'node-a',
      'test',
      'before_node',
      state,
      100 // 100ms 超时
    );

    const decision = await manager.waitForDecision('thread-timeout', 100);
    expect(decision.action).toBe('approve');
    expect(decision.reason).toContain('Auto-approved');
  });

  it('如果已有决策，waitForDecision 应立即返回', async () => {
    const state = createTestState();
    await manager.createInterrupt(
      'thread-pre-decided',
      'node-a',
      'test',
      'before_node',
      state
    );

    await manager.submitDecision('thread-pre-decided', { action: 'reject' });

    const decision = await manager.waitForDecision('thread-pre-decided');
    expect(decision.action).toBe('reject');
  });

  it('应该能编辑状态', async () => {
    const state = createTestState();
    await manager.createInterrupt(
      'thread-edit',
      'node-a',
      'test',
      'before_node',
      state
    );

    const updated = await manager.editState('thread-edit', {
      context: { key: 'new-value' },
    });

    expect(updated.context).toEqual({ key: 'new-value' });

    // 中断状态也应更新
    const interrupt = manager.getInterrupt('thread-edit');
    expect(interrupt?.currentState.context).toEqual({ key: 'new-value' });
  });

  it('无活跃中断时提交决策应抛错', async () => {
    await expect(
      manager.submitDecision('nonexistent', { action: 'approve' })
    ).rejects.toThrow('No active interrupt');
  });

  it('无活跃中断时等待决策应抛错', async () => {
    await expect(
      manager.waitForDecision('nonexistent')
    ).rejects.toThrow('No active interrupt');
  });

  it('无活跃中断时编辑状态应抛错', async () => {
    await expect(
      manager.editState('nonexistent', {})
    ).rejects.toThrow('No active interrupt');
  });

  it('应该能清除中断', async () => {
    const state = createTestState();
    await manager.createInterrupt(
      'thread-clear',
      'node-a',
      'test',
      'before_node',
      state
    );

    await manager.clearInterrupt('thread-clear');

    expect(manager.getInterrupt('thread-clear')).toBeUndefined();
  });

  it('createToolApproval 应创建正确的中断', async () => {
    const state = createTestState();
    const interrupt = await manager.createToolApproval(
      'thread-tool',
      'node-a',
      'write_file',
      { path: '/tmp/test.txt', content: 'hello' },
      state
    );

    expect(interrupt.interruptType).toBe('tool_call');
    expect(interrupt.reason).toContain('write_file');
  });

  it('listPendingInterrupts 应只返回 pending 的中断', async () => {
    const state = createTestState();

    await manager.createInterrupt('t1', 'n1', 'p1', 'before_node', state);
    await manager.createInterrupt('t2', 'n2', 'p2', 'before_node', state);
    await manager.createInterrupt('t3', 'n3', 'p3', 'before_node', state);

    // 解决 t2
    await manager.submitDecision('t2', { action: 'approve' });

    const pending = await manager.listPendingInterrupts();
    expect(pending.length).toBe(2);
    expect(pending.map(p => p.threadId).sort()).toEqual(['t1', 't3']);
  });

  it('决策包含 modifiedState 时应更新状态', async () => {
    const state = createTestState();
    await manager.createInterrupt(
      'thread-modify',
      'node-a',
      'test',
      'before_node',
      state
    );

    await manager.submitDecision('thread-modify', {
      action: 'modify',
      modifiedState: { context: { updated: true } },
    });

    const interrupt = manager.getInterrupt('thread-modify');
    expect(interrupt?.currentState.context).toEqual({ updated: true });
  });
});

// ============ 工具函数测试 ============

describe('HITL 工具函数', () => {
  it('isAbortDecision 应正确识别 abort', () => {
    expect(isAbortDecision({ action: 'abort' })).toBe(true);
    expect(isAbortDecision({ action: 'approve' })).toBe(false);
    expect(isAbortDecision({ action: 'reject' })).toBe(false);
    expect(isAbortDecision({ action: 'skip' })).toBe(false);
    expect(isAbortDecision({ action: 'modify' })).toBe(false);
  });

  it('isSkipDecision 应正确识别 skip', () => {
    expect(isSkipDecision({ action: 'skip' })).toBe(true);
    expect(isSkipDecision({ action: 'approve' })).toBe(false);
  });

  it('hasStateModification 应识别含 modifiedState 的 modify 决策', () => {
    expect(hasStateModification({ action: 'modify', modifiedState: { x: 1 } })).toBe(true);
    expect(hasStateModification({ action: 'modify' })).toBe(false);
    expect(hasStateModification({ action: 'approve', modifiedState: { x: 1 } })).toBe(false);
  });

  it('getDecisionGoto 应返回 goto 字段', () => {
    expect(getDecisionGoto({ action: 'reject', goto: 'fallback' })).toBe('fallback');
    expect(getDecisionGoto({ action: 'approve' })).toBeUndefined();
  });
});

// ============ 工厂函数测试 ============

describe('createHitlManager', () => {
  it('应能创建管理器实例', () => {
    const manager = createHitlManager();
    expect(manager).toBeInstanceOf(HumanInteractionManager);
  });

  it('应能接受自定义 store', () => {
    const store = new MemoryInterruptStore();
    const manager = createHitlManager({ store });
    expect(manager.getStore()).toBe(store);
  });

  it('应能发射事件', async () => {
    const events: Array<{ type: string }> = [];
    const manager = createHitlManager({
      emitter: (e) => events.push(e as { type: string }),
      graphId: 'test-graph',
    });

    await manager.createInterrupt(
      'evt-1',
      'node-a',
      'test',
      'before_node',
      createTestState()
    );

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('hitl_interrupt');
  });
});

// ============ 多线程隔离测试 ============

describe('多线程隔离', () => {
  let manager: HumanInteractionManager;

  beforeEach(() => {
    manager = new HumanInteractionManager({
      store: new MemoryInterruptStore(),
    });
  });

  it('不同线程的中断应独立', async () => {
    const state = createTestState();

    await manager.createInterrupt('iso-1', 'node-a', 'reason1', 'before_node', state);
    await manager.createInterrupt('iso-2', 'node-b', 'reason2', 'after_node', state);

    await manager.submitDecision('iso-1', { action: 'approve' });

    const i1 = manager.getInterrupt('iso-1');
    const i2 = manager.getInterrupt('iso-2');

    expect(i1?.decision?.action).toBe('approve');
    expect(i1?.pending).toBe(false);
    expect(i2?.pending).toBe(true);
    expect(i2?.decision).toBeUndefined();
  });

  it('并发创建和决策不应互相干扰', async () => {
    const state = createTestState();

    // 并行创建
    const promises = Array.from({ length: 5 }, (_, i) =>
      manager.createInterrupt(`concurrent-${i}`, `node-${i}`, `reason-${i}`, 'before_node', state)
    );
    await Promise.all(promises);

    // 并行决策（偶数 approve，奇数 reject）
    const decisionPromises = Array.from({ length: 5 }, async (_, i) => {
      const action = i % 2 === 0 ? 'approve' : 'reject';
      await manager.submitDecision(`concurrent-${i}`, { action });
    });
    await Promise.all(decisionPromises);

    // 验证
    for (let i = 0; i < 5; i++) {
      const interrupt = manager.getInterrupt(`concurrent-${i}`);
      const expectedAction = i % 2 === 0 ? 'approve' : 'reject';
      expect(interrupt?.decision?.action).toBe(expectedAction);
    }
  });
});

// ============ YAML Loader 集成测试 ============

describe('YAML Loader HITL 配置', () => {
  it('应该能从 YAML 加载 hitl 配置', async () => {
    const { loadFromYaml } = await import('./loader');
    const yaml = `
id: test-hitl-yaml
name: Test HITL
mode: lightweight
entry: agent-a
hitl:
  level: tool_approval
  requireToolApproval: true
  approvedTools:
    - read_file
    - grep
  autoApproveTimeoutMs: 300000
agents:
  - id: agent-a
    name: Agent A
    role: worker
    systemPrompt: You are a worker
  - id: agent-b
    name: Agent B
    role: reviewer
    systemPrompt: You are a reviewer
edges:
  - source: agent-a
    target: agent-b
    type: direct
`;

    const graph = loadFromYaml(yaml);
    const raw = graph.getRaw();

    expect(raw.hitlConfig).toBeDefined();
    expect(raw.hitlConfig?.level).toBe('tool_approval');
    expect(raw.hitlConfig?.requireToolApproval).toBe(true);
    expect(raw.hitlConfig?.approvedTools).toEqual(['read_file', 'grep']);
    expect(raw.hitlConfig?.autoApproveTimeoutMs).toBe(300000);
  });

  it('应该能从 YAML 加载 node_interrupt 配置', async () => {
    const { loadFromYaml } = await import('./loader');
    const yaml = `
id: test-node-interrupt
name: Node Interrupt Test
mode: lightweight
entry: analyzer
hitl:
  level: node_interrupt
  interruptNodes:
    - security-scanner
    - deployer
agents:
  - id: analyzer
    name: Analyzer
    role: analyzer
    systemPrompt: Analyze code
  - id: security-scanner
    name: Security Scanner
    role: security
    systemPrompt: Scan for vulnerabilities
  - id: deployer
    name: Deployer
    role: deploy
    systemPrompt: Deploy to production
edges:
  - source: analyzer
    target: security-scanner
    type: direct
  - source: security-scanner
    target: deployer
    type: direct
`;

    const graph = loadFromYaml(yaml);
    const raw = graph.getRaw();

    expect(raw.hitlConfig?.level).toBe('node_interrupt');
    expect(raw.hitlConfig?.interruptNodes).toEqual(['security-scanner', 'deployer']);
  });
});
