/**
 * 技能发现命令
 */

import chalk from 'chalk';
import { getSkillRegistry, type RemoteSkill } from '../../core/skills/registry.js';

/**
 * 搜索技能
 */
export async function searchSkills(query: string): Promise<void> {
  const registry = getSkillRegistry();

  console.log(chalk.cyan.bold(`\n🔍 搜索: "${query}"\n`));

  const result = await registry.search(query);

  if (result.skills.length === 0) {
    console.log(chalk.yellow('未找到匹配的技能'));
    return;
  }

  console.log(`找到 ${result.total} 个技能\n`);

  for (const skill of result.skills) {
    console.log(formatSkillLine(skill));
  }

  console.log();
}

/**
 * 显示热门技能
 */
export async function showPopular(limit: number = 10): Promise<void> {
  const registry = getSkillRegistry();

  console.log(chalk.cyan.bold(`\n🔥 热门技能\n`));

  const skills = await registry.getPopular(limit);

  if (skills.length === 0) {
    console.log(chalk.yellow('暂无数据'));
    return;
  }

  for (const skill of skills) {
    console.log(formatSkillLine(skill));
  }

  console.log();
}

/**
 * 显示最新技能
 */
export async function showLatest(limit: number = 10): Promise<void> {
  const registry = getSkillRegistry();

  console.log(chalk.cyan.bold(`\n✨ 最新技能\n`));

  const skills = await registry.getLatest(limit);

  if (skills.length === 0) {
    console.log(chalk.yellow('暂无数据'));
    return;
  }

  for (const skill of skills) {
    console.log(formatSkillLine(skill));
  }

  console.log();
}

/**
 * 显示技能详情
 */
export async function showRemoteSkill(skillId: string): Promise<void> {
  const registry = getSkillRegistry();

  console.log(chalk.cyan.bold(`\n📋 ${skillId}\n`));

  const skill = await registry.getSkill(skillId);

  if (!skill) {
    console.log(chalk.yellow('技能不存在'));
    return;
  }

  console.log(chalk.white(`名称: ${skill.name}`));
  console.log(chalk.white(`版本: ${skill.version}`));
  console.log(chalk.white(`描述: ${skill.description}`));

  if (skill.author) {
    console.log(chalk.white(`作者: ${skill.author}`));
  }

  if (skill.downloads !== undefined) {
    console.log(chalk.white(`下载: ${skill.downloads}`));
  }

  if (skill.stars !== undefined) {
    console.log(chalk.white(`星标: ${skill.stars}`));
  }

  if (skill.tags?.length) {
    console.log(chalk.white(`标签: ${skill.tags.join(', ')}`));
  }

  console.log();
  console.log(chalk.gray(`安装: securebot skill install ${registry.getDownloadUrl(skillId)}`));
  console.log();
}

/**
 * 从远程安装技能
 */
export async function installFromRegistry(skillId: string, options?: { version?: string; overwrite?: boolean }): Promise<void> {
  const registry = getSkillRegistry();

  console.log(chalk.cyan.bold(`\n📥 从远程安装: ${skillId}\n`));

  const success = await registry.install(skillId, options);

  if (success) {
    console.log(chalk.green(`\n✓ 安装成功\n`));
  } else {
    console.log(chalk.red(`\n✗ 安装失败\n`));
  }
}

// 辅助函数
function formatSkillLine(skill: RemoteSkill): string {
  const name = chalk.green(skill.id);
  const version = chalk.gray(`v${skill.version}`);
  const desc = skill.description.slice(0, 50) + (skill.description.length > 50 ? '...' : '');
  return `  ${name} ${version} - ${desc}`;
}