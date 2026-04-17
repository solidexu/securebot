/**
 * Hook 系统测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HookManager, getHookManager } from './registry.js';
import type { SessionHook, HookContext } from './types.js';
import { sessionStartHook, userPromptHook, stopHook, sessionEndHook } from './session-hooks.js';

describe('Hook System', () => {
  describe('HookManager', () => {
    let manager: HookManager;

    beforeEach(() => {
      manager = new HookManager();
    });

    it('should register hooks', () => {
      const testHook: SessionHook = {
        name: 'test-hook',
        trigger: 'start',
        execute: async () => {},
      };

      manager.register(testHook);
      const hooks = manager.getHooks('start');
      
      expect(hooks.length).toBe(1);
      expect(hooks[0]?.name).toBe('test-hook');
    });

    it('should handle multiple hooks for same trigger', () => {
      manager.register({ name: 'hook1', trigger: 'start', execute: async () => {} });
      manager.register({ name: 'hook2', trigger: 'start', execute: async () => {} });
      
      const hooks = manager.getHooks('start');
      expect(hooks.length).toBe(2);
    });

    it('should execute hooks without error', async () => {
      let executed = false;
      
      manager.register({
        name: 'test',
        trigger: 'prompt',
        execute: async () => { executed = true; },
      });

      await manager.executeHooks('prompt', {
        agentId: 'test-agent',
        sessionId: 'test-session',
        prompt: 'test prompt',
      });

      expect(executed).toBe(true);
    });

    it('should continue on hook error', async () => {
      let executed = false;
      
      manager.register({
        name: 'error-hook',
        trigger: 'start',
        execute: async () => { throw new Error('test error'); },
      });
      
      manager.register({
        name: 'success-hook',
        trigger: 'start',
        execute: async () => { executed = true; },
      });

      await manager.executeHooks('start', {
        agentId: 'test',
        sessionId: 'test',
      });

      expect(executed).toBe(true);
    });
  });

  describe('Default Hooks', () => {
    it('should have sessionStartHook defined', () => {
      expect(sessionStartHook.name).toBe('session-start');
      expect(sessionStartHook.trigger).toBe('start');
    });

    it('should have userPromptHook defined', () => {
      expect(userPromptHook.name).toBe('user-prompt');
      expect(userPromptHook.trigger).toBe('prompt');
    });

    it('should have stopHook defined', () => {
      expect(stopHook.name).toBe('response-stop');
      expect(stopHook.trigger).toBe('stop');
    });

    it('should have sessionEndHook defined', () => {
      expect(sessionEndHook.name).toBe('session-end');
      expect(sessionEndHook.trigger).toBe('end');
    });
  });
});
