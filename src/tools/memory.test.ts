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
      expect(result.content).toContain('已记录');
      expect(result.content).toContain('Python');
      expect(result.metadata?.factId).toBeDefined();
    });

    it('should add a fact with category and confidence', async () => {
      const result = await addFactTool.execute(
        { 
          content: '我喜欢的编辑器是 VSCode', 
          category: 'preference',
          confidence: 0.9 
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.content).toContain('90%');
    });

    it('should not add duplicate facts', async () => {
      await addFactTool.execute(
        { content: '我精通 Python 编程' },
        mockContext
      );

      const result = await addFactTool.execute(
        { content: '我精通 Python 编程' },
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
      // 使用独立的上下文
      const localDir = join(tmpdir(), 'securebot-memory-test-merge-' + Date.now());
      mkdirSync(localDir, { recursive: true });
      mkdirSync(join(localDir, 'profiles'), { recursive: true });
      reconfigureMemoryManager({ rootDir: localDir });
      
      const localAgent = {
        id: 'merge-test-agent',
        name: 'Merge Test',
        workspace: localDir,
        sessions: new Map(),
      };
      const localSession = {
        sessionKey: 'merge-session',
        agentId: localAgent.id,
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const localContext = {
        agent: localAgent,
        session: localSession,
        workspace: localDir,
        logger: console,
      };
      
      await addFactTool.execute(
        { content: '我是 C++ 开发者', confidence: 0.8 },
        localContext
      );

      const result = await addFactTool.execute(
        { content: '我是 C++ 程序员', confidence: 0.9 },
        localContext
      );

      expect(result.success).toBe(true);
      
      const factsResult = await getFactsTool.execute({}, localContext);
      expect(factsResult.success).toBe(true);
      
      const factLines = (factsResult.content || '').split('\n').filter(line => line.toLowerCase().includes('c++'));
      expect(factLines.length).toBe(1);
      expect((factsResult.content || '').toLowerCase()).toContain('90%');
      
      rmSync(localDir, { recursive: true, force: true });
    });

    it('should reject empty content', async () => {
      const result = await addFactTool.execute(
        { content: '' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('太短');
    });

    it('should only call tool once (no duplicate execution)', async () => {
      const executeSpy = vi.spyOn(addFactTool, 'execute');
      
      await addFactTool.execute(
        { content: '我是测试开发者', category: 'knowledge' },
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
        { content: '我精通 JavaScript', category: 'knowledge', confidence: 0.9 },
        mockContext
      );

      const result = await getFactsTool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.content).toContain('JavaScript');
    });

    it('should filter by category', async () => {
      await addFactTool.execute(
        { content: '我喜欢的编辑器是 Vim', category: 'preference' },
        mockContext
      );
      await addFactTool.execute(
        { content: '我精通 Go 语言', category: 'knowledge' },
        mockContext
      );

      const result = await getFactsTool.execute(
        { category: 'preference' },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.content).toContain('Vim');
      expect(result.content).not.toContain('Go');
    });
  });

  describe('deleteFactTool', () => {
    it('should delete existing fact', async () => {
      const addResult = await addFactTool.execute(
        { content: '我精通 Rust 语言' },
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