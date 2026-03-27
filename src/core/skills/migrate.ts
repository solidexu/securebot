/**
 * JSON 技能迁移工具
 * 
 * 将旧版 JSON 格式技能转换为 Markdown 格式
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { LegacySkill, MarkdownSkill } from './types.js';

/**
 * 迁移选项
 */
export interface MigrationOptions {
  /** 源目录（JSON 技能） */
  sourceDir: string;
  /** 目标目录（Markdown 技能） */
  targetDir: string;
  /** 是否保留原文件 */
  keepOriginal?: boolean;
  /** 是否覆盖已存在的文件 */
  overwrite?: boolean;
}

/**
 * 迁移结果
 */
export interface MigrationResult {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  errors: Array<{ file: string; error: string }>;
}

/**
 * 迁移单个技能
 */
export function migrateSkill(jsonPath: string, targetDir: string, overwrite?: boolean): boolean {
  try {
    // 读取 JSON 文件
    const content = readFileSync(jsonPath, 'utf-8');
    const legacySkill: LegacySkill = JSON.parse(content);

    // 验证必需字段
    if (!legacySkill.id || !legacySkill.name || !legacySkill.systemPrompt) {
      console.warn(`Skill missing required fields: ${jsonPath}`);
      return false;
    }

    // 创建目标目录
    const skillDir = join(targetDir, legacySkill.id);
    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true });
    }

    // 检查是否已存在
    const skillFile = join(skillDir, 'SKILL.md');
    if (existsSync(skillFile) && !overwrite) {
      console.log(`Skill already exists, skipping: ${legacySkill.id}`);
      return false;
    }

    // 转换为 Markdown 格式
    const markdown = convertToMarkdown(legacySkill);

    // 写入文件
    writeFileSync(skillFile, markdown, 'utf-8');

    console.log(`✓ Migrated: ${legacySkill.id}`);
    return true;
  } catch (error) {
    console.error(`Failed to migrate ${jsonPath}:`, error);
    return false;
  }
}

/**
 * 迁移目录中的所有技能
 */
export function migrateSkills(options: MigrationOptions): MigrationResult {
  const result: MigrationResult = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  // 扫描源目录
  if (!existsSync(options.sourceDir)) {
    result.errors.push({
      file: options.sourceDir,
      error: 'Source directory does not exist',
    });
    return result;
  }

  const files = readdirSync(options.sourceDir)
    .filter(f => f.endsWith('.json'));

  result.total = files.length;

  for (const file of files) {
    const jsonPath = join(options.sourceDir, file);

    try {
      const success = migrateSkill(jsonPath, options.targetDir, options.overwrite);

      if (success) {
        result.success++;
      } else {
        result.skipped++;
      }
    } catch (error) {
      result.failed++;
      result.errors.push({
        file: jsonPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

/**
 * 将旧版 JSON 技能转换为 Markdown 格式
 */
export function convertToMarkdown(skill: LegacySkill): string {
  const lines: string[] = [];

  // YAML front matter
  lines.push('---');
  lines.push(`id: ${skill.id}`);
  lines.push(`name: ${skill.name}`);

  if (skill.keywords && skill.keywords.length > 0) {
    lines.push('keywords:');
    for (const keyword of skill.keywords) {
      lines.push(`  - ${keyword}`);
    }
  }

  if (skill.tools && skill.tools.length > 0) {
    lines.push('tools:');
    for (const tool of skill.tools) {
      lines.push(`  - ${tool}`);
    }
  }

  lines.push('trigger:');
  lines.push('  type: auto');
  lines.push('  confidence: 0.6');
  lines.push('---');
  lines.push('');

  // 标题
  lines.push(`# ${skill.name} Skill`);
  lines.push('');

  // 概述
  lines.push('## Overview');
  lines.push('');
  lines.push(skill.description || '');
  lines.push('');

  // 使用场景
  if (skill.keywords && skill.keywords.length > 0) {
    lines.push('## When to Use');
    lines.push('');
    for (const keyword of skill.keywords) {
      lines.push(`- 用户说 "${keyword}"`);
    }
    lines.push('');
  }

  // 系统提示词
  lines.push('## Instructions');
  lines.push('');
  lines.push(skill.systemPrompt);
  lines.push('');

  // 示例
  if (skill.examples && skill.examples.length > 0) {
    lines.push('## Examples');
    lines.push('');

    skill.examples.forEach((example, index) => {
      lines.push(`### Example ${index + 1}`);
      lines.push('');
      lines.push(`**User**: ${example.user}`);
      lines.push('');
      lines.push(`**Assistant**: ${example.assistant}`);
      lines.push('');
    });
  }

  return lines.join('\n');
}

/**
 * 批量迁移所有技能（公共 + 个人）
 */
export function migrateAllSkills(rootDir: string): MigrationResult {
  const results: MigrationResult = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  // 迁移公共技能
  const publicSourceDir = join(rootDir, 'skills', 'public');
  const publicTargetDir = join(rootDir, 'skills', 'public');

  if (existsSync(publicSourceDir)) {
    const publicResult = migrateSkills({
      sourceDir: publicSourceDir,
      targetDir: publicTargetDir,
      overwrite: true,
    });

    results.total += publicResult.total;
    results.success += publicResult.success;
    results.failed += publicResult.failed;
    results.skipped += publicResult.skipped;
    results.errors.push(...publicResult.errors);
  }

  // 迁移个人技能
  const agentsDir = join(rootDir, 'agents');
  if (existsSync(agentsDir)) {
    const agentDirs = readdirSync(agentsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const agentId of agentDirs) {
      const sourceDir = join(agentsDir, agentId, 'skills');
      const targetDir = join(agentsDir, agentId, 'skills');

      if (existsSync(sourceDir)) {
        const agentResult = migrateSkills({
          sourceDir,
          targetDir,
          overwrite: true,
        });

        results.total += agentResult.total;
        results.success += agentResult.success;
        results.failed += agentResult.failed;
        results.skipped += agentResult.skipped;
        results.errors.push(...agentResult.errors);
      }
    }
  }

  return results;
}

/**
 * CLI 工具入口
 */
export async function runMigration(rootDir?: string): Promise<void> {
  const { getRootDir } = await import('../config.js');
  const dir = rootDir || getRootDir();

  console.log('Starting skill migration...');
  console.log(`Root directory: ${dir}`);
  console.log('');

  const result = migrateAllSkills(dir);

  console.log('');
  console.log('Migration completed:');
  console.log(`  Total:   ${result.total}`);
  console.log(`  Success: ${result.success}`);
  console.log(`  Skipped: ${result.skipped}`);
  console.log(`  Failed:  ${result.failed}`);

  if (result.errors.length > 0) {
    console.log('');
    console.log('Errors:');
    for (const error of result.errors) {
      console.log(`  - ${error.file}: ${error.error}`);
    }
  }
}