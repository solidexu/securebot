/**
 * 技能工具
 * 
 * 为 Agent 提供技能创建和管理能力
 */

import type { Tool, ToolContext, ToolResult } from '../core/types.js';
import { getSkillManager } from '../core/skills.js';

// ============ 创建技能工具 ============

export const createSkillTool: Tool = {
  name: 'create_skill',
  description: '创建一个新技能。用于总结最佳实践、固化工作流程、创建专用助手等。创建后的技能可以被智能唤醒。',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: '技能 ID（仅字母、数字、连字符）',
      },
      name: {
        type: 'string',
        description: '技能名称',
      },
      overview: {
        type: 'string',
        description: '技能概述（用于智能匹配，请描述清楚技能的用途）',
      },
      keywords: {
        type: 'string',
        description: '触发关键词，用逗号分隔（用于快速匹配）',
      },
    },
    required: ['id', 'name', 'overview'],
  },

  async execute(params, context: ToolContext): Promise<ToolResult> {
    const { id, name, overview, keywords } = params as {
      id: string;
      name: string;
      overview: string;
      keywords?: string;
    };

    try {
      const skillManager = getSkillManager();
      await skillManager.initialize();

      const existing = await skillManager.loadSkill(id);
      if (existing) {
        return {
          success: false,
          error: `技能 "${id}" 已存在`,
        };
      }

      const keywordList = keywords
        ?.split(',')
        .map(k => k.trim())
        .filter(Boolean);

      await skillManager.createSkill({
        id,
        name,
        overview,
        keywords: keywordList,
      }, false, context.agent.id);

      return {
        success: true,
        content: `✓ 技能 "${name}" 已创建

**ID**: ${id}
**概述**: ${overview}
${keywordList?.length ? `**关键词**: ${keywordList.join(', ')}` : ''}

用户下次提到相关内容时，会自动唤醒此技能。`,
        metadata: { skillId: id },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `创建技能失败: ${message}`,
      };
    }
  },
};

// ============ 列出技能工具 ============

export const listSkillsTool: Tool = {
  name: 'list_skills',
  description: '列出当前 Agent 可用的所有技能。',
  parameters: {
    type: 'object',
    properties: {},
  },

  async execute(_params, context: ToolContext): Promise<ToolResult> {
    try {
      const skillManager = getSkillManager();
      await skillManager.initialize();

      const publicSkills = await skillManager.listPublicSkills();
      const privateSkills = await skillManager.listPrivateSkills(context.agent.id);

      const lines: string[] = ['## 可用技能', ''];

      if (publicSkills.length > 0) {
        lines.push('### 公共技能');
        for (const skill of publicSkills) {
          lines.push(`- **${skill.id}**: ${skill.name}`);
        }
        lines.push('');
      }

      if (privateSkills.length > 0) {
        lines.push('### 个人技能');
        for (const skill of privateSkills) {
          lines.push(`- **${skill.id}**: ${skill.name}`);
        }
        lines.push('');
      }

      lines.push('提示: 用户提到相关内容时，会自动唤醒对应的技能。');

      return {
        success: true,
        content: lines.join('\n'),
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

// ============ 删除技能工具 ============

export const deleteSkillTool: Tool = {
  name: 'delete_skill',
  description: '删除一个个人技能。只能删除自己创建的技能。',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: '要删除的技能 ID',
      },
    },
    required: ['id'],
  },

  async execute(params, context: ToolContext): Promise<ToolResult> {
    const { id } = params as { id: string };

    try {
      const skillManager = getSkillManager();
      await skillManager.initialize();

      const skill = await skillManager.loadSkill(id);
      
      if (!skill || skill.category !== 'private' || skill.agentId !== context.agent.id) {
        return {
          success: false,
          error: `技能 "${id}" 不存在或不属于此 Agent`,
        };
      }

      const deleted = await skillManager.deleteSkill(id, false, context.agent.id);

      if (deleted) {
        return {
          success: true,
          content: `✓ 技能 "${skill.name}" 已删除`,
        };
      } else {
        return {
          success: false,
          error: '删除失败',
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `删除技能失败: ${message}`,
      };
    }
  },
};

// ============ 导出 ============

export const skillTools = [
  createSkillTool,
  listSkillsTool,
  deleteSkillTool,
];