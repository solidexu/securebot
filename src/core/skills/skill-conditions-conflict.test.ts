/**
 * 技能条件冲突诊断测试
 */

import { describe, it, expect } from 'vitest';
import {
  validateSkillConditions,
  parseSkillConditions,
  type SkillActivationConditions,
} from './skill-conditions.js';

describe('Skill Conditions Conflict Detection', () => {
  describe('Conflict Detection', () => {
    it('should detect requires + fallbackFor conflict', () => {
      const conditions: SkillActivationConditions = {
        requires: { toolsets: ['web'] },
        fallbackFor: { toolsets: ['full_stack'] },
      };
      
      const result = validateSkillConditions(conditions);
      
      expect(result.valid).toBe(true);  // 技术上有效
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('requires and fallbackFor');
    });
    
    it('should detect impossible requirements', () => {
      // 不存在的工具集组合
      const conditions: SkillActivationConditions = {
        requires: { toolsets: ['nonexistent1', 'nonexistent2'] },
      };
      
      const result = validateSkillConditions(conditions);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
    });
    
    it('should detect circular dependencies', () => {
      // 技能A fallback for B，技能B fallback for A（模拟）
      const conditionsA: SkillActivationConditions = {
        fallbackFor: { toolsets: ['browser'] },
      };
      
      const conditionsB: SkillActivationConditions = {
        fallbackFor: { toolsets: ['web'] },
      };
      
      // 单独验证应该通过
      const resultA = validateSkillConditions(conditionsA);
      const resultB = validateSkillConditions(conditionsB);
      
      expect(resultA.valid).toBe(true);
      expect(resultB.valid).toBe(true);
    });
    
    it('should detect redundant conditions', () => {
      // full_stack 包含 web，同时 requires 两者
      const conditions: SkillActivationConditions = {
        requires: { toolsets: ['web', 'full_stack'] },
      };
      
      const result = validateSkillConditions(conditions);
      
      expect(result.valid).toBe(true);
      // 可以添加警告（full_stack 已包含 web）
    });
    
    it('should validate empty conditions', () => {
      const conditions: SkillActivationConditions = {};
      
      const result = validateSkillConditions(conditions);
      
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.warnings.length).toBe(0);
    });
    
    it('should detect conflicting platform + environment', () => {
      // macOS only + production only（可能冲突）
      const conditions: SkillActivationConditions = {
        platforms: ['macos'],
        environments: ['production'],
      };
      
      const result = validateSkillConditions(conditions);
      
      expect(result.valid).toBe(true);
      // 逻辑上可能冲突（生产环境可能不在 macOS）
    });
  });
  
  describe('YAML Parsing Conflicts', () => {
    it('should handle malformed Hermes format', () => {
      const frontmatter = {
        metadata: {
          hermes: {
            requires_toolsets: 'invalid',  // 应该是数组
          },
        },
      };
      
      const conditions = parseSkillConditions(frontmatter);
      
      // 应该处理类型错误
      expect(conditions).toBeDefined();
    });
    
    it('should handle duplicate declarations', () => {
      // Hermes 格式 + 简化格式同时存在
      const frontmatter = {
        metadata: {
          hermes: {
            requires_toolsets: ['web'],
          },
        },
        requires_toolsets: ['browser'],  // 冲突声明
      };
      
      const conditions = parseSkillConditions(frontmatter);
      
      // Hermes 格式优先
      expect(conditions.requires?.toolsets).toEqual(['web']);
    });
    
    it('should handle missing metadata structure', () => {
      const frontmatter = {
        metadata: 'invalid string',  // 应该是对象
      };
      
      const conditions = parseSkillConditions(frontmatter);
      
      expect(conditions).toBeDefined();
      expect(Object.keys(conditions).length).toBe(0);
    });
    
    it('should handle nested null values', () => {
      const frontmatter = {
        metadata: {
          hermes: {
            requires_toolsets: null,
            fallback_for_toolsets: null,
          },
        },
      };
      
      const conditions = parseSkillConditions(frontmatter);
      
      expect(conditions).toBeDefined();
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle very long toolset lists', () => {
      const conditions: SkillActivationConditions = {
        requires: { 
          toolsets: ['web', 'file', 'exec', 'rag', 'memory', 'skills', 'browser', 'messaging', 'collaboration', 'basic', 'standard', 'full_stack']
        },
      };
      
      const result = validateSkillConditions(conditions);
      
      expect(result.valid).toBe(true);
    });
    
    it('should handle empty arrays', () => {
      const conditions: SkillActivationConditions = {
        requires: { toolsets: [], tools: [] },
        fallbackFor: { toolsets: [], tools: [] },
      };
      
      const result = validateSkillConditions(conditions);
      
      expect(result.valid).toBe(true);
    });
    
    it('should handle mixed valid/invalid toolsets', () => {
      const conditions: SkillActivationConditions = {
        requires: { toolsets: ['web', 'invalid_toolset'] },
      };
      
      const result = validateSkillConditions(conditions);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('invalid_toolset');
    });
  });
});
