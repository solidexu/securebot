/**
 * Skill Conditions 测试
 */

import { describe, it, expect } from 'vitest';
import {
  isSkillConditionsAllowed,
  parseSkillConditions,
  validateSkillConditions,
  detectPlatform,
  detectEnvironment,
  type SkillActivationConditions,
} from './skill-conditions.js';

describe('Skill Conditions', () => {
  describe('isSkillConditionsAllowed', () => {
    it('should return true when no conditions specified', () => {
      const skill = { id: 'test', name: 'Test' };
      const availableToolsets = new Set(['web', 'file']);
      
      expect(isSkillConditionsAllowed(skill, availableToolsets)).toBe(true);
    });
    
    it('should hide skill when requires_toolsets missing', () => {
      const conditions: SkillActivationConditions = {
        requires: { toolsets: ['browser'] },
      };
      const availableToolsets = new Set(['web', 'file']);
      
      expect(isSkillConditionsAllowed(conditions, availableToolsets)).toBe(false);
    });
    
    it('should show skill when requires_toolsets present', () => {
      const conditions: SkillActivationConditions = {
        requires: { toolsets: ['web'] },
      };
      const availableToolsets = new Set(['web', 'file']);
      
      expect(isSkillConditionsAllowed(conditions, availableToolsets)).toBe(true);
    });
    
    it('should hide fallback when primary toolset available', () => {
      const conditions: SkillActivationConditions = {
        fallbackFor: { toolsets: ['full_stack'] },
      };
      const availableToolsets = new Set(['web', 'file', 'full_stack']);
      
      expect(isSkillConditionsAllowed(conditions, availableToolsets)).toBe(false);
    });
    
    it('should show fallback when primary toolset unavailable', () => {
      const conditions: SkillActivationConditions = {
        fallbackFor: { toolsets: ['full_stack'] },
      };
      const availableToolsets = new Set(['web', 'file']);
      
      expect(isSkillConditionsAllowed(conditions, availableToolsets)).toBe(true);
    });
    
    it('should hide skill when platform mismatch', () => {
      const conditions: SkillActivationConditions = {
        platforms: ['macos'],
      };
      const availableToolsets = new Set(['web', 'file']);
      const context = { platform: 'linux' as const };
      
      expect(isSkillConditionsAllowed(conditions, availableToolsets, undefined, context)).toBe(false);
    });
    
    it('should show skill when platform matches', () => {
      const conditions: SkillActivationConditions = {
        platforms: ['linux', 'macos'],
      };
      const availableToolsets = new Set(['web', 'file']);
      const context = { platform: 'linux' as const };
      
      expect(isSkillConditionsAllowed(conditions, availableToolsets, undefined, context)).toBe(true);
    });
    
    it('should hide skill when environment mismatch', () => {
      const conditions: SkillActivationConditions = {
        environments: ['production'],
      };
      const availableToolsets = new Set(['web', 'file']);
      const context = { environment: 'development' as const };
      
      expect(isSkillConditionsAllowed(conditions, availableToolsets, undefined, context)).toBe(false);
    });
    
    it('should combine requires and fallback conditions', () => {
      // Fallback 技能：当 full_stack 不可用，且需要 web
      const conditions: SkillActivationConditions = {
        requires: { toolsets: ['web'] },
        fallbackFor: { toolsets: ['full_stack'] },
      };
      
      // full_stack 可用 → 隐藏
      expect(isSkillConditionsAllowed(conditions, new Set(['web', 'full_stack']))).toBe(false);
      
      // full_stack 不可用，web 可用 → 显示
      expect(isSkillConditionsAllowed(conditions, new Set(['web', 'file']))).toBe(true);
      
      // full_stack 不可用，web 也不可用 → 隐藏（requires 未满足）
      expect(isSkillConditionsAllowed(conditions, new Set(['file']))).toBe(false);
    });
    
    it('should check tool-level conditions', () => {
      const conditions: SkillActivationConditions = {
        requires: { tools: ['web_search'] },
      };
      const availableToolsets = new Set(['web']);
      const availableTools = new Set(['web_search', 'web_fetch']);
      
      expect(isSkillConditionsAllowed(conditions, availableToolsets, availableTools)).toBe(true);
      
      const missingTools = new Set(['read', 'write']);
      expect(isSkillConditionsAllowed(conditions, availableToolsets, missingTools)).toBe(false);
    });
  });
  
  describe('parseSkillConditions', () => {
    it('should parse Hermes format conditions', () => {
      const frontmatter = {
        metadata: {
          hermes: {
            requires_toolsets: ['web', 'browser'],
            fallback_for_toolsets: ['full_stack'],
          },
        },
      };
      
      const conditions = parseSkillConditions(frontmatter);
      
      expect(conditions.requires?.toolsets).toEqual(['web', 'browser']);
      expect(conditions.fallbackFor?.toolsets).toEqual(['full_stack']);
    });
    
    it('should parse simplified format', () => {
      const frontmatter = {
        requires_toolsets: ['web'],
        fallback_for_toolsets: ['full_stack'],
        platforms: ['linux', 'macos'],
      };
      
      const conditions = parseSkillConditions(frontmatter);
      
      expect(conditions.requires?.toolsets).toEqual(['web']);
      expect(conditions.fallbackFor?.toolsets).toEqual(['full_stack']);
      expect(conditions.platforms).toEqual(['linux', 'macos']);
    });
    
    it('should return empty conditions for no frontmatter', () => {
      const frontmatter = {};
      const conditions = parseSkillConditions(frontmatter);
      
      expect(conditions).toEqual({});
    });
    
    it('should parse platforms and environments', () => {
      const frontmatter = {
        platforms: ['macos'],
        environments: ['production', 'testing'],
      };
      
      const conditions = parseSkillConditions(frontmatter);
      
      expect(conditions.platforms).toEqual(['macos']);
      expect(conditions.environments).toEqual(['production', 'testing']);
    });
  });
  
  describe('validateSkillConditions', () => {
    it('should validate correct toolsets', () => {
      const conditions: SkillActivationConditions = {
        requires: { toolsets: ['web', 'file'] },
      };
      
      const result = validateSkillConditions(conditions);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should report error for unknown toolset', () => {
      const conditions: SkillActivationConditions = {
        requires: { toolsets: ['unknown_toolset'] },
      };
      
      const result = validateSkillConditions(conditions);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown toolset in requires: unknown_toolset');
    });
    
    it('should warn about requires + fallback conflict', () => {
      const conditions: SkillActivationConditions = {
        requires: { toolsets: ['web'] },
        fallbackFor: { toolsets: ['full_stack'] },
      };
      
      const result = validateSkillConditions(conditions);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
    });
    
    it('should validate platforms', () => {
      const conditions: SkillActivationConditions = {
        platforms: ['macos', 'invalid_platform' as any],
      };
      
      const result = validateSkillConditions(conditions);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown platform: invalid_platform');
    });
  });
  
  describe('detectPlatform', () => {
    it('should return valid platform', () => {
      const platform = detectPlatform();
      
      expect(['macos', 'linux', 'windows']).toContain(platform);
    });
  });
  
  describe('detectEnvironment', () => {
    it('should return valid environment', () => {
      const env = detectEnvironment();
      
      expect(['production', 'development', 'testing']).toContain(env);
    });
    
    it('should respect NODE_ENV', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      expect(detectEnvironment()).toBe('production');
      
      process.env.NODE_ENV = originalEnv;
    });
  });
});
