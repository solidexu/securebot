import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SessionStorage,
  getSessionStorage,
  resetSessionStorage,
} from './session-storage.js';
import { createSession, addUserMessage, addAssistantMessage } from './session.js';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

describe('SessionStorage', () => {
  const testDir = '/tmp/securebot-session-test';
  let storage: SessionStorage;

  beforeEach(async () => {
    // 清理测试目录
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });

    // 创建新的存储实例
    storage = new SessionStorage({ storageDir: testDir });
    await storage.initialize();
  });

  afterEach(() => {
    // 清理
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('initialize', () => {
    it('should create storage directory', async () => {
      const newDir = join(testDir, 'new-storage');
      const newStorage = new SessionStorage({ storageDir: newDir });
      
      await newStorage.initialize();
      
      expect(existsSync(newDir)).toBe(true);
    });

    it('should be idempotent', async () => {
      await storage.initialize();
      await storage.initialize();
      
      expect(storage.getStorageDir()).toBe(testDir);
    });
  });

  describe('saveSession', () => {
    it('should save a session', async () => {
      const session = createSession('test-agent', 'main');
      addUserMessage(session, 'Hello');
      addAssistantMessage(session, 'Hi there!');

      await storage.saveSession(session);

      // 验证文件存在
      const filePath = join(testDir, 'agent_test-agent_main.json');
      expect(existsSync(filePath)).toBe(true);
    });

    it('should persist session data correctly', async () => {
      const session = createSession('test-agent', 'main');
      addUserMessage(session, 'Test message');

      await storage.saveSession(session);

      // 加载并验证
      const loaded = await storage.loadSession(session.sessionKey);
      expect(loaded).not.toBeNull();
      expect(loaded!.agentId).toBe('test-agent');
      expect(loaded!.history.length).toBe(1);
      expect(loaded!.history[0]!.content).toBe('Test message');
    });
  });

  describe('loadSession', () => {
    it('should return null for non-existent session', async () => {
      const result = await storage.loadSession('agent:nonexistent:main');
      expect(result).toBeNull();
    });

    it('should load a saved session', async () => {
      const session = createSession('load-test', 'main');
      addUserMessage(session, 'Message 1');
      addUserMessage(session, 'Message 2');

      await storage.saveSession(session);

      const loaded = await storage.loadSession(session.sessionKey);
      
      expect(loaded).not.toBeNull();
      expect(loaded!.history.length).toBe(2);
    });

    it('should use cache for repeated loads', async () => {
      const session = createSession('cache-test', 'main');
      addUserMessage(session, 'Cached message');

      await storage.saveSession(session);

      // 第一次加载
      const loaded1 = await storage.loadSession(session.sessionKey);
      // 第二次加载（从缓存）
      const loaded2 = await storage.loadSession(session.sessionKey);

      expect(loaded1).not.toBeNull();
      expect(loaded2).not.toBeNull();
      expect(loaded1!.sessionKey).toBe(loaded2!.sessionKey);
    });
  });

  describe('deleteSession', () => {
    it('should delete a session', async () => {
      const session = createSession('delete-test', 'main');
      addUserMessage(session, 'To be deleted');

      await storage.saveSession(session);
      const deleted = await storage.deleteSession(session.sessionKey);

      expect(deleted).toBe(true);
      
      const loaded = await storage.loadSession(session.sessionKey);
      expect(loaded).toBeNull();
    });

    it('should return false for non-existent session', async () => {
      const deleted = await storage.deleteSession('agent:nonexistent:main');
      expect(deleted).toBe(false);
    });
  });

  describe('listSessions', () => {
    it('should return empty array when no sessions', async () => {
      const sessions = await storage.listSessions();
      expect(sessions).toEqual([]);
    });

    it('should list all sessions', async () => {
      const session1 = createSession('agent1', 'main');
      const session2 = createSession('agent2', 'main');
      
      addUserMessage(session1, 'Message 1');
      addUserMessage(session2, 'Message 2');
      addUserMessage(session2, 'Message 3');

      await storage.saveSession(session1);
      await storage.saveSession(session2);

      const sessions = await storage.listSessions();

      expect(sessions.length).toBe(2);
      expect(sessions.find(s => s.agentId === 'agent1')).toBeDefined();
      expect(sessions.find(s => s.agentId === 'agent2')).toBeDefined();
    });

    it('should sort sessions by update time', async () => {
      const session1 = createSession('oldest', 'main');
      const session2 = createSession('newest', 'main');

      addUserMessage(session1, 'Old message');
      await storage.saveSession(session1);

      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 10));

      addUserMessage(session2, 'New message');
      await storage.saveSession(session2);

      const sessions = await storage.listSessions();

      // 最新的在前面
      expect(sessions[0]!.agentId).toBe('newest');
      expect(sessions[1]!.agentId).toBe('oldest');
    });
  });

  describe('clearAll', () => {
    it('should clear all sessions', async () => {
      const session1 = createSession('agent1', 'main');
      const session2 = createSession('agent2', 'main');

      addUserMessage(session1, 'Message 1');
      addUserMessage(session2, 'Message 2');

      await storage.saveSession(session1);
      await storage.saveSession(session2);

      const count = await storage.clearAll();

      expect(count).toBe(2);
      
      const sessions = await storage.listSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe('maxHistoryLength', () => {
    it('should trim history when saving', async () => {
      const trimStorage = new SessionStorage({
        storageDir: testDir,
        maxHistoryLength: 3,
      });
      await trimStorage.initialize();

      const session = createSession('trim-test', 'main');
      
      // 添加 5 条消息
      for (let i = 1; i <= 5; i++) {
        addUserMessage(session, `Message ${i}`);
      }

      await trimStorage.saveSession(session);

      const loaded = await trimStorage.loadSession(session.sessionKey);
      
      // 只保留最近 3 条
      expect(loaded!.history.length).toBe(3);
      expect(loaded!.history[0]!.content).toBe('Message 3');
      expect(loaded!.history[2]!.content).toBe('Message 5');
    });

    it('should not trim when maxHistoryLength is 0', async () => {
      const noLimitStorage = new SessionStorage({
        storageDir: testDir,
        maxHistoryLength: 0,
      });
      await noLimitStorage.initialize();

      const session = createSession('no-limit', 'main');
      
      for (let i = 1; i <= 10; i++) {
        addUserMessage(session, `Message ${i}`);
      }

      await noLimitStorage.saveSession(session);

      const loaded = await noLimitStorage.loadSession(session.sessionKey);
      expect(loaded!.history.length).toBe(10);
    });
  });
});

describe('Global instance', () => {
  beforeEach(() => {
    resetSessionStorage();
  });

  afterEach(() => {
    resetSessionStorage();
  });

  it('should return singleton instance', () => {
    const instance1 = getSessionStorage();
    const instance2 = getSessionStorage();

    expect(instance1).toBe(instance2);
  });

  it('should create new instance after reset', () => {
    const instance1 = getSessionStorage();
    resetSessionStorage();
    const instance2 = getSessionStorage();

    expect(instance1).not.toBe(instance2);
  });
});