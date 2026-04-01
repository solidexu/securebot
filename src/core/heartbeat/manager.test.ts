/**
 * 心跳管理器测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeartbeatManager } from './manager';
import { AgentHeartbeat, DEFAULT_HEARTBEAT_CONFIG } from './types';

describe('HeartbeatManager', () => {
  let manager: HeartbeatManager;

  beforeEach(() => {
    manager = new HeartbeatManager({
      interval: 1000,
      timeout: 2000,
      checkInterval: 500,
      maxMissed: 3,
    });
  });

  afterEach(() => {
    manager.stop();
  });

  describe('Agent 注册', () => {
    it('应该能注册 Agent', () => {
      manager.registerAgent('agent-a');
      
      const state = manager.getAgentState('agent-a');
      expect(state).toBeDefined();
      expect(state?.status).toBe('online');
      expect(state?.missedHeartbeats).toBe(0);
    });

    it('重复注册应该忽略', () => {
      manager.registerAgent('agent-a');
      manager.registerAgent('agent-a');
      
      const states = manager.getAllAgentStates();
      expect(states.length).toBe(1);
    });

    it('应该能注销 Agent', () => {
      manager.registerAgent('agent-a');
      manager.unregisterAgent('agent-a');
      
      expect(manager.getAgentState('agent-a')).toBeUndefined();
    });
  });

  describe('心跳接收', () => {
    it('应该能接收心跳并更新状态', () => {
      manager.registerAgent('agent-a');
      
      const heartbeat: AgentHeartbeat = {
        agentId: 'agent-a',
        status: 'working',
        currentTask: 'task-123',
        timestamp: Date.now(),
      };
      
      manager.receiveHeartbeat(heartbeat);
      
      const state = manager.getAgentState('agent-a');
      expect(state?.status).toBe('busy');
      expect(state?.currentTask).toBe('task-123');
      expect(state?.missedHeartbeats).toBe(0);
    });

    it('未注册的 Agent 应该自动注册', () => {
      const heartbeat: AgentHeartbeat = {
        agentId: 'new-agent',
        status: 'idle',
        timestamp: Date.now(),
      };
      
      manager.receiveHeartbeat(heartbeat);
      
      const state = manager.getAgentState('new-agent');
      expect(state).toBeDefined();
      expect(state?.status).toBe('online');
    });

    it('应该更新最后心跳时间', () => {
      manager.registerAgent('agent-a');
      
      const before = Date.now();
      manager.receiveHeartbeat({
        agentId: 'agent-a',
        status: 'idle',
        timestamp: Date.now(),
      });
      const after = Date.now();
      
      const state = manager.getAgentState('agent-a');
      expect(state?.lastSeenAt).toBeGreaterThanOrEqual(before);
      expect(state?.lastSeenAt).toBeLessThanOrEqual(after);
    });
  });

  describe('超时检测', () => {
    it('应该检测到超时', async () => {
      manager.registerAgent('agent-a');
      
      // 发送一次心跳
      manager.receiveHeartbeat({
        agentId: 'agent-a',
        status: 'idle',
        timestamp: Date.now() - 3000, // 3秒前
      });
      
      // 启动检查
      manager.start();
      
      // 等待检查周期
      await new Promise((resolve) => setTimeout(resolve, 600));
      
      const state = manager.getAgentState('agent-a');
      expect(state?.missedHeartbeats).toBeGreaterThan(0);
    });

    it('应该标记离线', async () => {
      manager.registerAgent('agent-a');
      
      // 发送一次心跳
      manager.receiveHeartbeat({
        agentId: 'agent-a',
        status: 'idle',
        timestamp: Date.now() - 10000, // 10秒前
      });
      
      // 启动检查
      manager.start();
      
      // 等待检查周期
      await new Promise((resolve) => setTimeout(resolve, 600));
      
      const state = manager.getAgentState('agent-a');
      expect(state?.status).toBe('offline');
    });
  });

  describe('事件订阅', () => {
    it('应该触发心跳接收事件', () => {
      const callback = vi.fn();
      manager.subscribe(callback);
      
      manager.registerAgent('agent-a');
      manager.receiveHeartbeat({
        agentId: 'agent-a',
        status: 'idle',
        timestamp: Date.now(),
      });
      
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'heartbeat_received',
          agentId: 'agent-a',
        })
      );
    });

    it('应该触发 Agent 上线事件', () => {
      const callback = vi.fn();
      manager.subscribe(callback);
      
      manager.registerAgent('agent-a');
      
      expect(callback).toHaveBeenCalledWith({
        type: 'agent_online',
        agentId: 'agent-a',
      });
    });

    it('应该触发 Agent 离线事件', async () => {
      const callback = vi.fn();
      manager.subscribe(callback);
      
      manager.registerAgent('agent-a');
      manager.receiveHeartbeat({
        agentId: 'agent-a',
        status: 'idle',
        timestamp: Date.now() - 10000,
      });
      
      manager.start();
      await new Promise((resolve) => setTimeout(resolve, 600));
      
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent_offline',
          agentId: 'agent-a',
        })
      );
    });

    it('应该触发任务孤儿事件', async () => {
      const callback = vi.fn();
      manager.subscribe(callback);
      
      manager.registerAgent('agent-a');
      manager.receiveHeartbeat({
        agentId: 'agent-a',
        status: 'working',
        currentTask: 'task-123',
        timestamp: Date.now() - 10000,
      });
      
      manager.start();
      await new Promise((resolve) => setTimeout(resolve, 600));
      
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task_orphaned',
          agentId: 'agent-a',
          taskId: 'task-123',
        })
      );
    });
  });

  describe('查询方法', () => {
    it('应该能获取所有 Agent 状态', () => {
      manager.registerAgent('agent-a');
      manager.registerAgent('agent-b');
      
      const states = manager.getAllAgentStates();
      expect(states.length).toBe(2);
    });

    it('应该能获取在线 Agent', () => {
      manager.registerAgent('agent-a');
      manager.registerAgent('agent-b');
      
      // 标记一个离线
      const state = manager.getAgentState('agent-b')!;
      state.status = 'offline';
      
      const online = manager.getOnlineAgents();
      expect(online.length).toBe(1);
      expect(online[0].agentId).toBe('agent-a');
    });

    it('应该能获取忙碌 Agent', () => {
      manager.registerAgent('agent-a');
      manager.registerAgent('agent-b');
      
      manager.receiveHeartbeat({
        agentId: 'agent-a',
        status: 'working',
        timestamp: Date.now(),
      });
      
      const busy = manager.getBusyAgents();
      expect(busy.length).toBe(1);
      expect(busy[0].agentId).toBe('agent-a');
    });
  });

  describe('配置', () => {
    it('应该返回默认配置', () => {
      const defaultManager = new HeartbeatManager();
      const config = defaultManager.getConfig();
      
      expect(config.interval).toBe(DEFAULT_HEARTBEAT_CONFIG.interval);
      expect(config.timeout).toBe(DEFAULT_HEARTBEAT_CONFIG.timeout);
    });

    it('应该能更新配置', () => {
      manager.updateConfig({ interval: 5000 });
      const config = manager.getConfig();
      
      expect(config.interval).toBe(5000);
    });
  });

  describe('状态导入导出', () => {
    it('应该能导出状态', () => {
      manager.registerAgent('agent-a');
      manager.registerAgent('agent-b');
      
      const exported = manager.exportState();
      
      expect(Object.keys(exported).length).toBe(2);
      expect(exported['agent-a']).toBeDefined();
      expect(exported['agent-b']).toBeDefined();
    });

    it('应该能导入状态', () => {
      const states = {
        'agent-a': {
          agentId: 'agent-a',
          status: 'online' as const,
          lastSeenAt: Date.now(),
          missedHeartbeats: 0,
        },
        'agent-b': {
          agentId: 'agent-b',
          status: 'offline' as const,
          lastSeenAt: Date.now() - 10000,
          missedHeartbeats: 5,
        },
      };
      
      manager.importState(states);
      
      const allStates = manager.getAllAgentStates();
      expect(allStates.length).toBe(2);
      expect(manager.getAgentState('agent-b')?.status).toBe('offline');
    });
  });
});