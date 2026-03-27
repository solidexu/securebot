/**
 * Skills Matcher 测试
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { SkillLoader } from './loader.js';
import { SkillMatcher } from './matcher.js';

describe('Skills Matcher', () => {
  const testRoot = join(process.cwd(), 'test-skills-temp');
  let loader: SkillLoader;
  let matcher: SkillMatcher;

  beforeAll(async () => {
    // 创建测试目录结构
    const publicSkillDir = join(testRoot, 'skills', 'public', 'code-review');
    mkdirSync(publicSkillDir, { recursive: true });

    const skillContent = `---
id: code-review
name: 代码审查
keywords:
  - review
  - 审查
  - 检查代码
---

# Code Review Skill

专业的代码审查技能。

## When to Use

- 用户说 "帮我审查代码"
- 用户说 "review 一下"
`;

    writeFileSync(join(publicSkillDir, 'SKILL.md'), skillContent, 'utf-8');

    loader = new SkillLoader({ skillsRoot: testRoot });
    await loader.loadAllMetadata(testRoot);

    matcher = new SkillMatcher(loader);
  });

  afterAll(() => {
    // 清理测试目录
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  describe('match', () => {
    it('should match by keywords', async () => {
      const results = await matcher.match('帮我审查代码');

      expect(results.length).toBeGreaterThan(0);
      
      const bestMatch = results[0];
      expect(bestMatch?.score).toBeGreaterThan(0.5);
      expect(bestMatch?.method).toBe('keyword');
      expect(bestMatch?.metadata.id).toBe('code-review');
    });

    it('should match with different keyword variations', async () => {
      const results = await matcher.match('review 一下这个文件');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.metadata.id).toBe('code-review');
    });

    it('should return empty array when no match', async () => {
      const results = await matcher.match('这是一个完全不相关的话题');

      expect(results.length).toBe(0);
    });

    it('should limit results to maxMatches', async () => {
      const limitedMatcher = new SkillMatcher(loader, undefined, { maxMatches: 1 });
      const results = await limitedMatcher.match('帮我审查代码');

      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('matchBest', () => {
    it('should return best match', async () => {
      const result = await matcher.matchBest('帮我审查代码');

      expect(result).not.toBeNull();
      expect(result?.metadata.id).toBe('code-review');
      expect(result?.skill).toBeDefined();
      expect(result?.skill?.name).toBe('代码审查');
    });

    it('should return null when no match', async () => {
      const result = await matcher.matchBest('完全不相关的内容');

      expect(result).toBeNull();
    });
  });

  describe('threshold', () => {
    it('should respect keyword threshold', async () => {
      const strictMatcher = new SkillMatcher(loader, undefined, {
        keywordThreshold: 0.9,  // 更高的阈值
      });

      const results = await strictMatcher.match('帮我审查代码');

      // 由于阈值更高，可能不会匹配
      // 关键词匹配只匹配到 "审查"，分数是 0.6
      // 0.6 < 0.9，所以不应该匹配
      expect(results.length).toBe(0);
    });
  });
});