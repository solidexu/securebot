/**
 * Skills Markdown 解析器测试
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { parseSkillFile, extractOverview } from './parser.js';
import type { MarkdownSkill } from './types.js';

describe('Skills Parser', () => {
  const skillFile = join(process.cwd(), 'skills', 'public', 'code-review', 'SKILL.md');
  let skill: MarkdownSkill | null = null;

  beforeAll(() => {
    skill = parseSkillFile(skillFile);
  });

  describe('parseSkillFile', () => {
    it('should parse YAML front matter', () => {
      expect(skill).not.toBeNull();
      expect(skill?.id).toBe('code-review');
      expect(skill?.name).toBe('代码审查');
      expect(skill?.version).toBe('1.0.0');
      expect(skill?.author).toBe('securebot');
    });

    it('should parse keywords', () => {
      expect(skill?.keywords).toBeDefined();
      expect(skill?.keywords.length).toBeGreaterThan(0);
      expect(skill?.keywords).toContain('review');
      expect(skill?.keywords).toContain('审查');
    });

    it('should parse tools', () => {
      expect(skill?.tools).toBeDefined();
      expect(skill?.tools).toContain('read');
      expect(skill?.tools).toContain('edit');
    });

    it('should parse trigger config', () => {
      expect(skill?.trigger).toBeDefined();
      expect(skill?.trigger?.type).toBe('auto');
      expect(skill?.trigger?.confidence).toBe(0.6);
    });

    it('should parse overview', () => {
      expect(skill?.overview).toBeDefined();
      expect(skill?.overview).toContain('专业的代码审查技能');
    });

    it('should parse When to Use section', () => {
      expect(skill?.whenToUse).toBeDefined();
      expect(skill?.whenToUse?.length).toBeGreaterThan(0);
      expect(skill?.whenToUse).toContain('用户说 "帮我审查代码"');
    });

    it('should parse Workflow section', () => {
      expect(skill?.workflow).toBeDefined();
      expect(skill?.workflow?.length).toBeGreaterThan(0);
      
      const step1 = skill?.workflow?.find(s => s.name === 'Step 1');
      expect(step1).toBeDefined();
      expect(step1?.description).toContain('Read Code');
    });

    it('should parse Best Practices section', () => {
      expect(skill?.bestPractices).toBeDefined();
      expect(skill?.bestPractices?.length).toBeGreaterThan(0);
      // 检查是否包含关键内容
      expect(skill?.bestPractices?.some(p => p.includes('优先级排序'))).toBe(true);
    });

    it('should parse Examples section', () => {
      expect(skill?.examples).toBeDefined();
      expect(skill?.examples?.length).toBeGreaterThan(0);
      
      const example1 = skill?.examples?.[0];
      expect(example1?.title).toBe('Simple Review');
      expect(example1?.user).toContain('app.py');
    });

    it('should parse Resources section', () => {
      expect(skill?.resources).toBeDefined();
      expect(skill?.resources?.length).toBeGreaterThan(0);
      
      const checklist = skill?.resources?.find(r => r.path.includes('checklist'));
      expect(checklist).toBeDefined();
      expect(checklist?.type).toBe('template');
    });

    it('should return null for non-existent file', () => {
      const result = parseSkillFile('/non/existent/file.md');
      expect(result).toBeNull();
    });
  });

  describe('extractOverview', () => {
    it('should extract overview from markdown body', () => {
      const body = `# Test Skill

This is the overview.

## Section 1

Content...`;

      const overview = extractOverview(body);
      expect(overview).toBe('This is the overview.');
    });
  });
});