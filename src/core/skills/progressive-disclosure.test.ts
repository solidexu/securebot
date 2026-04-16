/**
 * Progressive Disclosure 测试
 */

import { describe, it, expect } from 'vitest';
import {
  truncateDescription,
  truncateName,
  inferTrustLevel,
  formatSkillForList,
  formatSkillsListOutput,
  formatSkillViewOutput,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  type SkillListEntry,
} from './progressive-disclosure.js';

describe('Progressive Disclosure', () => {
  describe('truncateDescription', () => {
    it('should truncate long descriptions', () => {
      const long = 'This is a very long description that exceeds the maximum length limit and should be truncated properly';
      const result = truncateDescription(long);
      
      expect(result.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should keep short descriptions intact', () => {
      const short = 'Short desc';
      const result = truncateDescription(short);
      
      expect(result).toBe(short);
    });

    it('should handle empty descriptions', () => {
      expect(truncateDescription('')).toBe('');
      expect(truncateDescription(null as any)).toBe('');
    });

    it('should use custom max length', () => {
      const text = 'Medium length description';
      const result = truncateDescription(text, 10);
      
      expect(result.length).toBeLessThanOrEqual(10);
    });
  });

  describe('truncateName', () => {
    it('should truncate long names', () => {
      const long = 'very-long-skill-name-that-exceeds-the-limit';
      const result = truncateName(long);
      
      expect(result.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    });

    it('should keep short names intact', () => {
      const short = 'skill-name';
      const result = truncateName(short);
      
      expect(result).toBe(short);
    });
  });

  describe('inferTrustLevel', () => {
    it('should return user for private skills', () => {
      const result = inferTrustLevel('/path/to/agents/abc/skills/test/SKILL.md', 'private');
      expect(result).toBe('user');
    });

    it('should return builtin for project skills', () => {
      const result = inferTrustLevel('/skills/public/test/SKILL.md', 'public');
      expect(result).toBe('builtin');
    });

    it('should return community for user directory', () => {
      const result = inferTrustLevel('/home/user/.securebot/skills/public/test/SKILL.md', 'public');
      expect(result).toBe('community');
    });
  });

  describe('formatSkillForList', () => {
    it('should format metadata for list display', () => {
      const metadata = {
        id: 'test-skill',
        name: 'Test Skill',
        description: 'A test skill description',
        skillFile: '/skills/public/test/SKILL.md',
        category: 'public' as const,
      };
      
      const result = formatSkillForList(metadata);
      
      expect(result.id).toBe('test-skill');
      expect(result.name).toBe('Test Skill');
      expect(result.trustLevel).toBe('builtin');
      expect(result.category).toBe('public');
    });

    it('should truncate description in list format', () => {
      const metadata = {
        id: 'test',
        name: 'Test',
        description: 'Very long description that needs truncation',
        skillFile: '/skills/public/test/SKILL.md',
        category: 'public' as const,
      };
      
      const result = formatSkillForList(metadata);
      
      expect(result.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    });
  });

  describe('formatSkillsListOutput', () => {
    it('should format empty list', () => {
      const result = formatSkillsListOutput([]);
      
      expect(result).toContain('没有可用技能');
      expect(result).toContain('create_skill');
    });

    it('should group skills by trust level', () => {
      const entries: SkillListEntry[] = [
        { id: 'builtin-1', name: 'Builtin', description: '', trustLevel: 'builtin', category: 'public' },
        { id: 'user-1', name: 'User', description: '', trustLevel: 'user', category: 'private' },
      ];
      
      const result = formatSkillsListOutput(entries);
      
      expect(result).toContain('### 内置技能');
      expect(result).toContain('### 个人技能');
    });

    it('should include skill_view hint', () => {
      const entries: SkillListEntry[] = [
        { id: 'test', name: 'Test', description: '', trustLevel: 'builtin', category: 'public' },
      ];
      
      const result = formatSkillsListOutput(entries);
      
      expect(result).toContain('skill_view');
    });
  });

  describe('formatSkillViewOutput', () => {
    it('should format full skill content', () => {
      const skill = {
        id: 'test-skill',
        name: 'Test Skill',
        overview: 'This is a test skill',
        whenToUse: ['Scenario 1', 'Scenario 2'],
        workflow: [
          { name: 'Step 1', description: 'Do something', tools: ['read', 'write'] },
        ],
        bestPractices: ['Practice 1'],
        examples: [
          { title: 'Example 1', user: 'User input', assistant: 'Assistant response' },
        ],
      };
      
      const result = formatSkillViewOutput(skill);
      
      expect(result).toContain('## Test Skill');
      expect(result).toContain('### 概述');
      expect(result).toContain('### 适用场景');
      expect(result).toContain('### 工作流程');
      expect(result).toContain('### 最佳实践');
      expect(result).toContain('### 示例');
    });

    it('should handle minimal skill data', () => {
      const skill = {
        id: 'minimal',
        name: 'Minimal Skill',
      };
      
      const result = formatSkillViewOutput(skill);
      
      expect(result).toContain('## Minimal Skill');
      expect(result).toContain('**ID**: minimal');
    });
  });
});
