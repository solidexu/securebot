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
      description: {
        type: 'string',
        description: '技能描述（用于智能匹配，请描述清楚技能的用途）',
      },
      system_prompt: {
        type: 'string',
        description: '技能的系统提示词（定义技能的行为和输出格式）',
      },
      keywords: {
        type: 'string',
        description: '触发关键词，用逗号分隔（用于快速匹配）',
      },
    },
    required: ['id', 'name', 'description', 'system_prompt'],
  },

  async execute(params, context: ToolContext): Promise<ToolResult> {
    const { id, name, description, system_prompt, keywords } = params as {
      id: string;
      name: string;
      description: string;
      system_prompt: string;
      keywords?: string;
    };

    try {
      const skillManager = getSkillManager();
      await skillManager.initialize();

      // 检查技能是否已存在
      const existing = await skillManager.loadSkill(id, false);
      if (existing) {
        return {
          success: false,
          error: `技能 "${id}" 已存在`,
        };
      }

      // 解析关键词
      const keywordList = keywords
        ?.split(',')
        .map(k => k.trim())
        .filter(Boolean);

      // 创建个人技能
      await skillManager.createPrivateSkill(context.agent.id, {
        id,
        name,
        description,
        systemPrompt: system_prompt,
        keywords: keywordList,
      });

      return {
        success: true,
        content: `✓ 技能 "${name}" 已创建

**ID**: ${id}
**描述**: ${description}
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

// ============ 更新技能工具 ============

export const updateSkillTool: Tool = {
  name: 'update_skill',
  description: '更新已存在的技能。可以修改名称、描述、系统提示词或关键词。',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: '要更新的技能 ID',
      },
      name: {
        type: 'string',
        description: '新的技能名称（可选）',
      },
      description: {
        type: 'string',
        description: '新的描述（可选）',
      },
      system_prompt: {
        type: 'string',
        description: '新的系统提示词（可选）',
      },
      keywords: {
        type: 'string',
        description: '新的关键词，用逗号分隔（可选）',
      },
    },
    required: ['id'],
  },

  async execute(params, _context: ToolContext): Promise<ToolResult> {
    const { id, name, description, system_prompt, keywords } = params as {
      id: string;
      name?: string;
      description?: string;
      system_prompt?: string;
      keywords?: string;
    };

    try {
      const skillManager = getSkillManager();
      await skillManager.initialize();

      // 检查技能是否存在
      let skill = await skillManager.loadSkill(id, false);
      let isPublic = false;

      if (!skill) {
        skill = await skillManager.loadSkill(id, true);
        isPublic = true;
      }

      if (!skill) {
        return {
          success: false,
          error: `技能 "${id}" 不存在`,
        };
      }

      // 公共技能检查权限
      if (isPublic) {
        return {
          success: false,
          error: `公共技能不能被 Agent 修改，请使用管理员命令`,
        };
      }

      // 解析关键词
      const keywordList = keywords
        ?.split(',')
        .map(k => k.trim())
        .filter(Boolean);

      // 更新技能
      const updated = await skillManager.updateSkill(id, {
        name,
        description,
        systemPrompt: system_prompt,
        keywords: keywordList,
      });

      if (!updated) {
        return {
          success: false,
          error: '更新失败',
        };
      }

      return {
        success: true,
        content: `✓ 技能 "${updated.name}" 已更新`,
        metadata: { skillId: id },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `更新技能失败: ${message}`,
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
          lines.push(`- **${skill.id}**: ${skill.name} - ${skill.description}`);
        }
        lines.push('');
      }

      if (privateSkills.length > 0) {
        lines.push('### 个人技能');
        for (const skill of privateSkills) {
          lines.push(`- **${skill.id}**: ${skill.name} - ${skill.description}`);
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

  async execute(params, _context: ToolContext): Promise<ToolResult> {
    const { id } = params as { id: string };

    try {
      const skillManager = getSkillManager();
      await skillManager.initialize();

      // 检查是否是个人技能
      const skill = await skillManager.loadSkill(id, false);
      
      if (!skill) {
        return {
          success: false,
          error: `技能 "${id}" 不存在或不属于此 Agent`,
        };
      }

      // 删除技能
      const deleted = await skillManager.deleteSkill(id, false);

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
  updateSkillTool,
  listSkillsTool,
  deleteSkillTool,
];