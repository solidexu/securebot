/**
 * 技能条件激活
 * 
 * 参考 Hermes Agent 的 is_skill_conditions_allowed 设计
 * 支持 requires_toolsets 和 fallback_for_toolsets 条件
 */

import type { SkillMetadata, SkillActivationConditions } from './types.js';
import { validateToolset } from '../toolsets.js';

// ============ 条件检查 ============

/**
 * 检查技能是否满足激活条件
 * 
 * @param skill - 技能元数据或条件对象
 * @param availableToolsets - 可用工具集
 * @param availableTools - 可用工具（可选）
 * @param context - 上下文信息（可选）
 * @returns - 是否允许激活
 */
export function isSkillConditionsAllowed(
  skill: SkillMetadata | SkillActivationConditions,
  availableToolsets: Set<string>,
  availableTools?: Set<string>,
  context?: {
    platform?: 'macos' | 'linux' | 'windows';
    environment?: 'production' | 'development' | 'testing';
  }
): boolean {
  // 获取条件（兼容两种数据结构）
  const conditions: SkillActivationConditions = extractConditions(skill);
  
  const at = availableTools || new Set<string>();
  const ats = availableToolsets;
  
  // 1. 平台检查
  if (conditions.platforms && conditions.platforms.length > 0) {
    const currentPlatform = context?.platform || detectPlatform();
    if (!conditions.platforms.includes(currentPlatform)) {
      return false;  // 平台不匹配
    }
  }
  
  // 2. 环境检查
  if (conditions.environments && conditions.environments.length > 0) {
    const currentEnv = context?.environment || detectEnvironment();
    if (!conditions.environments.includes(currentEnv)) {
      return false;  // 环境不匹配
    }
  }
  
  // 3. fallback_for: 主工具集可用 → 隐藏 fallback 技能
  const fallbackToolsets = conditions.fallbackFor?.toolsets || [];
  for (const ts of fallbackToolsets) {
    if (ats.has(ts)) {
      return false;  // 主工具集可用，隐藏 fallback
    }
  }
  
  const fallbackTools = conditions.fallbackFor?.tools || [];
  for (const tool of fallbackTools) {
    if (at.has(tool)) {
      return false;  // 主工具可用，隐藏 fallback
    }
  }
  
  // 4. requires: 需要的工具集缺失 → 隐藏技能
  const requiresToolsets = conditions.requires?.toolsets || [];
  for (const ts of requiresToolsets) {
    if (!ats.has(ts)) {
      return false;  // 需要的工具集缺失
    }
  }
  
  const requiresTools = conditions.requires?.tools || [];
  for (const tool of requiresTools) {
    if (!at.has(tool)) {
      return false;  // 需要的工具缺失
    }
  }
  
  return true;  // 所有条件满足
}
/**
 * 从技能对象提取条件
 */
function extractConditions(skill: SkillMetadata | SkillActivationConditions): SkillActivationConditions {
  // 检查是否是 SkillActivationConditions 对象（有条件字段）
  if (
    'requires' in skill || 
    'fallbackFor' in skill || 
    'platforms' in skill || 
    'environments' in skill
  ) {
    return skill as SkillActivationConditions;
  }
  
  // 检查是否是 SkillMetadata（有 conditions 字段）
  if ('conditions' in skill && skill.conditions) {
    return skill.conditions;
  }
  // 无条件
  return {};
}
export function detectPlatform(): 'macos' | 'linux' | 'windows' {
  const platform = process.platform;
  
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux') return 'linux';
  if (platform === 'win32') return 'windows';
  
  // 默认返回 linux
  return 'linux';
}

/**
 * 检测当前环境
 */
export function detectEnvironment(): 'production' | 'development' | 'testing' {
  const env = process.env.NODE_ENV || 'development';
  
  if (env === 'production') return 'production';
  if (env === 'test' || env === 'testing') return 'testing';
  
  return 'development';
}

// ============ 条件解析 ============

/**
 * 从 YAML frontmatter 解析条件
 * 
 * 支持两种格式：
 * 1. Hermes 格式（metadata.hermes）
 * 2. 简化格式（直接在 frontmatter）
 */
export function parseSkillConditions(frontmatter: Record<string, unknown>): SkillActivationConditions {
  const conditions: SkillActivationConditions = {};
  
  // Hermes 格式：metadata.hermes.requires_toolsets
  const metadata = frontmatter.metadata as Record<string, unknown> | undefined;
  const hermes = metadata?.hermes as Record<string, unknown> | undefined;
  
  if (hermes) {
    // requires_toolsets
    const requiresToolsets = hermes.requires_toolsets as string[] | undefined;
    const requiresTools = hermes.requires_tools as string[] | undefined;
    
    if (requiresToolsets || requiresTools) {
      conditions.requires = {
        toolsets: requiresToolsets || [],
        tools: requiresTools || [],
      };
    }
    
    // fallback_for_toolsets
    const fallbackToolsets = hermes.fallback_for_toolsets as string[] | undefined;
    const fallbackTools = hermes.fallback_for_tools as string[] | undefined;
    
    if (fallbackToolsets || fallbackTools) {
      conditions.fallbackFor = {
        toolsets: fallbackToolsets || [],
        tools: fallbackTools || [],
      };
    }
  }
  
  // 简化格式：直接在 frontmatter
  if (frontmatter.requires_toolsets || frontmatter.requires_tools) {
    conditions.requires = {
      toolsets: (frontmatter.requires_toolsets as string[]) || [],
      tools: (frontmatter.requires_tools as string[]) || [],
    };
  }
  
  if (frontmatter.fallback_for_toolsets || frontmatter.fallback_for_tools) {
    conditions.fallbackFor = {
      toolsets: (frontmatter.fallback_for_toolsets as string[]) || [],
      tools: (frontmatter.fallback_for_tools as string[]) || [],
    };
  }
  
  // platforms
  if (frontmatter.platforms) {
    conditions.platforms = frontmatter.platforms as ('macos' | 'linux' | 'windows')[];
  }
  
  // environments
  if (frontmatter.environments) {
    conditions.environments = frontmatter.environments as ('production' | 'development' | 'testing')[];
  }
  
  return conditions;
}

// ============ 条件验证 ============

/**
 * 验证技能的条件配置
 * 
 * @returns - 验证结果和警告
 */
export function validateSkillConditions(conditions: SkillActivationConditions): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // 验证 requires_toolsets
  if (conditions.requires?.toolsets) {
    for (const ts of conditions.requires.toolsets) {
      if (!validateToolset(ts)) {
        errors.push(`Unknown toolset in requires: ${ts}`);
      }
    }
  }
  
  // 验证 fallback_for_toolsets
  if (conditions.fallbackFor?.toolsets) {
    for (const ts of conditions.fallbackFor.toolsets) {
      if (!validateToolset(ts)) {
        errors.push(`Unknown toolset in fallbackFor: ${ts}`);
      }
    }
    
    // 检查是否同时有 requires 和 fallbackFor（逻辑冲突）
    if (conditions.requires?.toolsets && conditions.requires.toolsets.length > 0) {
      warnings.push('Skill has both requires and fallbackFor - this may cause unexpected behavior');
    }
  }
  
  // 验证 platforms
  if (conditions.platforms) {
    const validPlatforms = ['macos', 'linux', 'windows'];
    for (const p of conditions.platforms) {
      if (!validPlatforms.includes(p)) {
        errors.push(`Unknown platform: ${p}`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
