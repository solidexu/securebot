/**
 * 技能版本管理命令
 */

import * as p from '@clack/prompts';
import chalk from 'chalk';
import { getSkillVersionManager } from '../../core/skills/version.js';

/**
 * 列出技能版本
 */
export async function listVersions(skillId: string): Promise<void> {
  const versionManager = getSkillVersionManager();
  const versions = await versionManager.listVersions(skillId);

  if (versions.length === 0) {
    console.log(chalk.yellow(`技能 "${skillId}" 暂无版本历史`));
    return;
  }

  console.log(chalk.cyan.bold(`\n📜 ${skillId} 版本历史\n`));

  for (const v of versions) {
    const date = new Date(v.createdAt).toLocaleString();
    console.log(`  ${chalk.green(v.version)} - ${date}`);
    if (v.changelog) {
      console.log(chalk.gray(`    ${v.changelog}`));
    }
    console.log(chalk.gray(`    校验和: ${v.checksum}`));
    console.log();
  }
}

/**
 * 保存当前版本
 */
export async function saveVersion(skillId: string, changelog?: string): Promise<void> {
  const versionManager = getSkillVersionManager();

  if (!changelog) {
    changelog = await p.text({
      message: '版本变更说明（可选）',
      placeholder: '修复了 xxx 问题',
    }) as string;

    if (p.isCancel(changelog)) {
      console.log(chalk.gray('已取消'));
      return;
    }
  }

  try {
    const version = await versionManager.saveVersion(skillId, changelog || undefined);
    console.log(chalk.green(`\n✓ 已保存版本 ${version.version}\n`));
    console.log(chalk.gray(`  校验和: ${version.checksum}`));
    console.log(chalk.gray(`  大小: ${formatSize(version.size)}`));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`保存失败: ${msg}`));
  }
}

/**
 * 回滚到指定版本
 */
export async function rollbackVersion(skillId: string, targetVersion?: string): Promise<void> {
  const versionManager = getSkillVersionManager();

  if (!targetVersion) {
    const versions = await versionManager.listVersions(skillId);
    
    if (versions.length === 0) {
      console.log(chalk.yellow('暂无可回滚的版本'));
      return;
    }

    const selected = await p.select({
      message: '选择要回滚的版本',
      options: versions.map(v => ({
        value: v.version,
        label: `${v.version} (${new Date(v.createdAt).toLocaleDateString()})`,
      })),
    });

    if (p.isCancel(selected)) {
      console.log(chalk.gray('已取消'));
      return;
    }

    targetVersion = selected as string;
  }

  const confirmed = await p.confirm({
    message: `确认回滚到版本 ${targetVersion}？当前版本将自动备份`,
    initialValue: false,
  });

  if (!confirmed) {
    console.log(chalk.gray('已取消'));
    return;
  }

  try {
    await versionManager.rollback(skillId, targetVersion);
    console.log(chalk.green(`\n✓ 已回滚到版本 ${targetVersion}\n`));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`回滚失败: ${msg}`));
  }
}

/**
 * 对比两个版本
 */
export async function diffVersions(skillId: string, version1?: string, version2?: string): Promise<void> {
  const versionManager = getSkillVersionManager();
  const versions = await versionManager.listVersions(skillId);

  if (versions.length < 2) {
    console.log(chalk.yellow('需要至少 2 个版本才能对比'));
    return;
  }

  if (!version1) {
    const selected = await p.select({
      message: '选择第一个版本',
      options: versions.map(v => ({
        value: v.version,
        label: v.version,
      })),
    });

    if (p.isCancel(selected)) {
      console.log(chalk.gray('已取消'));
      return;
    }

    version1 = selected as string;
  }

  if (!version2) {
    const selected = await p.select({
      message: '选择第二个版本',
      options: versions.filter(v => v.version !== version1).map(v => ({
        value: v.version,
        label: v.version,
      })),
    });

    if (p.isCancel(selected)) {
      console.log(chalk.gray('已取消'));
      return;
    }

    version2 = selected as string;
  }

  try {
    const diff = await versionManager.diff(skillId, version1, version2);
    
    console.log(chalk.cyan.bold(`\n🔍 版本对比: ${version1} vs ${version2}\n`));

    if (diff.added.length > 0) {
      console.log(chalk.green('新增文件:'));
      for (const f of diff.added) {
        console.log(chalk.green(`  + ${f}`));
      }
    }

    if (diff.removed.length > 0) {
      console.log(chalk.red('删除文件:'));
      for (const f of diff.removed) {
        console.log(chalk.red(`  - ${f}`));
      }
    }

    if (diff.modified.length > 0) {
      console.log(chalk.yellow('修改文件:'));
      for (const f of diff.modified) {
        console.log(chalk.yellow(`  ~ ${f}`));
      }
    }

    console.log();
    console.log(chalk.gray(`统计: ${diff.changelog}`));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`对比失败: ${msg}`));
  }
}

/**
 * 删除版本
 */
export async function deleteVersion(skillId: string, version?: string): Promise<void> {
  const versionManager = getSkillVersionManager();

  if (!version) {
    const versions = await versionManager.listVersions(skillId);
    
    if (versions.length === 0) {
      console.log(chalk.yellow('暂无可删除的版本'));
      return;
    }

    const selected = await p.select({
      message: '选择要删除的版本',
      options: versions.map(v => ({
        value: v.version,
        label: v.version,
      })),
    });

    if (p.isCancel(selected)) {
      console.log(chalk.gray('已取消'));
      return;
    }

    version = selected as string;
  }

  const confirmed = await p.confirm({
    message: `确认删除版本 ${version}？`,
    initialValue: false,
  });

  if (!confirmed) {
    console.log(chalk.gray('已取消'));
    return;
  }

  try {
    await versionManager.deleteVersion(skillId, version);
    console.log(chalk.green(`✓ 已删除版本 ${version}`));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`删除失败: ${msg}`));
  }
}

// 辅助函数
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}