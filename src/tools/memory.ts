/**
 * 记忆工具
 * 
 * 为 Agent 提供记忆操作能力
 */

import type { Tool, ToolContext, ToolResult } from '../core/types.js';
import { getMemoryManager, type MemoryFact } from '../core/memory.js';
import { shouldRecordContent, inferCategory, inferConfidence, FACT_CATEGORIES } from '../core/memory-template.js';

// ============ 记忆存储工具 ============

export const rememberTool: Tool = {
  name: 'remember',
  description: '存储重要信息到记忆中。用于记录用户偏好、关键事实、任务进度等。重要性会自动评估。',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: '要记住的内容',
      },
      type: {
        type: 'string',
        description: '记忆类型: knowledge, preference, task, event',
      },
      tags: {
        type: 'string',
        description: '标签，用逗号分隔',
      },
    },
    required: ['content'],
  },

  async execute(params, context: ToolContext): Promise<ToolResult> {
    const { content, type = 'knowledge', tags } = params as {
      content: string;
      type?: 'knowledge' | 'preference' | 'task' | 'event';
      tags?: string;
    };

    try {
      const memoryManager = getMemoryManager();
      await memoryManager.initialize();
      
      // 解析标签
      const tagList = tags?.split(',').map(t => t.trim()).filter(Boolean);
      
      // 记忆重要性由系统自动评估
      await memoryManager.remember(
        context.agent.id,
        content,
        type,
        undefined, // 让系统自动评估
        tagList
      );

      return {
        success: true,
        content: `已记住: ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`,
        metadata: { type, tags: tagList },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `记忆存储失败: ${message}`,
      };
    }
  },
};

// ============ 记忆搜索工具 ============

export const recallTool: Tool = {
  name: 'recall',
  description: '搜索记忆中存储的信息。用于查找用户偏好、历史任务、关键事实等。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词',
      },
      type: {
        type: 'string',
        enum: ['knowledge', 'preference', 'task', 'event', 'conversation'],
        description: '限定记忆类型',
      },
      days: {
        type: 'number',
        description: '搜索最近 N 天的记忆',
      },
    },
    required: ['query'],
  },

  async execute(params, context: ToolContext): Promise<ToolResult> {
    const { query, type, days } = params as {
      query: string;
      type?: 'knowledge' | 'preference' | 'task' | 'event' | 'conversation';
      days?: number;
    };

    try {
      const memoryManager = getMemoryManager();
      await memoryManager.initialize();
      
      const entries = await memoryManager.search(query, {
        agentId: context.agent.id,
        type,
        days,
      });

      if (entries.length === 0) {
        return {
          success: true,
          content: '未找到相关记忆。',
        };
      }

      const content = entries
        .slice(0, 10)
        .map((e, i) => {
          const date = new Date(e.timestamp).toLocaleDateString('zh-CN');
          return `${i + 1}. [${date}] ${e.content}`;
        })
        .join('\n');

      return {
        success: true,
        content: `找到 ${entries.length} 条相关记忆:\n${content}`,
        metadata: { count: entries.length, query },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `记忆搜索失败: ${message}`,
      };
    }
  },
};

// ============ P0: 事实管理工具 ============

export const addFactTool: Tool = {
  name: 'add_fact',
  description: `添加一条结构化事实到用户档案。

分类说明:
- preference: 用户偏好（工具、风格、语言）
- knowledge: 知识技能（专业领域、经验）
- context: 背景信息（工作、项目、环境）
- behavior: 行为模式（工作习惯、沟通风格）
- goal: 目标计划（学习目标、职业规划）

置信度指南:
- 0.9+: 明确陈述的事实
- 0.7-0.8: 从行为推断
- 0.5-0.6: 模糊推断（谨慎使用）`,
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: '事实内容（应包含具体细节，如技术名称、版本号等）',
      },
      category: {
        type: 'string',
        enum: ['preference', 'knowledge', 'context', 'behavior', 'goal'],
        description: '事实分类（不填则自动推断）',
      },
      confidence: {
        type: 'number',
        description: '置信度 (0-1)，不填则自动推断',
      },
    },
    required: ['content'],
  },

  async execute(params, context: ToolContext): Promise<ToolResult> {
    const { content, category, confidence } = params as {
      content: string;
      category?: MemoryFact['category'];
      confidence?: number;
    };

    if (!content || content.trim().length < 3) {
      return {
        success: false,
        error: '内容太短，无法记录',
      };
    }

    const check = shouldRecordContent(content);
    if (!check.should) {
      return {
        success: false,
        error: `不建议记录: ${check.reason}`,
      };
    }

    const finalCategory = category || inferCategory(content);
    const finalConfidence = confidence ?? inferConfidence(content);

    try {
      const memoryManager = getMemoryManager();
      await memoryManager.initialize();
      
      const fact = await memoryManager.addFact(
        content,
        finalCategory,
        finalConfidence,
        context.session?.sessionKey || context.agent.id
      );

      const categoryInfo = FACT_CATEGORIES[finalCategory];
      return {
        success: true,
        content: `已记录 [${categoryInfo?.name || finalCategory} | ${(finalConfidence * 100).toFixed(0)}%]: ${content}`,
        metadata: { factId: fact.id, category: finalCategory, confidence: finalConfidence },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `添加事实失败: ${message}`,
      };
    }
  },
};

