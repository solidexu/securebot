/**
 * RAG 工具
 * 
 * 为 Agent 提供知识库检索能力
 */

import type { Tool, ToolContext, ToolResult, Agent } from '../core/types.js';
import { createRAGStore, createOllamaEmbedder, RAGStore, type RAGConfig } from './store.js';

// ============ RAG 管理器 ============

/**
 * Agent RAG 配置
 */
export interface AgentRAGConfig extends Partial<RAGConfig> {
  /** 是否启用 */
  enabled: boolean;
  /** 知识库目录 */
  knowledgeDirs: string[];
}

/**
 * RAG 管理器
 */
class RAGManager {
  private stores: Map<string, RAGStore> = new Map();
  private agentConfigs: Map<string, AgentRAGConfig> = new Map();

  /**
   * 获取或创建 Agent 的 RAG 存储
   */
  async getStore(agent: Agent, config?: AgentRAGConfig): Promise<RAGStore | null> {
    const ragConfig = config ?? this.agentConfigs.get(agent.id);
    
    if (!ragConfig?.enabled) {
      return null;
    }

    let store = this.stores.get(agent.id);
    
    if (!store) {
      store = createRAGStore({
        storageDir: `${agent.workspace}/.rag`,
        ...ragConfig,
      });

      // 设置嵌入器
      const embedder = createOllamaEmbedder({
        model: ragConfig.embeddingModel,
      });
      store.setEmbedder(embedder);

      // 初始化
      await store.initialize();

      // 索引知识库目录
      for (const dir of ragConfig.knowledgeDirs) {
        await store.addDirectory(dir);
      }

      this.stores.set(agent.id, store);
    }

    return store;
  }

  /**
   * 设置 Agent 的 RAG 配置
   */
  setAgentConfig(agentId: string, config: AgentRAGConfig): void {
    this.agentConfigs.set(agentId, config);
  }

  /**
   * 清除 Agent 的 RAG 存储
   */
  async clearAgent(agentId: string): Promise<void> {
    const store = this.stores.get(agentId);
    if (store) {
      await store.clear();
      this.stores.delete(agentId);
    }
  }
}

export const ragManager = new RAGManager();

// ============ RAG 搜索工具 ============

export const ragSearchTool: Tool = {
  name: 'rag_search',
  description: '在知识库中搜索相关信息。返回与查询最匹配的内容片段。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索查询',
      },
      top_k: {
        type: 'number',
        description: '返回结果数量，默认 5',
      },
    },
    required: ['query'],
  },

  async execute(params, context: ToolContext): Promise<ToolResult> {
    const { query, top_k = 5 } = params as { query: string; top_k?: number };

    try {
      const store = await ragManager.getStore(context.agent);
      
      if (!store) {
        return {
          success: false,
          error: 'RAG 未为此 Agent 启用',
        };
      }

      const results = await store.search(query, top_k);

      if (results.length === 0) {
        return {
          success: true,
          content: '未找到相关信息。',
        };
      }

      const content = results
        .map((r, i) => `### 结果 ${i + 1} (相关度: ${(r.score * 100).toFixed(1)}%)\n来源: ${r.chunk.metadata.source}\n\n${r.chunk.content}`)
        .join('\n\n---\n\n');

      return {
        success: true,
        content,
        metadata: {
          resultCount: results.length,
          query,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `RAG 搜索失败: ${message}`,
      };
    }
  },
};

// ============ RAG 索引工具 ============

export const ragIndexTool: Tool = {
  name: 'rag_index',
  description: '将文档或目录添加到知识库。支持 .md, .txt, .json 文件。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件或目录路径（相对于 workspace）',
      },
    },
    required: ['path'],
  },

  async execute(params, context: ToolContext): Promise<ToolResult> {
    const { path } = params as { path: string };
    const { resolve } = await import('node:path');
    const fullPath = resolve(context.workspace, path);

    try {
      const store = await ragManager.getStore(context.agent);
      
      if (!store) {
        return {
          success: false,
          error: 'RAG 未为此 Agent 启用',
        };
      }

      const { existsSync, statSync } = await import('node:fs');
      
      if (!existsSync(fullPath)) {
        return {
          success: false,
          error: `路径不存在: ${path}`,
        };
      }

      const stat = statSync(fullPath);
      let count = 0;

      if (stat.isDirectory()) {
        count = await store.addDirectory(fullPath);
      } else {
        await store.addFile(fullPath);
        count = 1;
      }

      return {
        success: true,
        content: `已索引 ${count} 个文档到知识库。`,
        metadata: {
          path: fullPath,
          documentCount: count,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `索引失败: ${message}`,
      };
    }
  },
};

// ============ RAG 状态工具 ============

export const ragStatusTool: Tool = {
  name: 'rag_status',
  description: '查看知识库状态，包括文档数量、块数量等信息。',
  parameters: {
    type: 'object',
    properties: {},
  },

  async execute(_params, context: ToolContext): Promise<ToolResult> {
    try {
      const store = await ragManager.getStore(context.agent);
      
      if (!store) {
        return {
          success: true,
          content: 'RAG 未为此 Agent 启用。\n\n可在配置中设置:\n```json\n{\n  "rag": {\n    "enabled": true,\n    "knowledgeDirs": ["./docs"]\n  }\n}\n```',
        };
      }

      const stats = store.getStats();

      const content = `## RAG 知识库状态

- 文档数量: ${stats.documentCount}
- 内容块数量: ${stats.chunkCount}
- 向量嵌入: ${stats.hasEmbeddings ? '已生成' : '未生成'}
- 嵌入维度: ${stats.embeddingDimension ?? 'N/A'}

使用 \`rag_search\` 搜索知识库。
使用 \`rag_index\` 添加新文档。`;

      return {
        success: true,
        content,
        metadata: stats,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `获取状态失败: ${message}`,
      };
    }
  },
};

// ============ 导出 ============

export const ragTools = [ragSearchTool, ragIndexTool, ragStatusTool];

/**
 * 注册 RAG 工具（延迟调用）
 */
export function getRAGTools(): Tool[] {
  return ragTools;
}