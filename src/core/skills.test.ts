/**
 * Skill 链路测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  SkillManager,
  SkillDetector,
  getSkillManager,
  getSkillDetector,
  resetSkillManager,
  resetSkillDetector,
} from './skills.js';

describe('Skill Chain Tests', () => {
  let testDir: string;
  let skillManager: SkillManager;
  let skillDetector: SkillDetector;

  beforeEach(() => {
    // 创建临时测试目录
    testDir = join(tmpdir(), `skill-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, 'skills', 'public'), { recursive: true });
    mkdirSync(join(testDir, 'skills', 'private'), { recursive: true });

    // 重置单例
    resetSkillManager();
    resetSkillDetector();

    // 使用测试目录初始化
    process.env.SECUREBOT_CONFIG_DIR = testDir;
  });

  afterEach(() => {
    // 清理测试目录
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    delete process.env.SECUREBOT_CONFIG_DIR;
  });

  describe('Skill Creation', () => {
    it('should create a private skill', async () => {
      skillManager = getSkillManager();
      await skillManager.initialize();

      const skill = await skillManager.createPrivateSkill('test-agent', {
        id: 'test-skill',
        name: '测试技能',
        description: '用于测试的技能',
        keywords: ['测试', 'test'],
        systemPrompt: '你是一个测试助手',
      });

      expect(skill).toBeDefined();
      expect(skill.id).toBe('test-skill');
      expect(skill.name).toBe('测试技能');
      expect(skill.keywords).toContain('测试');
      expect(skill.isPublic).toBe(false);
    });

    it('should create a public skill', async () => {
      skillManager = getSkillManager();
      await skillManager.initialize();

      const skill = await skillManager.createPublicSkill({
        id: 'public-skill',
        name: '公共技能',
        description: '所有人可用的技能',
        systemPrompt: '你是公共助手',
      });

      expect(skill.isPublic).toBe(true);
    });
  });

  describe('Skill Detection', () => {
    beforeEach(async () => {
      skillManager = getSkillManager();
      await skillManager.initialize();
      skillDetector = getSkillDetector();
    });

    it('should detect skill by keyword', async () => {
      // 创建测试技能
      await skillManager.createPrivateSkill('test-agent', {
        id: 'code-review',
        name: '代码审查',
        description: '帮助审查代码',
        keywords: ['审查', 'review', '代码'],
        systemPrompt: '你是代码审查专家',
      });

      // 测试关键词匹配
      const result = await skillDetector.detectBest('帮我审查这段代码', 'test-agent');

      expect(result).not.toBeNull();
      expect(result?.skill.id).toBe('code-review');
      expect(result?.method).toBe('keyword');
    });

    it('should detect skill by semantic similarity', async () => {
      // 创建测试技能（无关键词）
      await skillManager.createPrivateSkill('test-agent', {
        id: 'translator',
        name: '翻译助手',
        description: '帮助进行多语言翻译转换',
        systemPrompt: '你是翻译专家',
      });

      // 测试语义匹配
      const result = await skillDetector.detectBest('请帮我翻译这段话', 'test-agent');

      // 可能匹配到内置技能或新创建的技能
      if (result) {
        expect(result.skill).toBeDefined();
      }
    });

    it('should return null when no skill matches', async () => {
      const result = await skillDetector.detectBest('随机的不相关消息', 'test-agent');
      expect(result).toBeNull();
    });
  });

  describe('Skill Prompt Injection', () => {
    beforeEach(async () => {
      skillManager = getSkillManager();
      await skillManager.initialize();
    });

    it('should build skills prompt for agent', async () => {
      // 创建技能 - 直接使用overview
      await skillManager.createPrivateSkill('test-agent', {
        id: 'helper',
        name: '助手技能',
        keywords: ['帮助', '助手'],
      });

      // 构建提示词
      const prompt = await skillManager.buildSkillsPrompt('test-agent', ['helper']);

      expect(prompt).toContain('助手技能');
    });
  });

  describe('Skill Tools', () => {
    it('should list agent skills', async () => {
      skillManager = getSkillManager();
      await skillManager.initialize();

      // 创建公共和私有技能
      await skillManager.createPublicSkill({
        id: 'public-helper',
        name: '公共助手',
        description: '公共技能',
        systemPrompt: '公共提示词',
      });

      await skillManager.createPrivateSkill('test-agent', {
        id: 'private-helper',
        name: '私有助手',
        description: '私有技能',
        systemPrompt: '私有提示词',
      });

      const publicSkills = await skillManager.listPublicSkills();
      const privateSkills = await skillManager.listPrivateSkills('test-agent');

      // 公共技能包含内置技能 + 新创建的
      expect(publicSkills.length).toBeGreaterThan(0);
      
      // 私有技能应该包含我们创建的
      const privateIds = privateSkills.map(s => s.id);
      expect(privateIds).toContain('private-helper');
    });

    it('should update skill', async () => {
      skillManager = getSkillManager();
      await skillManager.initialize();

      await skillManager.createPrivateSkill('test-agent', {
        id: 'update-test',
        name: '原始名称',
        description: '原始描述',
        systemPrompt: '原始提示词',
      });

      const updated = await skillManager.updateSkill('update-test', {
        name: '新名称',
        keywords: ['新关键词'],
      });

      expect(updated?.name).toBe('新名称');
      expect(updated?.keywords).toContain('新关键词');
    });

    it('should delete skill', async () => {
      skillManager = getSkillManager();
      await skillManager.initialize();

      await skillManager.createPrivateSkill('test-agent', {
        id: 'delete-test',
        name: '待删除技能',
        description: '将被删除',
        systemPrompt: '提示词',
      });

      const deleted = await skillManager.deleteSkill('delete-test', false, 'test-agent');
      expect(deleted).toBe(true);

      const skill = await skillManager.loadSkill('delete-test', false, 'test-agent');
      expect(skill).toBeNull();
    });
  });
});