export const getFactsTool: Tool = {
  name: 'get_facts',
  description: '获取用户的事实列表，按置信度排序。',
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['preference', 'knowledge', 'context', 'behavior', 'goal'],
        description: '筛选分类（可选）',
      },
      limit: {
        type: 'number',
        description: '返回数量限制，默认10',
      },
    },
  },

  async execute(params): Promise<ToolResult> {
    const { category, limit = 10 } = params as {
      category?: MemoryFact['category'];
      limit?: number;
    };

    try {
      const memoryManager = getMemoryManager();
      await memoryManager.initialize();
      
      const facts = memoryManager.getFacts({ category, limit });

      if (facts.length === 0) {
        return {
          success: true,
          content: '暂无事实记录。',
        };
      }

      const content = facts
        .map((f, i) => `${i + 1}. [${f.category} | ${(f.confidence * 100).toFixed(0)}%] ${f.content}`)
        .join('\n');

      return {
        success: true,
        content: `### 用户事实 (${facts.length}条)\n${content}`,
        metadata: { count: facts.length },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `获取事实失败: ${message}`,
      };
    }
  },
};

export const deleteFactTool: Tool = {
  name: 'delete_fact',
  description: '删除指定ID的事实。',
  parameters: {
    type: 'object',
    properties: {
      fact_id: {
        type: 'string',
        description: '要删除的事实ID',
      },
    },
    required: ['fact_id'],
  },

  async execute(params): Promise<ToolResult> {
    const { fact_id } = params as { fact_id: string };

    try {
      const memoryManager = getMemoryManager();
      await memoryManager.initialize();
      
      const deleted = await memoryManager.deleteFact(fact_id);

      if (deleted) {
        return {
          success: true,
          content: `已删除事实: ${fact_id}`,
        };
      } else {
        return {
          success: false,
          error: `未找到事实: ${fact_id}`,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `删除事实失败: ${message}`,
      };
    }
  },
};

export const setUserInfoTool: Tool = {
  name: 'set_user_info',
  description: '设置用户的关键信息，如偏好、习惯、重要事项等。',
  parameters: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: '信息键名',
      },
      value: {
        type: 'string',
        description: '信息值',
      },
    },
    required: ['key', 'value'],
  },

  async execute(params): Promise<ToolResult> {
    const { key, value } = params as { key: string; value: string };

    try {
      const memoryManager = getMemoryManager();
      await memoryManager.initialize();
      
      await memoryManager.rememberKeyInfo(key, value);

      return {
        success: true,
        content: `已记录用户信息: ${key} = ${value}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `设置用户信息失败: ${message}`,
      };
    }
  },
};

export const getUserInfoTool: Tool = {
  name: 'get_user_info',
  description: '获取用户的关键信息。',
  parameters: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: '信息键名（不填则返回所有）',
      },
    },
  },

  async execute(params): Promise<ToolResult> {
    const { key } = params as { key?: string };

    try {
      const memoryManager = getMemoryManager();
      await memoryManager.initialize();
      
      const profile = memoryManager.getUserProfile();
      
      if (!profile) {
        return {
          success: true,
          content: '暂无用户信息。',
        };
      }

      if (key) {
        const value = profile.keyInfo[key];
        if (value) {
          return {
            success: true,
            content: `${key}: ${value}`,
          };
        } else {
          return {
            success: true,
            content: `未找到 ${key} 的信息。`,
          };
        }
      }

      // 返回所有信息
      const entries = Object.entries(profile.keyInfo);
      if (entries.length === 0) {
        return {
          success: true,
          content: '暂无用户信息记录。',
        };
      }

      const content = entries
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n');

      return {
        success: true,
        content: `### 用户信息\n${content}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `获取用户信息失败: ${message}`,
      };
    }
  },
};

// ============ 记忆状态工具 ============

export const memoryStatsTool: Tool = {
  name: 'memory_stats',
  description: '查看记忆系统状态。',
  parameters: {
    type: 'object',
    properties: {},
  },

  async execute(): Promise<ToolResult> {
    try {
      const memoryManager = getMemoryManager();
      await memoryManager.initialize();
      
      const stats = memoryManager.getStats();
      const profile = memoryManager.getUserProfile();
      const facts = memoryManager.getFacts();

      const content = `## 记忆系统状态

- 每日记忆数: ${stats.dailyMemoryCount}
- 总记忆条目: ${stats.totalEntries}
- Agent 档案: ${stats.agentCount}
- 用户信息: ${Object.keys(profile?.keyInfo ?? {}).length} 条
- 结构化事实: ${facts.length} 条

### 使用方式
- \`remember\` - 存储重要信息
- \`recall\` - 搜索记忆
- \`add_fact\` - 添加结构化事实（支持分类和置信度）
- \`get_facts\` - 获取事实列表
- \`set_user_info\` - 设置用户信息
- \`get_user_info\` - 获取用户信息`;

      return {
        success: true,
        content,
        metadata: { ...stats, factsCount: facts.length },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `获取记忆状态失败: ${message}`,
      };
    }
  },
};

// ============ 导出 ============

export const memoryTools = [
  rememberTool,
  recallTool,
  addFactTool,
  getFactsTool,
  deleteFactTool,
  setUserInfoTool,
  getUserInfoTool,
  memoryStatsTool,
];