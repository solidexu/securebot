/**
 * Progressive Disclosure 工具函数
 * 
 * 参考 Hermes Agent 的渐进式披露架构：
 * - Tier 1: skills_list() - 只返回元数据（节省 token）
 * - Tier 2: skill_view() - 按需加载完整内容
 * - Tier 3: skill_view(file) - 加载引用文件
 */

// ============ 常量配置 ============

/** 描述最大长度（用于 skills_list） */
export const MAX_DESCRIPTION_LENGTH = 80;

/** 名称最大长度 */
export const MAX_NAME_LENGTH = 64;

/** Trust level 定义 */
export type TrustLevel = 'builtin' | 'trusted' | 'community' | 'user';

// ============ 截断工具 ============

/**
 * 截断描述到指定长度
 * 
 * 用于 skills_list() 输出，减少 token 消耗
 */
export function truncateDescription(description: string, maxLen: number = MAX_DESCRIPTION_LENGTH): string {
  if (!description) return '';
  
  const trimmed = description.trim();
  if (trimmed.length <= maxLen) return trimmed;
  
  return trimmed.slice(0, maxLen - 3) + '...';
}

/**
 * 截断名称到指定长度
 */
export function truncateName(name: string, maxLen: number = MAX_NAME_LENGTH): string {
  if (!name) return '';
  
  const trimmed = name.trim();
  if (trimmed.length <= maxLen) return trimmed;
  
  return trimmed.slice(0, maxLen - 3) + '...';
}

// ============ Trust Level 推断 ============

/**
 * 推断技能的信任等级
 * 
 * 基于来源目录判断：
 * - builtin: 项目内置技能（代码库中的 skills/public/）
 * - trusted: ClawHub 官方技能
 * - community: 用户安装的社区技能
 * - user: 用户自己创建的技能
 */
export function inferTrustLevel(
  skillFile: string,
  category: 'public' | 'private'
): TrustLevel {
  // 个人技能 → user
  if (category === 'private') return 'user';
  
  // 检查是否在项目内置目录
  if (skillFile.includes('/skills/public/') && !skillFile.includes('.securebot')) {
    return 'builtin';
  }
  
  // 检查是否在用户目录
  if (skillFile.includes('.securebot')) {
    // ClawHub 安装的技能有特殊标记（暂未实现）
    // 目前默认为 community
    return 'community';
  }
  
  return 'builtin';
}

// ============ 元数据格式化 ============

/**
 * 格式化技能元数据用于 skills_list 输出
 * 
 * Progressive Disclosure Tier 1
 * 只返回最小信息，节省 token
 */
export interface SkillListEntry {
  id: string;
  name: string;
  description: string;  // 已截断
  trustLevel: TrustLevel;
  category: 'public' | 'private';
}

/**
 * 格式化元数据为列表条目
 */
export function formatSkillForList(metadata: {
  id: string;
  name: string;
  description?: string;
  skillFile: string;
  category: 'public' | 'private';
}): SkillListEntry {
  return {
    id: metadata.id,
    name: truncateName(metadata.name),
    description: truncateDescription(metadata.description || ''),
    trustLevel: inferTrustLevel(metadata.skillFile, metadata.category),
    category: metadata.category,
  };
}

/**
 * 格式化技能列表输出
 */
export function formatSkillsListOutput(entries: SkillListEntry[]): string {
  if (entries.length === 0) {
    return '当前没有可用技能。\n\n使用 create_skill 创建新技能。';
  }
  
  const lines: string[] = ['## 可用技能', '', `共 ${entries.length} 个技能：`, ''];
  
  // 按信任等级分组
  const builtin = entries.filter(e => e.trustLevel === 'builtin');
  const community = entries.filter(e => e.trustLevel === 'community');
  const user = entries.filter(e => e.trustLevel === 'user');
  
  if (builtin.length > 0) {
    lines.push('### 内置技能');
    for (const skill of builtin) {
      lines.push(`- **${skill.id}**: ${skill.name}`);
      if (skill.description) {
        lines.push(`  ${skill.description}`);
      }
    }
    lines.push('');
  }
  
  if (community.length > 0) {
    lines.push('### 社区技能');
    for (const skill of community) {
      lines.push(`- **${skill.id}**: ${skill.name}`);
      if (skill.description) {
        lines.push(`  ${skill.description}`);
      }
    }
    lines.push('');
  }
  
  if (user.length > 0) {
    lines.push('### 个人技能');
    for (const skill of user) {
      lines.push(`- **${skill.id}**: ${skill.name}`);
      if (skill.description) {
        lines.push(`  ${skill.description}`);
      }
    }
    lines.push('');
  }
  
  lines.push('---');
  lines.push('提示: 使用 `skill_view(id)` 查看技能完整内容。');
  
  return lines.join('\n');
}

// ============ 完整内容格式化 ============

/**
 * 格式化技能完整内容用于 skill_view 输出
 * 
 * Progressive Disclosure Tier 2
 */
export function formatSkillViewOutput(skill: {
  id: string;
  name: string;
  overview?: string;
  whenToUse?: string[];
  workflow?: Array<{ name: string; description: string; tools?: string[] }>;
  bestPractices?: string[];
  examples?: Array<{ title: string; user: string; assistant: string }>;
}): string {
  const lines: string[] = [`## ${skill.name}`, '', `**ID**: ${skill.id}`, ''];
  
  if (skill.overview) {
    lines.push('### 概述');
    lines.push(skill.overview);
    lines.push('');
  }
  
  if (skill.whenToUse?.length) {
    lines.push('### 适用场景');
    for (const scenario of skill.whenToUse) {
      lines.push(`- ${scenario}`);
    }
    lines.push('');
  }
  
  if (skill.workflow?.length) {
    lines.push('### 工作流程');
    for (let i = 0; i < skill.workflow.length; i++) {
      const step = skill.workflow[i];
      lines.push(`${i + 1}. **${step.name}**`);
      lines.push(`   ${step.description}`);
      if (step.tools?.length) {
        lines.push(`   工具: ${step.tools.join(', ')}`);
      }
    }
    lines.push('');
  }
  
  if (skill.bestPractices?.length) {
    lines.push('### 最佳实践');
    for (const practice of skill.bestPractices) {
      lines.push(`- ${practice}`);
    }
    lines.push('');
  }
  
  if (skill.examples?.length) {
    lines.push('### 示例');
    for (const example of skill.examples) {
      lines.push(`**${example.title}**`);
      lines.push(`用户: ${example.user}`);
      lines.push(`助手: ${example.assistant}`);
      lines.push('');
    }
  }
  
  return lines.join('\n');
}
