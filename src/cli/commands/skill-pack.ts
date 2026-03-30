/**
 * 技能打包和安装命令
 */

import chalk from 'chalk';
import { existsSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { getSkillPackager } from '../../core/skills/packager.js';
import { getSkillManager } from '../../core/skills.js';

/**
 * 打包技能
 */
export async function packSkill(skillId: string, outputPath?: string): Promise<void> {
  const packager = getSkillPackager();

  console.log(chalk.cyan.bold(`\n📦 打包技能: ${skillId}\n`));

  try {
    const startTime = Date.now();
    const skillFile = await packager.pack(skillId, { outputPath });
    const elapsed = Date.now() - startTime;
    const stat = statSync(skillFile);

    console.log(chalk.green(`✓ 打包成功\n`));
    console.log(chalk.white(`  文件: ${skillFile}`));
    console.log(chalk.white(`  大小: ${formatSize(stat.size)}`));
    console.log(chalk.white(`  耗时: ${elapsed}ms`));
    console.log();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`打包失败: ${msg}`));
  }
}

/**
 * 安装技能
 */
export async function installSkill(source: string, options?: { overwrite?: boolean; targetDir?: string }): Promise<void> {
  const packager = getSkillPackager();

  console.log(chalk.cyan.bold(`\n📥 安装技能\n`));

  try {
    let result;

    // 判断是 URL 还是本地文件
    if (source.startsWith('http://') || source.startsWith('https://')) {
      console.log(chalk.gray(`从远程下载: ${source}`));
      result = await packager.installFromUrl(source, options);
    } else {
      const skillFile = resolve(source);
      
      if (!existsSync(skillFile)) {
        console.log(chalk.red(`文件不存在: ${skillFile}`));
        return;
      }

      if (!skillFile.endsWith('.skill')) {
        console.log(chalk.red('无效的技能包格式，需要 .skill 文件'));
        return;
      }

      console.log(chalk.gray(`从本地安装: ${skillFile}`));
      result = await packager.install(skillFile, options);
    }

    if (result.success) {
      console.log(chalk.green(`\n✓ ${result.message}\n`));
      console.log(chalk.white(`  技能ID: ${result.skillId}`));
      console.log(chalk.white(`  安装路径: ${result.installedPath}`));
      console.log();
    } else {
      console.log(chalk.yellow(`\n⚠ ${result.message}\n`));
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`安装失败: ${msg}`));
  }
}

/**
 * 验证技能包
 */
export async function verifySkill(skillFile: string): Promise<void> {
  const packager = getSkillPackager();

  console.log(chalk.cyan.bold(`\n🔍 验证技能包\n`));

  try {
    const result = await packager.verify(skillFile);

    if (result.valid) {
      console.log(chalk.green('✓ 技能包有效\n'));

      // 显示包内容
      const manifest = await packager.listContents(skillFile);
      if (manifest) {
        console.log(chalk.white('包信息:'));
        console.log(chalk.white(`  名称: ${manifest.name}`));
        console.log(chalk.white(`  版本: ${manifest.version}`));
        console.log(chalk.white(`  大小: ${formatSize(manifest.size)}`));
        console.log(chalk.white(`  校验和: ${manifest.checksum}`));
        if (manifest.keywords?.length) {
          console.log(chalk.white(`  关键词: ${manifest.keywords.join(', ')}`));
        }
        console.log();
      }
    } else {
      console.log(chalk.red('✗ 技能包无效\n'));
      for (const error of result.errors) {
        console.log(chalk.red(`  - ${error}`));
      }
      console.log();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`验证失败: ${msg}`));
  }
}

/**
 * 查看技能包内容
 */
export async function inspectSkill(skillFile: string): Promise<void> {
  const packager = getSkillPackager();

  const manifest = await packager.listContents(skillFile);

  if (!manifest) {
    console.log(chalk.red('无法读取技能包'));
    return;
  }

  console.log(chalk.cyan.bold(`\n📋 ${manifest.name} v${manifest.version}\n`));

  if (manifest.description) {
    console.log(chalk.white(manifest.description));
    console.log();
  }

  console.log(chalk.white('文件列表:'));
  for (const file of manifest.files) {
    console.log(chalk.gray(`  ${file}`));
  }
  console.log();

  console.log(chalk.gray(`校验和: ${manifest.checksum}`));
  console.log(chalk.gray(`创建时间: ${new Date(manifest.createdAt).toLocaleString()}`));
  console.log(chalk.gray(`大小: ${formatSize(manifest.size)}`));
}

/**
 * 导出所有技能
 */
export async function exportAllSkills(outputDir?: string): Promise<void> {
  const skillManager = getSkillManager();
  await skillManager.initialize();

  const skills = await skillManager.listPublicSkills();

  if (skills.length === 0) {
    console.log(chalk.yellow('没有可导出的技能'));
    return;
  }

  const packager = getSkillPackager();
  const targetDir = outputDir || process.cwd();

  console.log(chalk.cyan.bold(`\n📦 导出 ${skills.length} 个技能\n`));

  let success = 0;
  let failed = 0;

  for (const skill of skills) {
    try {
      const file = await packager.pack(skill.id, { outputPath: targetDir });
      console.log(chalk.green(`  ✓ ${skill.id}: ${basename(file)}`));
      success++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`  ✗ ${skill.id}: ${msg}`));
      failed++;
    }
  }

  console.log();
  console.log(chalk.white(`成功: ${success}, 失败: ${failed}`));
}

// 辅助函数
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}