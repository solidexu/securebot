/**
 * Skill Nudge 测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SkillNudgeManager,
  getSkillNudgeManager,
  resetSkillNudgeManager,
  DEFAULT_NUDGE_CONFIG,
  DEFAULT_NUDGE_TEMPLATE,
  ERROR_FIX_NUDGE_TEMPLATE,
  isSkillCreationTool,
  checkAndGenerateNudge,
} from './skill-nudge.js';

describe('Skill Nudge Manager', () => {
  beforeEach(() => {
    resetSkillNudgeManager();
  });
  
  afterEach(() => {
    resetSkillNudgeManager();
  });
  
  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const manager = new SkillNudgeManager();
      const config = manager.getConfig();
      
      expect(config.interval).toBe(DEFAULT_NUDGE_CONFIG.interval);
      expect(config.minToolCalls).toBe(DEFAULT_NUDGE_CONFIG.minToolCalls);
      expect(config.onErrorFix).toBe(DEFAULT_NUDGE_CONFIG.onErrorFix);
    });
    
    it('should merge custom config with defaults', () => {
      const manager = new SkillNudgeManager({ interval: 5 });
      const config = manager.getConfig();
      
      expect(config.interval).toBe(5);
      expect(config.minToolCalls).toBe(DEFAULT_NUDGE_CONFIG.minToolCalls);
    });
  });
  
  describe('onToolCall', () => {
    it('should increment tool call count', () => {
      const manager = new SkillNudgeManager();
      
      manager.onToolCall('read');
      manager.onToolCall('write');
      manager.onToolCall('exec');
      
      const status = manager.getStatus();
      expect(status.toolCallCount).toBe(3);
    });
    
    it('should allow new nudge after tool call', () => {
      const manager = new SkillNudgeManager();
      
      manager.triggerComplexTaskNudge();  // 触发后 nudgeTriggered = true
      manager.onToolCall('read');  // 新工具调用后允许新的 nudge
      
      const status = manager.getStatus();
      expect(status.nudgeTriggered).toBe(false);
    });
  });
  
  describe('reset', () => {
    it('should reset all counters', () => {
      const manager = new SkillNudgeManager();
      
      manager.onToolCall('read');
      manager.onToolCall('write');
      manager.onTurn();
      manager.triggerComplexTaskNudge();
      
      manager.reset();
      
      const status = manager.getStatus();
      expect(status.toolCallCount).toBe(0);
      expect(status.turnCount).toBe(0);
      expect(status.nudgeTriggered).toBe(false);
    });
  });
  
  describe('shouldNudge', () => {
    it('should return false when tool calls below minimum', () => {
      const manager = new SkillNudgeManager({ minToolCalls: 5 });
      
      manager.onToolCall('read');
      manager.onToolCall('write');
      
      expect(manager.shouldNudge()).toBe(false);
    });
    
    it('should return true when tool calls reach interval', () => {
      const manager = new SkillNudgeManager({ interval: 5, minToolCalls: 3 });
      
      for (let i = 0; i < 5; i++) {
        manager.onToolCall('tool');
      }
      
      expect(manager.shouldNudge()).toBe(true);
    });
    
    it('should return false when already triggered', () => {
      const manager = new SkillNudgeManager({ interval: 5 });
      
      for (let i = 0; i < 5; i++) {
        manager.onToolCall('tool');
      }
      
      manager.triggerComplexTaskNudge();  // 触发后
      
      expect(manager.shouldNudge()).toBe(false);
    });
  });
  
  describe('triggerComplexTaskNudge', () => {
    it('should return null when onComplexTask is disabled', () => {
      const manager = new SkillNudgeManager({ 
        onComplexTask: false, 
        interval: 5 
      });
      
      for (let i = 0; i < 5; i++) {
        manager.onToolCall('tool');
      }
      
      expect(manager.triggerComplexTaskNudge()).toBe(null);
    });
    
    it('should return nudge template when conditions met', () => {
      const manager = new SkillNudgeManager({ interval: 5, minToolCalls: 3 });
      
      for (let i = 0; i < 5; i++) {
        manager.onToolCall('tool');
      }
      
      const nudge = manager.triggerComplexTaskNudge();
      
      expect(nudge).toBeTruthy();
      expect(nudge).toContain('<skill-nudge>');
      expect(nudge).toContain('create_skill');
    });
    
    it('should use custom template when provided', () => {
      const customTemplate = '<skill-nudge>Custom message</skill-nudge>';
      const manager = new SkillNudgeManager({ 
        interval: 5, 
        nudgeTemplate: customTemplate 
      });
      
      for (let i = 0; i < 5; i++) {
        manager.onToolCall('tool');
      }
      
      const nudge = manager.triggerComplexTaskNudge();
      
      expect(nudge).toBe(customTemplate);
    });
    
    it('should set nudgeTriggered flag', () => {
      const manager = new SkillNudgeManager({ interval: 5 });
      
      for (let i = 0; i < 5; i++) {
        manager.onToolCall('tool');
      }
      
      manager.triggerComplexTaskNudge();
      
      const status = manager.getStatus();
      expect(status.nudgeTriggered).toBe(true);
    });
  });
  
  describe('triggerErrorFixNudge', () => {
    it('should return null when onErrorFix is disabled', () => {
      const manager = new SkillNudgeManager({ onErrorFix: false });
      
      expect(manager.triggerErrorFixNudge()).toBe(null);
    });
    
    it('should return error fix template when enabled', () => {
      const manager = new SkillNudgeManager({ onErrorFix: true });
      
      const nudge = manager.triggerErrorFixNudge();
      
      expect(nudge).toBeTruthy();
      expect(nudge).toContain('错误');
      expect(nudge).toContain('create_skill');
    });
    
    it('should not depend on interval', () => {
      const manager = new SkillNudgeManager({ onErrorFix: true, interval: 100 });
      
      // 不需要等待 interval
      const nudge = manager.triggerErrorFixNudge();
      
      expect(nudge).toBeTruthy();
    });
  });
  
  describe('isSkillCreationTool', () => {
    it('should return true for create_skill', () => {
      expect(isSkillCreationTool('create_skill')).toBe(true);
    });
    
    it('should return true for skill_manage', () => {
      expect(isSkillCreationTool('skill_manage')).toBe(true);
    });
    
    it('should return false for other tools', () => {
      expect(isSkillCreationTool('read')).toBe(false);
      expect(isSkillCreationTool('write')).toBe(false);
      expect(isSkillCreationTool('exec')).toBe(false);
    });
  });
  
  describe('checkAndGenerateNudge', () => {
    it('should reset counters when skill creation tool is used', () => {
      const manager = new SkillNudgeManager();
      
      manager.onToolCall('read');
      manager.onToolCall('write');
      
      const nudge = checkAndGenerateNudge(manager, 'create_skill');
      
      expect(nudge).toBe(null);
      expect(manager.getStatus().toolCallCount).toBe(0);
    });
    
    it('should return error fix nudge when hadError and wasSuccessful', () => {
      const manager = new SkillNudgeManager({ onErrorFix: true });
      
      manager.onToolCall('read');
      
      const nudge = checkAndGenerateNudge(manager, 'write', {
        hadError: true,
        wasSuccessful: true,
      });
      
      expect(nudge).toBeTruthy();
      expect(nudge).toContain('错误');
    });
    
    it('should return complex task nudge when interval reached', () => {
      const manager = new SkillNudgeManager({ interval: 5, minToolCalls: 3 });
      
      for (let i = 0; i < 4; i++) {
        checkAndGenerateNudge(manager, 'tool');
      }
      
      const nudge = checkAndGenerateNudge(manager, 'tool');
      
      expect(nudge).toBeTruthy();
      expect(nudge).toContain('工具调用');
    });
  });
  
  describe('getSkillNudgeManager singleton', () => {
    it('should return same instance on multiple calls', () => {
      const manager1 = getSkillNudgeManager();
      const manager2 = getSkillNudgeManager();
      
      expect(manager1).toBe(manager2);
    });
    
    it('should apply config on first call', () => {
      const manager = getSkillNudgeManager({ interval: 20 });
      
      expect(manager.getConfig().interval).toBe(20);
    });
  });
  
  describe('updateConfig', () => {
    it('should update config partially', () => {
      const manager = new SkillNudgeManager({ interval: 10 });
      
      manager.updateConfig({ interval: 5 });
      
      expect(manager.getConfig().interval).toBe(5);
      expect(manager.getConfig().minToolCalls).toBe(DEFAULT_NUDGE_CONFIG.minToolCalls);
    });
  });
});
