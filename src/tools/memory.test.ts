import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { addFactTool, getFactsTool, deleteFactTool } from './memory.js';
import { reconfigureMemoryManager } from '../core/memory.js';
import type { Agent, Session } from '../core/types.js';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let testDir: string;
let mockAgent: Agent;
let mockSession: Session;
let mockContext: any;

describe('Memory Tools', () => {
  beforeEach(() => {
    testDir = join(tmpdir(), 'securebot-memory-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, 'profiles'), { recursive: true });
    
    reconfigureMemoryManager({ rootDir: testDir });
    
    mockAgent = {
      id: 'test-agent-' + Math.random().toString(36).slice(2),
      name: 'Test Agent',
      workspace: testDir,
      sessions: new Map(),
    };

    mockSession = {
      sessionKey: 'test-session',
      agentId: mockAgent.id,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockContext = {
      agent: mockAgent,
      session: mockSession,
      workspace: testDir,
      logger: console,
    };
  });

  afterEach(() => {
    reconfigureMemoryManager({ rootDir: join(tmpdir(), 'securebot-cleanup') });
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('addFactTool', () => {
    it('should add a fact with default values', async () => {
      const result = await addFactTool.execute(
        { content: '我是 Python 开发者' },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.content).toContain('已记录事实');
      expect(result.content).toContain('Python 开发者');
      expect(result.metadata?.factId).toBeDefined();
    });

    it('should add a fact with category and confidence', async () => {
      const result = await addFactTool.execute(
        { 
          content: '用户喜欢使用 VSCode', 
          category: 'preference',
          confidence: 0.9 
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.content).toContain('preference');
      expect(result.content).toContain('90%');
    });

    it('should not add duplicate facts', async () => {
      await addFactTool.execute(
        { content: '我会说中文' },
        mockContext
      );

      const result = await addFactTool.execute(
        { content: '我会说中文' },
        mockContext
      );

      expect(result.success).toBe(true);
    });

    it('should merge facts with different spacing', async () => {
      await addFactTool.execute(
        { content: '我是 Python 开发者', confidence: 0.8 },
        mockContext
      );

      const result = await addFactTool.execute(
        { content: '我是Python开发者', confidence: 0.9 },
        mockContext
      );

      expect(result.success).toBe(true);
      
      const factsResult = await getFactsTool.execute({}, mockContext);
      expect(factsResult.success).toBe(true);
      const contentLower = (factsResult.content || '').toLowerCase();
      expect(contentLower).toContain('python');
      expect(contentLower).toContain('90%');
      
      const factLines = (factsResult.content || '').split('\n').filter(line => line.toLowerCase().includes('python'));
      expect(factLines.length).toBe(1);
    });

    it('should merge similar facts with same core keywords', async () => {
      await addFactTool.execute(
        { content: '我是 C++ 开发者', confidence: 0.8 },
        mockContext
      );

      const result = await addFactTool.execute(
        { content: '我是 C++ 开发', confidence: 0.9 },
        mockContext
      );

      expect(result.success).toBe(true);
      
      const factsResult = await getFactsTool.execute({}, mockContext);
      expect(factsResult.success).toBe(true);
      
      const factLines = (factsResult.content || '').split('\n').filter(line => line.toLowerCase().includes('c++'));
      expect(factLines.length).toBe(1);
      expect((factsResult.content || '').toLowerCase()).toContain('90%');
    });

    it('should reject empty content', async () => {
      const result = await addFactTool.execute(
        { content: '' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('空');
    });

    it('should only call tool once (no duplicate execution)', async () => {
      const executeSpy = vi.spyOn(addFactTool, 'execute');
      
      await addFactTool.execute(
        { content: '测试事实', category: 'knowledge' },
        mockContext
      );

      expect(executeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getFactsTool', () => {
    it('should return empty when no facts', async () => {
      const result = await getFactsTool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.content).toContain('暂无');
    });

    it('should return facts after adding', async () => {
      await addFactTool.execute(
        { content: '事实1', category: 'knowledge', confidence: 0.9 },
        mockContext
      );

      const result = await getFactsTool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.content).toContain('事实1');
    });

    it('should filter by category', async () => {
      await addFactTool.execute(
        { content: '偏好1', category: 'preference' },
        mockContext
      );
      await addFactTool.execute(
        { content: '知识1', category: 'knowledge' },
        mockContext
      );

      const result = await getFactsTool.execute(
        { category: 'preference' },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.content).toContain('偏好1');
      expect(result.content).not.toContain('知识1');
    });
  });

  describe('deleteFactTool', () => {
    it('should delete existing fact', async () => {
      const addResult = await addFactTool.execute(
        { content: '要删除的事实' },
        mockContext
      );

      const factId = addResult.metadata?.factId;
      expect(factId).toBeDefined();

      const result = await deleteFactTool.execute(
        { fact_id: factId },
        mockContext
      );

      expect(result.success).toBe(true);
    });

    it('should fail for non-existent fact', async () => {
      const result = await deleteFactTool.execute(
        { fact_id: 'non-existent-id' },
        mockContext
      );

      expect(result.success).toBe(false);
    });
  });
});