/**
 * 技能管理命令
 * 
 * 纯 Markdown 格式技能管理
 */

import * as p from '@clack/prompts';
import chalk from 'chalk';
import { getSkillManager } from '../../core/skills.js';
import { loadConfig, saveConfig } from '../../core/config.js';
import type { AgentConfig } from '../../core/types.js';

// ============ 列出技能 ============

export async function listSkills(options?: { public?: boolean; private?: boolean; agent?: string }): Promise<void> {
  const skillManager = getSkillManager();
  await skillManager.initialize();

  console.log(chalk.cyan.bold('\n📚 技能列表\n'));

  if (!options?.private) {
    const publicSkills = await skillManager.listPublicSkills();
    if (publicSkills.length > 0) {
      console.log(chalk.green('公共技能 (所有 Agent 可用):'));
      for (const skill of publicSkills) {
        console.log(`  ${chalk.white(skill.id)} - ${skill.name}`);
        if (skill.overview) {
          console.log(chalk.gray(`    ${skill.overview.slice(0, 60)}...`));
        }
      }
      console.log();
    }
  }

  if (!options?.public) {
    const privateSkills = await skillManager.listPrivateSkills(options?.agent);
    if (privateSkills.length > 0) {
      console.log(chalk.yellow('个人技能 (仅特定 Agent 可用):'));
      for (const skill of privateSkills) {
        const agentInfo = skill.agentId ? ` [${skill.agentId}]` : '';
        console.log(`  ${chalk.white(skill.id)} - ${skill.name}${agentInfo}`);
        if (skill.overview) {
          console.log(chalk.gray(`    ${skill.overview.slice(0, 60)}...`));
        }
      }
      console.log();
    }
  }

  if (options?.agent) {
    const config = loadConfig();
    const agentConfig = config.agents.find((a: AgentConfig) => a.id === options.agent);
    if (agentConfig?.skills && agentConfig.skills.length > 0) {
      console.log(chalk.cyan(`Agent "${options.agent}" 已分配的技能:`));
      for (const skillId of agentConfig.skills) {
        console.log(`  - ${skillId}`);
      }
    }
  }
}

// ============ 创建技能 ============

export async function createSkillInteractive(options?: { agent?: string }): Promise<void> {
  const skillManager = getSkillManager();
  await skillManager.initialize();

  const preselectedAgent = options?.agent;

  console.log(chalk.cyan.bold('\n✨ 创建新技能\n'));

  const skillType = preselectedAgent ? 'private' : await p.select({
    message: '技能类型',
    options: [
      { value: 'public', label: '公共技能', hint: '所有 Agent 可用' },
      { value: 'private', label: '个人技能', hint: '仅特定 Agent 可用' },
    ],
  });

  if (p.isCancel(skillType)) {
    console.log(chalk.gray('已取消'));
    return;
  }

  let agentId: string | undefined = preselectedAgent;
  if (skillType === 'private' && !preselectedAgent) {
    const config = loadConfig();
    const agentOptions = config.agents.map((a: AgentConfig) => ({ value: a.id, label: a.name }));
    
    const selectedAgent = await p.select({
      message: '选择 Agent',
      options: agentOptions,
    });

    if (p.isCancel(selectedAgent)) {
      console.log(chalk.gray('已取消'));
      return;
    }
    agentId = selectedAgent as string;
  }

  const id = await p.text({
    message: '技能 ID（仅字母、数字、连字符）',
    placeholder: 'my-skill',
    validate: (value) => {
      if (!value) return '请输入技能 ID';
      if (!/^[a-z0-9-]+$/i.test(value)) return '只能包含字母、数字、连字符';
      return undefined;
    },
  });

  if (p.isCancel(id)) {
    console.log(chalk.gray('已取消'));
    return;
  }

  const name = await p.text({
    message: '技能名称',
    placeholder: '我的技能',
    validate: (value) => {
      if (!value) return '请输入名称';
      return undefined;
    },
  });

  if (p.isCancel(name)) {
    console.log(chalk.gray('已取消'));
    return;
  }

  const overview = await p.text({
    message: '技能概述',
    placeholder: '这个技能可以帮助...',
  });

  if (p.isCancel(overview)) {
    console.log(chalk.gray('已取消'));
    return;
  }

  const keywordsStr = await p.text({
    message: '触发关键词（逗号分隔）',
    placeholder: '关键词1, 关键词2',
  });

  if (p.isCancel(keywordsStr)) {
    console.log(chalk.gray('已取消'));
    return;
  }

  const keywords = keywordsStr?.split(',').map(k => k.trim()).filter(Boolean);

  console.log();
  console.log(chalk.cyan('━━━ 技能预览 ━━━'));
  console.log(chalk.white(`  ID:          ${id}`));
  console.log(chalk.white(`  名称:        ${name}`));
  console.log(chalk.white(`  概述:        ${overview}`));
  console.log(chalk.white(`  类型:        ${skillType === 'public' ? '公共' : `个人 [${agentId}]`}`));
  console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━'));
  console.log();

  const confirmed = await p.confirm({
    message: '确认创建？',
    initialValue: true,
  });

  if (!confirmed) {
    console.log(chalk.gray('已取消'));
    return;
  }

  try {
    await skillManager.createSkill({
      id: id as string,
      name: name as string,
      overview: overview ?? '',
      keywords,
    }, skillType === 'public', skillType === 'private' ? agentId : undefined);

    console.log(chalk.green(`\n✓ 技能 "${name}" 创建成功！\n`));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`创建失败: ${msg}`));
  }
}

