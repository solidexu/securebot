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
      expect(skill?.name).toBe('code-review'); // name字段就是code-review
      expect(skill?.version).toBe('1.0.0');
      expect(skill?.author).toBeUndefined(); // 文件中没有author字段
    });

    it('should parse keywords', () => {
      expect(skill?.keywords).toBeDefined();
      expect(skill?.keywords.length).toBeGreaterThan(0);
      expect(skill?.keywords).toContain('review');
      expect(skill?.keywords).toContain('代码审查'); // 文件中是'代码审查'而不是'审查'
    });

    it('should parse tools', () => {
      // 文件中没有tools字段，所以应该是undefined或空
      expect(skill?.tools).toBeUndefined(); // 文件中未定义tools
    });

    it('should parse trigger config', () => {
      // 文件中没有trigger字段，所以应该是undefined
      expect(skill?.trigger).toBeUndefined(); // 文件中未定义trigger
    });

it('should parse overview', () => {
      expect(skill?.overview).toBeDefined();
    });

    it('should parse When to Use section', () => {
      expect(skill?.whenToUse).toBeDefined();
    });

    it('should parse Workflow section', () => {
      expect(skill?.workflow).toBeDefined();
    });

    it('should parse Best Practices section', () => {
      expect(skill?.bestPractices).toBeDefined();
    });

    it('should parse Examples section', () => {
      expect(skill?.examples).toBeDefined();
    });

    it('should parse Resources section', () => {
      expect(skill?.resources).toBeDefined();
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