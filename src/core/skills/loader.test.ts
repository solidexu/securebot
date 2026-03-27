/**
 * Skills Loader 测试
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { SkillLoader } from './loader.js';

describe('Skills Loader', () => {
  const testRoot = join(process.cwd(), 'test-skills-temp');
  let loader: SkillLoader;

  beforeAll(() => {
    // 创建测试目录结构
    const publicSkillDir = join(testRoot, 'skills', 'public', 'test-skill');
    mkdirSync(publicSkillDir, { recursive: true });

    // 创建测试技能文件
    const skillContent = `---
id: test-skill
name: Test Skill
keywords:
  - test
  - 测试
---

# Test Skill

## Overview

This is a test skill.

## When to Use

- Test scenario 1
- Test scenario 2
`;

    writeFileSync(join(publicSkillDir, 'SKILL.md'), skillContent, 'utf-8');

    loader = new SkillLoader({ skillsRoot: testRoot });
  });

  afterAll(() => {
    // 清理测试目录
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  describe('loadAllMetadata', () => {
    it('should load skill metadata', async () => {
      const metadata = await loader.loadAllMetadata(testRoot);

      expect(metadata.length).toBeGreaterThan(0);
      
      const testSkillMeta = metadata.find(m => m.id === 'test-skill');
      expect(testSkillMeta).toBeDefined();
      expect(testSkillMeta?.name).toBe('Test Skill');
      expect(testSkillMeta?.keywords).toContain('test');
    });

    it('should cache metadata', async () => {
      await loader.loadAllMetadata(testRoot);

      const cached = loader.getCachedMetadata('test-skill');
      expect(cached).toBeDefined();
      expect(cached?.name).toBe('Test Skill');
    });
  });

  describe('loadSkillContent', () => {
    it('should load skill content on demand', async () => {
      await loader.loadAllMetadata(testRoot);

      const skill = await loader.loadSkillContent('test-skill');

      expect(skill).not.toBeNull();
      expect(skill?.id).toBe('test-skill');
      expect(skill?.name).toBe('Test Skill');
      expect(skill?.overview).toBeDefined();
      expect(skill?.overview).toContain('This is a test skill');
      expect(skill?.whenToUse).toBeDefined();
      expect(skill?.whenToUse).toContain('Test scenario 1');
    });

    it('should cache loaded content', async () => {
      await loader.loadAllMetadata(testRoot);

      // 第一次加载
      const skill1 = await loader.loadSkillContent('test-skill');
      
      // 第二次加载（从缓存）
      const skill2 = await loader.loadSkillContent('test-skill');

      expect(skill1).toEqual(skill2);

      // 检查缓存统计
      const stats = loader.getCacheStats();
      expect(stats.contentCount).toBeGreaterThan(0);
    });

    it('should return null for non-existent skill', async () => {
      const skill = await loader.loadSkillContent('non-existent-skill');
      expect(skill).toBeNull();
    });
  });

  describe('clearCache', () => {
    it('should clear all caches', async () => {
      await loader.loadAllMetadata(testRoot);
      await loader.loadSkillContent('test-skill');

      loader.clearCache();

      const stats = loader.getCacheStats();
      expect(stats.metadataCount).toBe(0);
      expect(stats.contentCount).toBe(0);
    });
  });
});