// ============ 删除技能 ============

export async function deleteSkillInteractive(skillId?: string): Promise<void> {
  const skillManager = getSkillManager();
  await skillManager.initialize();

  if (!skillId) {
    const publicSkills = await skillManager.listPublicSkills();
    const privateSkills = await skillManager.listPrivateSkills();

    const options = [
      ...publicSkills.map(s => ({ value: `public:${s.id}`, label: `[公共] ${s.name}` })),
      ...privateSkills.map(s => ({ value: `private:${s.id}`, label: `[个人] ${s.name}` })),
    ];

    if (options.length === 0) {
      console.log(chalk.yellow('暂无技能可删除'));
      return;
    }

    const selected = await p.select({
      message: '选择要删除的技能',
      options,
    });

    if (p.isCancel(selected)) {
      console.log(chalk.gray('已取消'));
      return;
    }

    const parts = (selected as string).split(':');
    const type = parts[0];
    const id = parts[1];
    if (id) {
      await deleteSkillById(id, type === 'public');
    }
  } else {
    const skill = await skillManager.loadSkill(skillId);
    
    if (!skill) {
      console.log(chalk.red(`技能不存在: ${skillId}`));
      return;
    }

    await deleteSkillById(skillId, skill.category === 'public');
  }
}

async function deleteSkillById(skillId: string, isPublic: boolean): Promise<void> {
  const skillManager = getSkillManager();

  const confirmed = await p.confirm({
    message: `确认删除技能 "${skillId}"？`,
    initialValue: false,
  });

  if (!confirmed) {
    console.log(chalk.gray('已取消'));
    return;
  }

  const deleted = await skillManager.deleteSkill(skillId, isPublic);
  if (deleted) {
    console.log(chalk.green(`✓ 技能 "${skillId}" 已删除`));
  } else {
    console.log(chalk.red(`删除失败: 技能不存在`));
  }
}

// ============ 分配技能给 Agent ============

export async function assignSkillToAgent(skillId: string, agentId: string): Promise<void> {
  const skillManager = getSkillManager();
  await skillManager.initialize();

  const skill = await skillManager.loadSkill(skillId);

  if (!skill) {
    console.log(chalk.red(`技能不存在: ${skillId}`));
    return;
  }

  const config = loadConfig();
  const agentConfig = config.agents.find((a: AgentConfig) => a.id === agentId);

  if (!agentConfig) {
    console.log(chalk.red(`Agent 不存在: ${agentId}`));
    return;
  }

  if (!agentConfig.skills) {
    agentConfig.skills = [];
  }

  if (agentConfig.skills.includes(skillId)) {
    console.log(chalk.yellow(`Agent "${agentId}" 已拥有技能 "${skillId}"`));
    return;
  }

  agentConfig.skills.push(skillId);
  saveConfig(config);

  console.log(chalk.green(`✓ 已将技能 "${skill.name}" 分配给 Agent "${agentConfig.name}"`));
}

// ============ 从 Agent 移除技能 ============

export async function removeSkillFromAgent(skillId: string, agentId: string): Promise<void> {
  const config = loadConfig();
  const agentConfig = config.agents.find((a: AgentConfig) => a.id === agentId);

  if (!agentConfig) {
    console.log(chalk.red(`Agent 不存在: ${agentId}`));
    return;
  }

  if (!agentConfig.skills?.includes(skillId)) {
    console.log(chalk.yellow(`Agent "${agentId}" 没有技能 "${skillId}"`));
    return;
  }

  agentConfig.skills = agentConfig.skills.filter(s => s !== skillId);
  saveConfig(config);

  console.log(chalk.green(`✓ 已从 Agent "${agentConfig.name}" 移除技能 "${skillId}"`));
}