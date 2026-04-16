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
      
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('requires and fallbackFor');
    });
    
    it('should detect impossible requirements', () => {
      const conditions: SkillActivationConditions = {
        requires: { toolsets: ['nonexistent1', 'nonexistent2'] },
      };
      
      const result = validateSkillConditions(conditions);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
    });
    
    it('should validate empty conditions', () => {
      const conditions: SkillActivationConditions = {};
      
      const result = validateSkillConditions(conditions);
      
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.warnings.length).toBe(0);
    });
    
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
  
  describe('YAML Parsing', () => {
    it('should handle malformed Hermes format', () => {
      const frontmatter = {
        metadata: {
          hermes: {
            requires_toolsets: 'invalid',  // 应该是数组
          },
        },
      };
      
      const conditions = parseSkillConditions(frontmatter);
      
      expect(conditions).toBeDefined();
    });
    
    it('should handle missing metadata structure', () => {
      const frontmatter = {
        metadata: 'invalid string',
      };
      
      const conditions = parseSkillConditions(frontmatter);
      
      expect(conditions).toBeDefined();
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
    
    it('should parse Hermes format correctly', () => {
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
    
    it('should parse simplified format correctly', () => {
      const frontmatter = {
        requires_toolsets: ['web'],
        fallback_for_toolsets: ['full_stack'],
        platforms: ['macos', 'linux'],
      };
      
      const conditions = parseSkillConditions(frontmatter);
      
      expect(conditions.requires?.toolsets).toEqual(['web']);
      expect(conditions.fallbackFor?.toolsets).toEqual(['full_stack']);
      expect(conditions.platforms).toEqual(['macos', 'linux']);
    });
  });
});
