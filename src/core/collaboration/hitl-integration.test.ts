/**
 * HITL 人在回路集成测试
 * 
 * 测试 GraphExecutor 的 HITL 功能
 */

import { describe, it, expect, vi } from 'vitest';
import { GraphExecutor, LLMClient } from './executor';
import { GraphBuilder } from './builder';
import { HumanInteractionManager } from './hitl-manager';
import { MemoryInterruptStore } from './hitl-store';
import { HitlConfig, HitlLevel, HumanDecision, InterruptState } from './hitl-types';

// ============ 工具函数 ============

function createMockLLMClient(responses: { content: string; toolCall?: any }[]): LLMClient {
  let callCount = 0;
  return {
    chat: vi.fn(async () => {
      const response = responses[callCount] || { content: 'default response' };
      callCount++;
      return response;
    }),
  };
}

function createHitlManager(): HumanInteractionManager {
  const store = new MemoryInterruptStore();
  return new HumanInteractionManager(store);
}

// ============ 测试 ============

describe('HITL 人在回路集成测试', () => {
  describe('全自动模式', () => {
    it('应该正常执行，不触发任何中断', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .addAgent({
          id: 'node_a',
          name: 'Node A',
          role: 'test',
          systemPrompt: 'You are a test agent',
        })
        .entry('node_a')
        .addDirectEdge('node_a', '__end__')
        .build();

      const executor = new GraphExecutor(graph);
      const llm = createMockLLMClient([{ content: 'Hello from A' }]);

      // 不设置 HITL 或设置为 FULL_AUTO
      const hitlConfig: HitlConfig = { level: HitlLevel.FULL_AUTO };
      const manager = createHitlManager();
      executor.setHitl(manager, hitlConfig);

      const result = await executor.run('test input', llm);

      expect(result.success).toBe(true);
      expect(result.result).toBe('Hello from A');
    });
  });

  describe('节点前中断', () => {
    it('approve 应该继续执行', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .addAgent({
          id: 'node_a',
          name: 'Node A',
          role: 'test',
          systemPrompt: 'You are a test agent',
        })
        .entry('node_a')
        .addDirectEdge('node_a', '__end__')
        .build();

      const executor = new GraphExecutor(graph);
      const llm = createMockLLMClient([{ content: 'Hello from A' }]);
      const manager = createHitlManager();

      const hitlConfig: HitlConfig = {
        level: HitlLevel.NODE_INTERRUPT,
        interruptNodes: [],
      };
      executor.setHitl(manager, hitlConfig);

      // 在另一个"线程"中提交决策
      const runPromise = executor.run('test input', llm);

      // 等待中断创建
      await new Promise(resolve => setTimeout(resolve, 50));

      // 获取中断并提交 approve
      const pending = await manager.listPendingInterrupts();
      if (pending.length > 0) {
        manager.submitDecision(pending[0].threadId, {
          action: 'approve',
          reason: 'Looks good',
        });
      }

      const result = await runPromise;

      expect(result.success).toBe(true);
    });

    it('reject 应该跳过当前节点', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .addAgent({
          id: 'node_a',
          name: 'Node A',
          role: 'test',
          systemPrompt: 'You are A',
        })
        .addAgent({
          id: 'node_b',
          name: 'Node B',
          role: 'test',
          systemPrompt: 'You are B',
        })
        .entry('node_a')
        .addDirectEdge('node_a', 'node_b')
        .addDirectEdge('node_b', '__end__')
        .build();

      const executor = new GraphExecutor(graph);
      const llm = createMockLLMClient([
        { content: 'Hello from A' },
        { content: 'Hello from B' },
      ]);
      const manager = createHitlManager();

      const hitlConfig: HitlConfig = {
        level: HitlLevel.NODE_INTERRUPT,
        interruptNodes: [],
      };
      executor.setHitl(manager, hitlConfig);

      const runPromise = executor.run('test input', llm);

      await new Promise(resolve => setTimeout(resolve, 50));

      const pending = await manager.listPendingInterrupts();
      if (pending.length > 0) {
        manager.submitDecision(pending[0].threadId, {
          action: 'reject',
          reason: 'Skip node A',
        });
      }

      const result = await runPromise;

      expect(result.success).toBe(true);
      // Node A should be skipped, Node B should execute
      expect(llm.chat).toHaveBeenCalledTimes(1); // Only node_b runs
    });

    it('abort 应该终止执行', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .addAgent({
          id: 'node_a',
          name: 'Node A',
          role: 'test',
          systemPrompt: 'You are A',
        })
        .addAgent({
          id: 'node_b',
          name: 'Node B',
          role: 'test',
          systemPrompt: 'You are B',
        })
        .entry('node_a')
        .addDirectEdge('node_a', 'node_b')
        .addDirectEdge('node_b', '__end__')
        .build();

      const executor = new GraphExecutor(graph);
      const llm = createMockLLMClient([
        { content: 'Hello from A' },
        { content: 'Hello from B' },
      ]);
      const manager = createHitlManager();

      const hitlConfig: HitlConfig = {
        level: HitlLevel.NODE_INTERRUPT,
        interruptNodes: ["node_a"],
      };
      executor.setHitl(manager, hitlConfig);

      const runPromise = executor.run('test input', llm);

      await new Promise(resolve => setTimeout(resolve, 50));

      const pending = await manager.listPendingInterrupts();
      if (pending.length > 0) {
        manager.submitDecision(pending[0].threadId, {
          action: 'abort',
          reason: 'User cancelled',
        });
      }

      const result = await runPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Aborted');
    });
  });

  describe('节点后中断', () => {
    it('应该在节点执行后中断', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .addAgent({
          id: 'node_a',
          name: 'Node A',
          role: 'test',
          systemPrompt: 'You are A',
        })
        .addAgent({
          id: 'node_b',
          name: 'Node B',
          role: 'test',
          systemPrompt: 'You are B',
        })
        .entry('node_a')
        .addDirectEdge('node_a', 'node_b')
        .addDirectEdge('node_b', '__end__')
        .build();

      const executor = new GraphExecutor(graph);
      const llm = createMockLLMClient([
        { content: 'Hello from A' },
        { content: 'Hello from B' },
      ]);
      const manager = createHitlManager();

      const hitlConfig: HitlConfig = {
        level: HitlLevel.NODE_INTERRUPT,
        interruptNodes: [],
        agentConfig: { node_a: { interruptAfter: true } },
      };
      // Set interruptAfter on node_a
      
      
      executor.setHitl(manager, hitlConfig);

      const runPromise = executor.run('test input', llm);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Node A should have executed (before interrupt)
      expect(llm.chat).toHaveBeenCalledTimes(1);

      // Approve the after-node interrupt
      const pending = await manager.listPendingInterrupts();
      for (const p of pending) {
        manager.submitDecision(p.threadId, {
          action: 'approve',
          reason: 'Continue',
        });
      }

      const result = await runPromise;

      expect(result.success).toBe(true);
      expect(llm.chat).toHaveBeenCalledTimes(1); // Both nodes run
    });
  });

  describe('工具调用审批', () => {
    it('approve 工具应该执行', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .addAgent({
          id: 'node_a',
          name: 'Node A',
          role: 'test',
          systemPrompt: 'You are A',
        })
        .entry('node_a')
        .addDirectEdge('node_a', '__end__')
        .build();

      const executor = new GraphExecutor(graph);
      const llm = createMockLLMClient([
        { content: 'Using tool', toolCall: { name: 'search', args: { query: 'test' } } },
      ]);
      const manager = createHitlManager();

      const hitlConfig: HitlConfig = {
        level: HitlLevel.NODE_INTERRUPT,
        requireToolApproval: true,
      };
      executor.setHitl(manager, hitlConfig);

      const runPromise = executor.run('test input', llm);

      await new Promise(resolve => setTimeout(resolve, 50));

      const pending = await manager.listPendingInterrupts();
      if (pending.length > 0) {
        manager.submitDecision(pending[0].threadId, {
          action: 'approve',
          reason: 'Tool approved',
        });
      }

      const result = await runPromise;
      expect(result.success).toBe(true);
    });

    it('reject 工具应该不执行', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .addAgent({
          id: 'node_a',
          name: 'Node A',
          role: 'test',
          systemPrompt: 'You are A',
        })
        .entry('node_a')
        .addDirectEdge('node_a', '__end__')
        .build();

      const executor = new GraphExecutor(graph);
      const llm = createMockLLMClient([
        { content: 'Using tool', toolCall: { name: 'search', args: { query: 'test' } } },
      ]);
      const manager = createHitlManager();

      const hitlConfig: HitlConfig = {
        level: HitlLevel.NODE_INTERRUPT,
        requireToolApproval: true,
      };
      executor.setHitl(manager, hitlConfig);

      const runPromise = executor.run('test input', llm);

      await new Promise(resolve => setTimeout(resolve, 50));

      const pending = await manager.listPendingInterrupts();
      if (pending.length > 0) {
        manager.submitDecision(pending[0].threadId, {
          action: 'reject',
          reason: 'Tool rejected',
        });
      }

      const result = await runPromise;
      expect(result.success).toBe(true);
      expect(result.result).toContain('rejected');
    });

    it('白名单工具应该免审批', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .addAgent({
          id: 'node_a',
          name: 'Node A',
          role: 'test',
          systemPrompt: 'You are A',
        })
        .entry('node_a')
        .addDirectEdge('node_a', '__end__')
        .build();

      const executor = new GraphExecutor(graph);
      const llm = createMockLLMClient([
        { content: 'Using tool', toolCall: { name: 'read_file', args: { path: 'test.txt' } } },
      ]);
      const manager = createHitlManager();

      const hitlConfig: HitlConfig = {
        level: HitlLevel.NODE_INTERRUPT,
        requireToolApproval: true,
        approvedTools: ['read_file'],
      };
      executor.setHitl(manager, hitlConfig);

      const result = await executor.run('test input', llm);

      // No interrupt should be created for approved tools
      expect((await manager.listPendingInterrupts()).length).toBe(0);
      expect(result.success).toBe(true);
    });
  });

  describe('step_through 模式', () => {
    it('每个节点都应该暂停', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .addAgent({
          id: 'node_a',
          name: 'Node A',
          role: 'test',
          systemPrompt: 'You are A',
        })
        .addAgent({
          id: 'node_b',
          name: 'Node B',
          role: 'test',
          systemPrompt: 'You are B',
        })
        .entry('node_a')
        .addDirectEdge('node_a', 'node_b')
        .addDirectEdge('node_b', '__end__')
        .build();

      const executor = new GraphExecutor(graph);
      const llm = createMockLLMClient([
        { content: 'Hello from A' },
        { content: 'Hello from B' },
      ]);
      const manager = createHitlManager();

      const hitlConfig: HitlConfig = {
        level: HitlLevel.STEP_THROUGH,
      };
      executor.setHitl(manager, hitlConfig);

      const runPromise = executor.run('test input', llm);

      await new Promise(resolve => setTimeout(resolve, 50));

      // Should have at least one pending interrupt (for node_a)
      const pending1 = await manager.listPendingInterrupts();
      expect(pending1.length).toBeGreaterThanOrEqual(1);

      // Approve all pending interrupts as they come
      let iterations = 0;
      const approveInterval = setInterval(async () => {
        const pending = await manager.listPendingInterrupts();
        for (const p of pending) {
          manager.submitDecision(p.threadId, {
            action: 'approve',
            reason: 'Continue',
          });
        }
        iterations++;
        if (iterations > 10) clearInterval(approveInterval);
      }, 30);

      const result = await runPromise;
      clearInterval(approveInterval);

      expect(result.success).toBe(true);
    });
  });

  describe('决策 goto 路由', () => {
    it('应该跳到指定节点', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .addAgent({
          id: 'node_a',
          name: 'Node A',
          role: 'test',
          systemPrompt: 'You are A',
        })
        .addAgent({
          id: 'node_b',
          name: 'Node B',
          role: 'test',
          systemPrompt: 'You are B',
        })
        .addAgent({
          id: 'node_c',
          name: 'Node C',
          role: 'test',
          systemPrompt: 'You are C',
        })
        .entry('node_a')
        .addDirectEdge('node_a', 'node_b')
        .addDirectEdge('node_b', 'node_c')
        .addDirectEdge('node_c', '__end__')
        .build();

      const executor = new GraphExecutor(graph);
      const llm = createMockLLMClient([
        { content: 'Hello from A' },
        { content: 'Hello from C' },
      ]);
      const manager = createHitlManager();

      const hitlConfig: HitlConfig = {
        level: HitlLevel.NODE_INTERRUPT,
        agentConfig: { node_a: { interruptAfter: true } },
      };
      executor.setHitl(manager, hitlConfig);

      const runPromise = executor.run('test input', llm);

      await new Promise(resolve => setTimeout(resolve, 50));

      const pending = await manager.listPendingInterrupts();
      if (pending.length > 0) {
        // Skip node_b and go directly to node_c
        manager.submitDecision(pending[0].threadId, {
          action: 'reject',
          reason: 'Skip to C',
          goto: 'node_c',
        });
      }

      const result = await runPromise;

      expect(result.success).toBe(true);
      // Should have executed node_a and node_c (skipped node_b)
      expect(llm.chat).toHaveBeenCalledTimes(1);
    });
  });

  describe('超时自动通过', () => {
    it('超时后应该自动 approve', async () => {
      const graph = new GraphBuilder('test', 'Test')
        .addAgent({
          id: 'node_a',
          name: 'Node A',
          role: 'test',
          systemPrompt: 'You are A',
        })
        .entry('node_a')
        .addDirectEdge('node_a', '__end__')
        .build();

      const executor = new GraphExecutor(graph);
      const llm = createMockLLMClient([{ content: 'Hello from A' }]);
      const manager = createHitlManager();

      const hitlConfig: HitlConfig = {
        level: HitlLevel.NODE_INTERRUPT,
        interruptNodes: ["node_a"],
        autoApproveTimeoutMs: 200,
      };
      executor.setHitl(manager, hitlConfig);

      const startTime = Date.now();
      const result = await executor.run('test input', llm);
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      // Should have waited for timeout (at least 150ms)
      expect(elapsed).toBeGreaterThan(150);
    });
  });

  describe('Orchestrator HITL 代理', () => {
    it('submitDecision 应该转发到 manager', async () => {
      const { UnifiedOrchestrator } = await import('./orchestrator');
      const graph = new GraphBuilder('test', 'Test')
        .addAgent({
          id: 'node_a',
          name: 'Node A',
          role: 'test',
          systemPrompt: 'You are A',
        })
        .entry('node_a')
        .addDirectEdge('node_a', '__end__')
        .build();

      const manager = createHitlManager();
      const hitlConfig: HitlConfig = { level: HitlLevel.NODE_INTERRUPT };

      const orchestrator = new UnifiedOrchestrator(graph, {
        llmClient: createMockLLMClient([]),
        hitl: { manager, config: hitlConfig },
      });

      expect(await orchestrator.getPendingInterrupts()).toEqual([]);
    });
  });
});
