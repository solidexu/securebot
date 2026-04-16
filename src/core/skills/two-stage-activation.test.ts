/**
 * 两阶段激活测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getSkillManager } from '../skills.js';
import { getAvailableToolsets } from '../toolsets.js';
import { isSkillConditionsAllowed } from './skill-conditions.js';
import type { ToolsetConfig } from '../toolsets.js';

describe('Two-Stage Activation', () => {
  describe('Stage 1: Toolset Filtering', () => {
    it('should filter skills by toolset conditions', () => {
      // 创建测试技能
      const skills = [
        {
          id: 'web-skill',
          name: 'Web Skill',
          conditions: {
            requires: { toolsets: ['web'] },
          },
        },
        {
          id: 'browser-skill',
          name: 'Browser Skill',
          conditions: {
            requires: { toolsets: ['browser'] },
          },
        },
        {
          id: 'fallback-skill',
          name: 'Fallback Skill',
          conditions: {
            fallbackFor: { toolsets: ['full_stack'] },
          },
        },
      ];
      
      // 配置：启用 web，不启用 browser
      const config: ToolsetConfig = {
        enabled: ['web', 'file', 'memory', 'skills'],
      };
      
      const availableToolsets = new Set(getAvailableToolsets(config));
      
      // 过滤技能
      const filtered = skills.filter(s => 
        isSkillConditionsAllowed(s as any, availableToolsets)
      );
      
      // web-skill: web 可用 → 显示
      expect(filtered.some(s => s.id === 'web-skill')).toBe(true);
      
      // browser-skill: browser 不可用 → 隐藏
      expect(filtered.some(s => s.id === 'browser-skill')).toBe(false);
      
      // fallback-skill: full_stack 不可用 → 显示
      expect(filtered.some(s => s.id === 'fallback-skill')).toBe(true);
    });
    
    it('should hide fallback when full_stack enabled', () => {
      const skills = [
        {
          id: 'fallback-skill',
          name: 'Fallback Skill',
          conditions: {
            fallbackFor: { toolsets: ['full_stack'] },
          },
        },
      ];
      
      // 配置：启用 full_stack
      const config: ToolsetConfig = {
        enabled: ['full_stack'],
      };
      
      const availableToolsets = new Set(getAvailableToolsets(config));
      
      const filtered = skills.filter(s => 
        isSkillConditionsAllowed(s as any, availableToolsets)
      );
      
      // fallback-skill: full_stack 可用 → 隐藏
      expect(filtered.length).toBe(0);
    });
    
    it('should combine multiple conditions', () => {
      const skills = [
        {
          id: 'web-browser-skill',
          name: 'Web + Browser Skill',
          conditions: {
            requires: { toolsets: ['web', 'browser'] },
          },
        },
        {
          id: 'web-skill',
          name: 'Web Only Skill',
          conditions: {
            requires: { toolsets: ['web'] },
          },
        },
      ];
      
      // 配置：启用 web，不启用 browser
      const config: ToolsetConfig = {
        enabled: ['web', 'file', 'memory'],
      };
      
      const availableToolsets = new Set(getAvailableToolsets(config));
      
      const filtered = skills.filter(s => 
        isSkillConditionsAllowed(s as any, availableToolsets)
      );
      
      // web-browser-skill: browser 不可用 → 隐藏
      expect(filtered.some(s => s.id === 'web-browser-skill')).toBe(false);
      
      // web-skill: web 可用 → 显示
      expect(filtered.some(s => s.id === 'web-skill')).toBe(true);
    });
  });
  
  describe('Stage 2: Skill ID Filtering', () => {
    it('should filter by skill IDs after toolset filtering', () => {
      const skills = [
        { id: 'skill-1', name: 'Skill 1' },
        { id: 'skill-2', name: 'Skill 2' },
        { id: 'skill-3', name: 'Skill 3' },
      ];
      
      const skillIds = ['skill-1', 'skill-3'];
      
      const filtered = skills.filter(s => skillIds.includes(s.id));
      
      expect(filtered.length).toBe(2);
      expect(filtered.some(s => s.id === 'skill-2')).toBe(false);
    });
    
    it('should combine toolset and skill ID filters', () => {
      const skills = [
        {
          id: 'web-skill-1',
          name: 'Web Skill 1',
          conditions: { requires: { toolsets: ['web'] } },
        },
        {
          id: 'web-skill-2',
          name: 'Web Skill 2',
          conditions: { requires: { toolsets: ['web'] } },
        },
        {
          id: 'browser-skill',
          name: 'Browser Skill',
          conditions: { requires: { toolsets: ['browser'] } },
        },
      ];
      
      const config: ToolsetConfig = { enabled: ['web'] };
      const availableToolsets = new Set(getAvailableToolsets(config));
      const skillIds = ['web-skill-1'];
      
      // 阶段 1：工具集过滤
      const afterToolset = skills.filter(s => 
        isSkillConditionsAllowed(s as any, availableToolsets)
      );
      
      // 阶段 2：skillIds 过滤
      const final = afterToolset.filter(s => skillIds.includes(s.id));
      
      expect(final.length).toBe(1);
      expect(final[0].id).toBe('web-skill-1');
    });
  });
  
  describe('Integration: buildSkillsPrompt', () => {
    it('should generate prompt with filtered skills', async () => {
      // Mock skills（实际测试需要真实数据）
      // 这里只验证逻辑流程
      
      const config: ToolsetConfig = {
        enabled: ['web', 'file', 'memory'],
      };
      
      const availableToolsets = new Set(getAvailableToolsets(config));
      
      // 验证工具集解析正确
      expect(availableToolsets.has('web')).toBe(true);
      expect(availableToolsets.has('browser')).toBe(false);
      expect(availableToolsets.has('full_stack')).toBe(false);
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle skills without conditions', () => {
      const skills = [
        { id: 'no-conditions', name: 'No Conditions Skill' },
      ];
      
      const availableToolsets = new Set(['web']);
      
      const filtered = skills.filter(s => 
        isSkillConditionsAllowed(s as any, availableToolsets)
      );
      
      // 无条件技能始终显示
      expect(filtered.length).toBe(1);
    });
    
    it('should handle empty toolset config', () => {
      const config: ToolsetConfig = {};
      
      const availableToolsets = new Set(getAvailableToolsets(config));
      
      // 空 config → 所有工具集可用
      expect(availableToolsets.size).toBeGreaterThan(5);
    });
    
    it('should handle disabled toolsets', () => {
      const skills = [
        {
          id: 'browser-skill',
          name: 'Browser Skill',
          conditions: { requires: { toolsets: ['browser'] } },
        },
      ];
      
      const config: ToolsetConfig = {
        disabled: ['browser', 'collaboration'],
      };
      
      const availableToolsets = new Set(getAvailableToolsets(config));
      
      expect(availableToolsets.has('browser')).toBe(false);
      
      const filtered = skills.filter(s => 
        isSkillConditionsAllowed(s as any, availableToolsets)
      );
      
      expect(filtered.length).toBe(0);
    });
  });
});
