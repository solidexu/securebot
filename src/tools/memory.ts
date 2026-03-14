/**
 * 记忆工具
 * 
 * 为 Agent 提供记忆操作能力
 */

import type { Tool, ToolContext, ToolResult } from '../core/types.js';
import { getMemoryManager } from '../core/memory.js';

// ============ 记忆存储工具 ============

export const rememberTool: Tool = {
  name: 'remember',
  description: '存储重要信息到记忆中。用于记录用户偏好、关键事实、任务进度等。',
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
      importance: {
        type: 'number',
        description: '重要性 (1-5，5 最重要)',
      },
      tags: {
        type: 'array',
        description: '标签，便于检索',
      },
    },
    required: ['content'],
  },

  async execute(params, context: ToolContext): Promise<ToolResult> {
    const { content, type = 'knowledge', importance = 3, tags } = params as {
      content: string;
      type?: 'knowledge' | 'preference' | 'task' | 'event';
      importance?: number;
      tags?: string[];
    };

    try {
      const memoryManager = getMemoryManager();
      await memoryManager.initialize();
      
      await memoryManager.remember(
        context.agent.id,
        content,
        type,
        importance,
        tags
      );

      return {
        success: true,
        content: `已记住: ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`,
        metadata: { type, importance, tags },
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

// ============ 用户信息工具 ============

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

      const content = `## 记忆系统状态

- 每日记忆数: ${stats.dailyMemoryCount}
- 总记忆条目: ${stats.totalEntries}
- Agent 档案: ${stats.agentCount}
- 用户信息: ${Object.keys(profile?.keyInfo ?? {}).length} 条

### 使用方式
- \`remember\` - 存储重要信息
- \`recall\` - 搜索记忆
- \`set_user_info\` - 设置用户信息
- \`get_user_info\` - 获取用户信息`;

      return {
        success: true,
        content,
        metadata: stats,
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
  setUserInfoTool,
  getUserInfoTool,
  memoryStatsTool,
];