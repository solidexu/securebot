/**
 * Nudge 多 Agent 场景测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SkillNudgeManager,
  resetSkillNudgeManager,
  checkAndGenerateNudge,
  DEFAULT_NUDGE_CONFIG,
} from './skill-nudge.js';

describe('Skill Nudge Multi-Agent', () => {
  beforeEach(() => {
    resetSkillNudgeManager();
  });
  
  it('should support per-agent manager creation', () => {
    // Agent 1 的管理器
    const manager1 = new SkillNudgeManager({ interval: 5 });
    
    // Agent 2 的管理器（不同配置）
    const manager2 = new SkillNudgeManager({ interval: 10 });
    
    expect(manager1.getConfig().interval).toBe(5);
    expect(manager2.getConfig().interval).toBe(10);
    
    // 独立计数
    manager1.onToolCall('read');
    manager2.onToolCall('write');
    
    expect(manager1.getStatus().toolCallCount).toBe(1);
    expect(manager2.getStatus().toolCallCount).toBe(1);
  });
  
  it('should handle concurrent agent scenarios', () => {
    const manager1 = new SkillNudgeManager();
    const manager2 = new SkillNudgeManager();
    
    // Agent 1 达到阈值
    for (let i = 0; i < 10; i++) {
      manager1.onToolCall('tool');
    }
    
    // Agent 2 少于阈值
    for (let i = 0; i < 3; i++) {
      manager2.onToolCall('tool');
    }
    
    // Agent 1 应该触发 Nudge
    const nudge1 = manager1.triggerComplexTaskNudge();
    expect(nudge1).toBeTruthy();
    
    // Agent 2 不应该触发
    const nudge2 = manager2.triggerComplexTaskNudge();
    expect(nudge2).toBeNull();
  });
  
  it('should reset independently per agent', () => {
    const manager1 = new SkillNudgeManager();
    const manager2 = new SkillNudgeManager();
    
    manager1.onToolCall('read');
    manager2.onToolCall('write');
    
    manager1.reset();
    
    expect(manager1.getStatus().toolCallCount).toBe(0);
    expect(manager2.getStatus().toolCallCount).toBe(1);
  });
  
  it('should handle skill creation for specific agent', () => {
    const manager1 = new SkillNudgeManager();
    const manager2 = new SkillNudgeManager();
    
    for (let i = 0; i < 5; i++) {
      manager1.onToolCall('tool');
      manager2.onToolCall('tool');
    }
    
    // Agent 1 创建技能
    const nudge = checkAndGenerateNudge(manager1, 'create_skill');
    
    expect(nudge).toBeNull();  // create_skill 触发 reset
    expect(manager1.getStatus().toolCallCount).toBe(0);
    expect(manager2.getStatus().toolCallCount).toBe(5);  // Agent 2 不受影响
  });
  
  it('should support custom config per agent', () => {
    // 开发 Agent：频繁 Nudge
    const devManager = new SkillNudgeManager({
      interval: 5,
      minToolCalls: 3,
    });
    
    // 生产 Agent：保守 Nudge
    const prodManager = new SkillNudgeManager({
      interval: 20,
      minToolCalls: 10,
    });
    
    expect(devManager.getConfig().interval).toBe(5);
    expect(prodManager.getConfig().interval).toBe(20);
  });
  
  it('should track separate error fix state per agent', () => {
    const manager1 = new SkillNudgeManager({ onErrorFix: true });
    const manager2 = new SkillNudgeManager({ onErrorFix: false });
    
    // Agent 1 触发错误修复 Nudge
    const nudge1 = manager1.triggerErrorFixNudge();
    expect(nudge1).toBeTruthy();
    
    // Agent 2 不触发
    const nudge2 = manager2.triggerErrorFixNudge();
    expect(nudge2).toBeNull();
  });
  
  it('should handle agent isolation correctly', () => {
    const managers = [
      new SkillNudgeManager(),
      new SkillNudgeManager(),
      new SkillNudgeManager(),
    ];
    
    // 每个管理器独立操作
    managers.forEach((m, i) => {
      for (let j = 0; j < i + 5; j++) {
        m.onToolCall('tool');
      }
    });
    
    // 验证独立计数
    expect(managers[0].getStatus().toolCallCount).toBe(5);
    expect(managers[1].getStatus().toolCallCount).toBe(6);
    expect(managers[2].getStatus().toolCallCount).toBe(7);
  });
});
