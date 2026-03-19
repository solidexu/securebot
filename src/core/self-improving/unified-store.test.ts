/**
 * UnifiedStore 测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UnifiedStore, type UnifiedEntry } from './unified-store.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';

describe('UnifiedStore', () => {
  let store: UnifiedStore;
  let testDir: string;
  
  beforeEach(async () => {
    testDir = join(tmpdir(), `unified-store-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    
    store = new UnifiedStore({
      storageDir: join(testDir, 'store'),
      enableEmbedding: false, // 测试时禁用向量化
    });
    
    await store.initialize();
  });
  
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });
  
  describe('add', () => {
    it('should add an entry', async () => {
      const entry: UnifiedEntry = {
        id: 'test-1',
        type: 'memory',
        agentId: 'agent-1',
        content: 'test content',
        metadata: {},
        importance: 0.5,
        tags: ['test'],
        source: 'user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await store.add(entry);
      
      const retrieved = await store.get('test-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.content).toBe('test content');
    });
    
    it('should generate ID if not provided', async () => {
      const entry: UnifiedEntry = {
        id: '',
        type: 'success',
        agentId: 'agent-1',
        content: 'test',
        metadata: {},
        importance: 0.5,
        tags: [],
        source: 'agent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await store.add(entry);
      
      const all = await store.getAll();
      expect(all.length).toBe(1);
      expect(all[0].id).toBeDefined();
      expect(all[0].id.length).toBeGreaterThan(0);
    });
  });
  
  describe('search', () => {
    beforeEach(async () => {
      // 添加测试数据
      await store.add({
        id: 'search-1',
        type: 'success',
        agentId: 'agent-1',
        content: 'Python 代码调试成功',
        metadata: { taskType: 'debugging' },
        importance: 0.8,
        tags: ['python', 'debugging'],
        source: 'agent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      
      await store.add({
        id: 'search-2',
        type: 'error',
        agentId: 'agent-1',
        content: 'JavaScript 运行错误',
        metadata: { errorType: 'runtime' },
        importance: 0.6,
        tags: ['javascript', 'error'],
        source: 'agent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
    
    it('should search by keywords', async () => {
      const results = await store.search('Python', {
        keywords: true,
        semantic: false,
      });
      
      expect(results.length).toBe(1);
      expect(results[0].entry.content).toContain('Python');
    });
    
    it('should filter by type', async () => {
      const results = await store.search('Python', {
        types: ['success'],
        keywords: true,
        semantic: false,
      });
      
      expect(results.length).toBe(1);
      expect(results[0].entry.type).toBe('success');
    });
    
    it('should filter by agentId', async () => {
      const results = await store.search('Python', {
        agentId: 'agent-1',
        keywords: true,
        semantic: false,
      });
      
      expect(results.length).toBe(1);
      expect(results[0].entry.agentId).toBe('agent-1');
    });
  });
  
  describe('stats', () => {
    it('should return correct stats', async () => {
      await store.add({
        id: 'stats-1',
        type: 'success',
        agentId: 'agent-1',
        content: 'test',
        metadata: {},
        importance: 0.5,
        tags: [],
        source: 'agent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      
      await store.add({
        id: 'stats-2',
        type: 'error',
        agentId: 'agent-2',
        content: 'test error',
        metadata: {},
        importance: 0.5,
        tags: [],
        source: 'agent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      
      const stats = await store.stats();
      
      expect(stats.total).toBe(2);
      expect(stats.byType.success).toBe(1);
      expect(stats.byType.error).toBe(1);
      expect(stats.byAgent['agent-1']).toBe(1);
      expect(stats.byAgent['agent-2']).toBe(1);
    });
  });
  
  describe('delete', () => {
    it('should delete an entry', async () => {
      await store.add({
        id: 'delete-1',
        type: 'memory',
        agentId: 'agent-1',
        content: 'to be deleted',
        metadata: {},
        importance: 0.5,
        tags: [],
        source: 'user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      
      await store.delete('delete-1');
      
      const retrieved = await store.get('delete-1');
      expect(retrieved).toBeUndefined();
    });
  });
});