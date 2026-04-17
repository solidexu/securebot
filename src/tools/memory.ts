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
  description: '搜索记忆。mode=compact 返回 ID+摘要（节省tokens），mode=full 返回完整内容。建议先用 compact 定位，再用 memory_get 获取详情。',
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
      mode: {
        type: 'string',
        enum: ['compact', 'full'],
        description: '返回模式：compact=ID+摘要（推荐），full=完整内容',
      },
      limit: {
        type: 'number',
        description: '返回数量（compact默认10）',
      },
    },
    required: ['query'],
  },

  async execute(params, context: ToolContext): Promise<ToolResult> {
    const { query, type, days, mode = 'compact', limit = 10 } = params as {
      query: string;
      type?: 'knowledge' | 'preference' | 'task' | 'event' | 'conversation';
      days?: number;
      mode?: 'compact' | 'full';
      limit?: number;
    };

    try {
      const memoryManager = getMemoryManager();
      await memoryManager.initialize();
      
      if (mode === 'compact') {
        // 第一层：紧凑搜索
        const results = await memoryManager.searchCompact(query, {
          agentId: context.agent.id,
          type,
          days,
          limit,
        });

        if (results.length === 0) {
          return { success: true, content: '未找到相关记忆。' };
        }

        const lines: string[] = [
          '找到 ' + results.length + ' 条相关记忆（紧凑模式）',
          '提示: 用 memory_get 获取完整内容，用 memory_timeline 查看上下文',
        ];
        
        results.forEach((r, i) => {
          const date = new Date(r.timestamp).toLocaleDateString('zh-CN');
          // Citation 格式: [#id] [date] [type] summary
          lines.push((i + 1) + '. [#' + r.id.slice(0,8) + '] [' + date + '] [' + r.type + '] ' + r.summary);
        });

        return {
          success: true,
          content: lines.join('\n'),
          metadata: { count: results.length, mode: 'compact' },
        };
      } else {
        // full 模式
        const entries = await memoryManager.search(query, {
          agentId: context.agent.id,
          type,
          days,
        });

        if (entries.length === 0) {
          return { success: true, content: '未找到相关记忆。' };
        }

        const lines: string[] = ['找到 ' + entries.length + ' 条相关记忆（完整模式）:'];
        
        entries.slice(0, limit).forEach((e, i) => {
          const date = new Date(e.timestamp).toLocaleDateString('zh-CN');
          lines.push((i + 1) + '. [#' + (e.id?.slice(0,8) || '?') + '] [' + date + '] ' + e.content);
        });

        return {
          success: true,
          content: lines.join('\n'),
          metadata: { count: entries.length, mode: 'full' },
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: '记忆搜索失败: ' + message };
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
        .map((f, i) => `${i + 1}. [${f.id.slice(0, 8)}] [${f.category} | ${(f.confidence * 100).toFixed(0)}%] ${f.content}`)
        .join('\n');

      return {
        success: true,
        content: `### 用户事实 (${facts.length}条)\n${content}\n\n提示: 使用 delete_fact 工具删除时，ID取前8位即可`,
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

export const cleanFactsTool: Tool = {
  name: 'clean_facts',
  description: '清理重复和低置信度的事实。合并相似内容，保留最高置信度版本。',
  parameters: {
    type: 'object',
    properties: {
      min_confidence: {
        type: 'number',
        description: '保留的最低置信度阈值（默认0.7）',
      },
    },
  },

  async execute(params): Promise<ToolResult> {
    const { min_confidence = 0.7 } = params as { min_confidence?: number };

    try {
      const memoryManager = getMemoryManager();
      await memoryManager.initialize();
      
      const facts = memoryManager.getFacts({ limit: 100 });
      if (facts.length === 0) {
        return {
          success: true,
          content: '暂无事实需要清理。',
        };
      }

      const toDelete: string[] = [];
      const keep: MemoryFact[] = [];
      
      for (const fact of facts) {
        const normalized = fact.content.trim().toLowerCase().replace(/\s+/g, '');
        
        let foundSimilar = false;
        for (let i = 0; i < keep.length; i++) {
          const existing = keep[i];
          if (!existing) continue;
          
          const existingNorm = existing.content.trim().toLowerCase().replace(/\s+/g, '');
          
          if (normalized === existingNorm || 
              normalized.includes(existingNorm) || 
              existingNorm.includes(normalized)) {
            foundSimilar = true;
            if (fact.confidence > existing.confidence || 
                (fact.confidence === existing.confidence && fact.content.length > existing.content.length)) {
              toDelete.push(existing.id);
              keep[i] = fact;
            } else {
              toDelete.push(fact.id);
            }
            break;
          }
          
          const keywords1: string[] = normalized.match(/python|c\+\+|java|javascript|go|rust|typescript|开发者|工程师|程序员|全栈|开发/gi) || [];
          const keywords2: string[] = existingNorm.match(/python|c\+\+|java|javascript|go|rust|typescript|开发者|工程师|程序员|全栈|开发/gi) || [];
          const common = keywords1.filter(k => keywords2.some(k2 => k2.toLowerCase() === k.toLowerCase()));
          if (common.length > 0 && keywords1.length > 0 && keywords2.length > 0) {
            const similarity = common.length / Math.max(keywords1.length, keywords2.length);
            if (similarity >= 0.5) {
              foundSimilar = true;
              if (fact.confidence > existing.confidence || 
                  (fact.confidence === existing.confidence && fact.content.length > existing.content.length)) {
                toDelete.push(existing.id);
                keep[i] = fact;
              } else {
                toDelete.push(fact.id);
              }
              break;
            }
          }
        }
        
        if (!foundSimilar) {
          keep.push(fact);
        }
      }
      
      for (const factId of toDelete) {
        await memoryManager.deleteFact(factId);
      }
      
      const lowConfidenceFacts = keep.filter(f => f.confidence < min_confidence);
      for (const fact of lowConfidenceFacts) {
        await memoryManager.deleteFact(fact.id);
        toDelete.push(fact.id);
      }

      const remaining = keep.length - lowConfidenceFacts.length;
      
      return {
        success: true,
        content: `清理完成。删除了 ${toDelete.length} 条重复/低质量记录，保留 ${Math.max(0, remaining)} 条有效事实。`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `清理事实失败: ${message}`,
      };
    }
  },
};

export const setUserInfoTool: Tool = {
  name: 'set_user_info',
  description: `设置用户的关键信息，如偏好、习惯、重要事项等。

此工具会将信息存储为结构化事实，支持：
- 自动分类（preference/knowledge/context/behavior/goal）
- 置信度管理
- 与其他记忆工具统一格式

建议：使用 add_fact 工具可获得更精细的控制`,
  parameters: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: '信息键名（如：skills, preferences, timezone）',
      },
      value: {
        type: 'string',
        description: '信息值',
      },
      category: {
        type: 'string',
        enum: ['preference', 'knowledge', 'context', 'behavior', 'goal'],
        description: '信息分类（可选，自动推断）',
      },
    },
    required: ['key', 'value'],
  },

  async execute(params): Promise<ToolResult> {
    const { key, value, category } = params as { 
      key: string; 
      value: string; 
      category?: MemoryFact['category'];
    };

    if (!key?.trim() || !value?.trim()) {
      return {
        success: false,
        error: '键名和值不能为空',
      };
    }

    try {
      const memoryManager = getMemoryManager();
      await memoryManager.initialize();
      
      // 构建事实内容
      const content = `${key}: ${value}`;
      
      // 推断分类
      const finalCategory = category || inferCategoryFromKey(key);
      const confidence = inferConfidenceFromKey(key);
      
      // 检查是否已存在相同 key 的事实
      const existingFacts = memoryManager.getFacts({ limit: 100 });
      const existingFact = existingFacts.find(f => 
        f.content.startsWith(`${key}:`) || f.content.startsWith(key)
      );
      
      if (existingFact) {
        // 更新现有事实
        await memoryManager.deleteFact(existingFact.id);
      }
      
      // 添加新事实
      const fact = await memoryManager.addFact(
        content,
        finalCategory,
        confidence,
        'set_user_info'
      );

      const categoryInfo = FACT_CATEGORIES[finalCategory];
      return {
        success: true,
        content: `已记录用户信息: ${content}\n分类: ${categoryInfo?.name || finalCategory}\n置信度: ${(confidence * 100).toFixed(0)}%`,
        metadata: { factId: fact.id, category: finalCategory },
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

/**
 * 从 key 推断分类
 */
function inferCategoryFromKey(key: string): MemoryFact['category'] {
  const keyLower = key.toLowerCase();
  
  // 偏好相关
  if (/pref|like|dislike|favorite|style|mode/.test(keyLower)) {
    return 'preference';
  }
  
  // 技能/知识相关
  if (/skill|tech|language|framework|tool|expert|know/.test(keyLower)) {
    return 'knowledge';
  }
  
  // 背景相关
  if (/work|company|team|project|role|position|location/.test(keyLower)) {
    return 'context';
  }
  
  // 行为相关
  if (/habit|routine|style|approach|workflow/.test(keyLower)) {
    return 'behavior';
  }
  
  // 目标相关
  if (/goal|plan|target|objective|wish/.test(keyLower)) {
    return 'goal';
  }
  
  return 'context';
}

/**
 * 从 key 推断置信度
 */
function inferConfidenceFromKey(key: string): number {
  const keyLower = key.toLowerCase();
  
  // 明确的事实性信息
  if (/name|email|phone|timezone|location|company|role/.test(keyLower)) {
    return 0.95;
  }
  
  // 技能/偏好
  if (/skill|language|framework|pref|like/.test(keyLower)) {
    return 0.85;
  }
  
  // 其他
  return 0.8;
}

export const getUserInfoTool: Tool = {
  name: 'get_user_info',
  description: `获取用户的关键信息。

返回存储的用户事实，按置信度排序。支持按键名搜索。`,
  parameters: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: '信息键名（不填则返回所有）',
      },
      category: {
        type: 'string',
        enum: ['preference', 'knowledge', 'context', 'behavior', 'goal'],
        description: '按分类筛选（可选）',
      },
    },
  },

  async execute(params): Promise<ToolResult> {
    const { key, category } = params as { key?: string; category?: MemoryFact['category'] };

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

      // 获取所有事实
      let facts = memoryManager.getFacts({ 
        limit: 50,
        category: category,
      });

      if (facts.length === 0) {
        return {
          success: true,
          content: category 
            ? `暂无 ${FACT_CATEGORIES[category]?.name || category} 类型的信息记录。`
            : '暂无用户信息记录。',
        };
      }

      // 按键名筛选
      if (key) {
        const keyLower = key.toLowerCase();
        facts = facts.filter(f => 
          f.content.toLowerCase().includes(keyLower) ||
          f.content.startsWith(`${key}:`) ||
          f.content.startsWith(key)
        );

        if (facts.length === 0) {
          // 同时检查旧的 keyInfo（兼容）
          const legacyValue = profile.keyInfo?.[key];
          if (legacyValue) {
            return {
              success: true,
              content: `${key}: ${legacyValue}\n\n⚠️ 此信息来自旧格式，建议使用 /fact 命令重新记录`,
            };
          }
          return {
            success: true,
            content: `未找到 "${key}" 相关的信息。`,
          };
        }

        // 只返回匹配的第一条
        const fact = facts[0]!;
        return {
          success: true,
          content: fact.content,
          metadata: { factId: fact.id, category: fact.category },
        };
      }

      // 返回所有信息（按分类分组）
      const groupedFacts: Record<string, MemoryFact[]> = {};
      for (const fact of facts) {
        const cat = fact.category || 'context';
        if (!groupedFacts[cat]) {
          groupedFacts[cat] = [];
        }
        groupedFacts[cat]!.push(fact);
      }

      const lines: string[] = ['### 用户信息'];
      
      for (const [cat, catFacts] of Object.entries(groupedFacts)) {
        const catKey = cat as keyof typeof FACT_CATEGORIES;
        const catName = FACT_CATEGORIES[catKey]?.name || cat;
        lines.push(`\n**${catName}**`);
        for (const fact of catFacts.slice(0, 5)) {
          lines.push(`- ${fact.content}`);
        }
      }
      
      // 兼容：也显示旧的 keyInfo
      if (profile.keyInfo && Object.keys(profile.keyInfo).length > 0) {
        lines.push('\n---\n**旧格式信息**（建议迁移）：');
        for (const [k, v] of Object.entries(profile.keyInfo)) {
          lines.push(`- ${k}: ${v}`);
        }
      }

      return {
        success: true,
        content: lines.join('\n'),
        metadata: { count: facts.length },
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


// ============ Progressive Disclosure 工具 ============

export const memoryTimelineTool: Tool = {
  name: 'memory_timeline',
  description: '获取指定记忆的时间线上下文。返回目标记忆前后各5条相关记录。',
  parameters: {
    type: 'object',
    properties: {
      memory_id: {
        type: 'string',
        description: '记忆 ID（从 recall compact 结果获取）',
      },
      context_size: {
        type: 'number',
        description: '上下文条数（默认5）',
      },
    },
    required: ['memory_id'],
  },

  async execute(params, context: ToolContext): Promise<ToolResult> {
    const { memory_id, context_size = 5 } = params as { memory_id: string; context_size?: number };

    try {
      const memoryManager = getMemoryManager();
      await memoryManager.initialize();
      
      const timeline = await memoryManager.getTimeline(memory_id, {
        agentId: context.agent.id,
        contextSize: context_size,
      });

      if (!timeline.center) {
        return { success: false, error: '未找到记忆: ' + memory_id };
      }

      const lines: string[] = ['### 记忆时间线'];
      
      if (timeline.before.length > 0) {
        lines.push('\n**前置上下文**');
        timeline.before.forEach((e, i) => {
          const date = new Date(e.timestamp).toLocaleDateString('zh-CN');
          lines.push((i + 1) + '. [' + (e.id?.slice(0,8) || '?') + '] [' + date + '] ' + e.content.slice(0,50));
        });
      }
      
      lines.push('\n**目标记忆**');
      const centerDate = new Date(timeline.center.timestamp).toLocaleDateString('zh-CN');
      lines.push('⭐ [' + (timeline.center.id?.slice(0,8) || '?') + '] [' + centerDate + '] ' + timeline.center.content.slice(0,100));
      
      if (timeline.after.length > 0) {
        lines.push('\n**后置上下文**');
        timeline.after.forEach((e, i) => {
          const date = new Date(e.timestamp).toLocaleDateString('zh-CN');
          lines.push((i + 1) + '. [' + (e.id?.slice(0,8) || '?') + '] [' + date + '] ' + e.content.slice(0,50));
        });
      }

      return {
        success: true,
        content: lines.join('\n'),
        metadata: { memoryId: memory_id, beforeCount: timeline.before.length, afterCount: timeline.after.length },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: '获取时间线失败: ' + message };
    }
  },
};



// ============ 单条溯源工具 ============

export const memoryLookupTool: Tool = {
  name: 'memory_lookup',
  description: '根据 ID 查单条记忆的完整详情和来源信息。用于溯源验证。',
  parameters: {
    type: 'object',
    properties: {
      memory_id: {
        type: 'string',
        description: '记忆 ID（从 recall compact 结果获取）',
      },
    },
    required: ['memory_id'],
  },

  async execute(params, context: ToolContext): Promise<ToolResult> {
    const { memory_id } = params as { memory_id: string };

    try {
      const memoryManager = getMemoryManager();
      await memoryManager.initialize();
      
      const entries = await memoryManager.getByIds([memory_id], {
        agentId: context.agent.id,
      });

      if (entries.length === 0) {
        return { success: false, error: '未找到记忆: ' + memory_id };
      }

      const entry = entries[0]!;
      const date = new Date(entry.timestamp).toLocaleDateString('zh-CN');
      const time = new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

      const lines: string[] = [
        '### 记忆溯源 [#' + (entry.id?.slice(0,8) || memory_id.slice(0,8)) + ']',
        '',
        '**基本信息**',
        '- 创建时间: ' + date + ' ' + time,
        '- 类型: ' + entry.type,
        '- 重要性: ' + entry.importance,
      ];

      if (entry.confidence) {
        lines.push('- 置信度: ' + (entry.confidence * 100).toFixed(0) + '%');
      }
      if (entry.tags?.length) {
        lines.push('- 标签: ' + entry.tags.join(', '));
      }
      if (entry.agentId) {
        lines.push('- 来源 Agent: ' + entry.agentId);
      }

      lines.push('', '**完整内容**', entry.content);

      // 添加溯源提示
      lines.push('', '---');
      lines.push('提示: 用 memory_timeline 查看此记忆的时间线上下文');

      return {
        success: true,
        content: lines.join('\n'),
        metadata: {
          memoryId: entry.id,
          type: entry.type,
          importance: entry.importance,
          timestamp: entry.timestamp,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: '溯源失败: ' + message };
    }
  },
};
export const memoryGetTool: Tool = {
  name: 'memory_get',
  description: '根据 ID 批量获取完整记忆内容。用于 Progressive Disclosure 第三层检索。',
  parameters: {
    type: 'object',
    properties: {
      memory_ids: {
        type: 'string',
        description: '记忆 ID 列表，用逗号分隔',
      },
    },
    required: ['memory_ids'],
  },

  async execute(params, context: ToolContext): Promise<ToolResult> {
    const { memory_ids } = params as { memory_ids: string };
    
    const ids = memory_ids.split(',').map(id => id.trim()).filter(Boolean);
    
    if (ids.length === 0) {
      return { success: false, error: '请提供至少一个记忆 ID' };
    }

    try {
      const memoryManager = getMemoryManager();
      await memoryManager.initialize();
      
      const entries = await memoryManager.getByIds(ids, { agentId: context.agent.id });

      if (entries.length === 0) {
        return { success: false, error: '未找到任何记忆: ' + ids.join(', ') };
      }

      const lines: string[] = ['### 记忆详情 (' + entries.length + '条)'];
      
      entries.forEach((e, i) => {
        const date = new Date(e.timestamp).toLocaleDateString('zh-CN');
        const time = new Date(e.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        lines.push('\n**' + (i + 1) + '. [' + (e.id?.slice(0,8) || '?') + '] [' + date + ' ' + time + ']**');
        lines.push('类型: ' + e.type);
        lines.push('重要性: ' + e.importance);
        if (e.confidence) lines.push('置信度: ' + (e.confidence * 100).toFixed(0) + '%');
        if (e.tags?.length) lines.push('标签: ' + e.tags.join(', '));
        lines.push('\n' + e.content);
      });

      return {
        success: true,
        content: lines.join('\n'),
        metadata: { requestedIds: ids, foundCount: entries.length },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: '获取记忆详情失败: ' + message };
    }
  },
};

export const memoryTools = [
  memoryTimelineTool,
  memoryGetTool,
  memoryLookupTool,
  rememberTool,
  recallTool,
  addFactTool,
  getFactsTool,
  deleteFactTool,
  cleanFactsTool,
  setUserInfoTool,
  getUserInfoTool,
  memoryStatsTool,
];