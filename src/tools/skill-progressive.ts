/**
 * 技能工具 - Progressive Disclosure 版本
 * 
 * 参考 Hermes Agent 的渐进式披露架构：
 * - skills_list(): 只返回元数据（节省 token）
 * - skill_view(): 按需加载完整内容
 */

import type { Tool, ToolContext, ToolResult } from '../core/types.js';
import { getSkillLoader } from '../core/skills/loader.js';
import {
  formatSkillsListOutput,
  formatSkillViewOutput,
  formatSkillForList,
  type SkillListEntry,
} from '../core/skills/progressive-disclosure.js';
import { inferTrustLevel } from '../core/skills/progressive-disclosure.js';

// ============ 列出技能工具（Progressive Disclosure Tier 1） ============

export const skillsListTool: Tool = {
  name: 'skills_list',
  description: '列出可用技能（轻量级）。只显示技能元数据，不加载完整内容，节省 token。',
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['public', 'private', 'all'],
        description: '筛选类别：public（公共）、private（个人）、all（全部）',
      },
      trustLevel: {
        type: 'string',
        enum: ['builtin', 'trusted', 'community', 'user'],
        description: '筛选信任等级',
      },
    },
  },

  async execute(params, context: ToolContext): Promise<ToolResult> {
    const { category = 'all', trustLevel } = params as {
      category?: 'public' | 'private' | 'all';
      trustLevel?: 'builtin' | 'trusted' | 'community' | 'user';
    };

    try {
      const loader = getSkillLoader();
      
      // 获取所有缓存的元数据（不加载完整内容）
      const allMetadata = loader.getAllCachedMetadata();
      
      // 过滤
      let filtered = allMetadata;
      
      if (category !== 'all') {
        filtered = filtered.filter(m => m.category === category);
      }
      
      if (trustLevel) {
        filtered = filtered.filter(m => {
          const inferred = inferTrustLevel(m.skillFile, m.category);
          return inferred === trustLevel;
        });
      }
      
      // Progressive Disclosure: 只返回元数据
      const entries: SkillListEntry[] = filtered.map(m => formatSkillForList({
        id: m.id,
        name: m.name,
        description: m.description,
        skillFile: m.skillFile,
        category: m.category,
      }));
      
      // 格式化输出
      const content = formatSkillsListOutput(entries);
      
      return {
        success: true,
        content,
        metadata: {
          count: entries.length,
          filteredBy: { category, trustLevel },
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `列出技能失败: ${message}`,
      };
    }
  },
};

// ============ 查看技能工具（Progressive Disclosure Tier 2） ============

export const skillViewTool: Tool = {
  name: 'skill_view',
  description: '查看技能完整内容（按需加载）。用于了解技能的详细工作流程、最佳实践等。',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: '技能 ID',
      },
      filePath: {
        type: 'string',
        description: '引用文件路径（可选），如 "references/api.md"',
      },
    },
    required: ['id'],
  },

  async execute(params, context: ToolContext): Promise<ToolResult> {
    const { id, filePath } = params as {
      id: string;
      filePath?: string;
    };

    try {
      const loader = getSkillLoader();
      
      // Tier 2: 加载完整内容
      const skill = await loader.loadSkillContent(id);
      
      if (!skill) {
        return {
          success: false,
          error: `技能 "${id}" 不存在。使用 skills_list 查看可用技能。`,
        };
      }
      
      // 如果指定了引用文件，加载文件内容（Tier 3）
      if (filePath) {
        const { readFileSync, existsSync, join } = await import('node:fs');
        const fullPath = join(skill.skillDir, filePath);
        
        if (!existsSync(fullPath)) {
          return {
            success: false,
            error: `文件 "${filePath}" 不存在于技能 "${id}" 中。`,
            metadata: { skillId: id, requestedFile: filePath },
          };
        }
        
        const fileContent = readFileSync(fullPath, 'utf-8');
        
        return {
          success: true,
          content: `## ${skill.name} - ${filePath}\n\n${fileContent}`,
          metadata: { skillId: id, file: filePath },
        };
      }
      
      // 返回完整技能内容
      const content = formatSkillViewOutput({
        id: skill.id,
        name: skill.name,
        overview: skill.overview,
        whenToUse: skill.whenToUse,
        workflow: skill.workflow,
        bestPractices: skill.bestPractices,
        examples: skill.examples,
      });
      
      return {
        success: true,
        content,
        metadata: { skillId: id, loaded: true },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `查看技能失败: ${message}`,
      };
    }
  },
};

// ============ 导出 ============

export const progressiveSkillTools = [
  skillsListTool,
  skillViewTool,
];
