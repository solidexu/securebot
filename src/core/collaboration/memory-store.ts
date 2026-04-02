/**
 * Agent 记忆共享模块
 * 
 * 提供跨 Agent 的记忆持久化和共享能力
 */

import { v4 as uuidv4 } from 'uuid';

// ============ 类型定义 ============

/**
 * 记忆条目
 */
export interface MemoryEntry {
  /** 记忆 ID */
  id: string;
  /** 来源 Agent ID */
  sourceAgent: string;
  /** 目标 Agent ID（可选，为空则共享给所有） */
  targetAgent?: string;
  /** 记忆类型 */
  type: MemoryType;
  /** 记忆内容 */
  content: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
  /** 置信度 (0-1) */
  confidence?: number;
  /** 创建时间 */
  createdAt: number;
  /** 过期时间（可选） */
  expiresAt?: number;
  /** 访问次数 */
  accessCount: number;
  /** 最后访问时间 */
  lastAccessedAt: number;
}

/**
 * 记忆类型
 */
export type MemoryType =
  | 'fact'        // 事实
  | 'preference'  // 偏好
  | 'context'     // 上下文
  | 'task'        // 任务
  | 'error'       // 错误
  | 'learning'    // 学习
  | 'feedback';   // 反馈

/**
 * 记忆查询选项
 */
export interface MemoryQueryOptions {
  /** 来源 Agent */
  sourceAgent?: string;
  /** 目标 Agent */
  targetAgent?: string;
  /** 记忆类型 */
  type?: MemoryType;
  /** 最小置信度 */
  minConfidence?: number;
  /** 最大返回数量 */
  limit?: number;
  /** 是否包含过期记忆 */
  includeExpired?: boolean;
  /** 排序方式 */
  orderBy?: 'createdAt' | 'accessCount' | 'confidence' | 'lastAccessedAt';
  /** 排序方向 */
  order?: 'asc' | 'desc';
}

/**
 * 记忆存储配置
 */
export interface MemoryStoreConfig {
  /** 最大记忆数量 */
  maxEntries: number;
  /** 默认过期时间（毫秒） */
  defaultTTL?: number;
  /** 是否启用持久化 */
  persistent?: boolean;
  /** 持久化路径 */
  persistPath?: string;
  /** 共享策略 */
  sharingPolicy: SharingPolicy;
}

/**
 * 共享策略
 */
export interface SharingPolicy {
  /** 是否允许跨 Agent 共享 */
  crossAgentSharing: boolean;
  /** 允许共享的 Agent 列表（为空则全部允许） */
  allowedAgents?: string[];
  /** 拒绝共享的 Agent 列表 */
  deniedAgents?: string[];
  /** 默认共享范围 */
  defaultScope: 'private' | 'shared' | 'global';
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: MemoryStoreConfig = {
  maxEntries: 10000,
  defaultTTL: 7 * 24 * 60 * 60 * 1000, // 7 天
  sharingPolicy: {
    crossAgentSharing: true,
    defaultScope: 'shared',
  },
};

// ============ 记忆存储 ============

/**
 * Agent 记忆存储
 */
export class AgentMemoryStore {
  private memories: Map<string, MemoryEntry> = new Map();
  private config: MemoryStoreConfig;
  private agentMemories: Map<string, Set<string>> = new Map(); // agentId -> memoryIds
  private typeIndex: Map<MemoryType, Set<string>> = new Map(); // type -> memoryIds

  constructor(config: Partial<MemoryStoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeIndices();
  }

  /**
   * 初始化索引
   */
  private initializeIndices(): void {
    for (const type of ['fact', 'preference', 'context', 'task', 'error', 'learning', 'feedback'] as MemoryType[]) {
      this.typeIndex.set(type, new Set());
    }
  }

  /**
   * 存储记忆
   */
  store(
    sourceAgent: string,
    content: string,
    options?: {
      type?: MemoryType;
      targetAgent?: string;
      metadata?: Record<string, unknown>;
      confidence?: number;
      ttl?: number;
    }
  ): MemoryEntry {
    // 检查是否需要清理
    if (this.memories.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    const now = Date.now();
    const entry: MemoryEntry = {
      id: uuidv4(),
      sourceAgent,
      targetAgent: options?.targetAgent,
      type: options?.type || 'fact',
      content,
      metadata: options?.metadata,
      confidence: options?.confidence ?? 1.0,
      createdAt: now,
      expiresAt: options?.ttl ? now + options.ttl : 
                 this.config.defaultTTL ? now + this.config.defaultTTL : undefined,
      accessCount: 0,
      lastAccessedAt: now,
    };

    // 存储到主索引
    this.memories.set(entry.id, entry);

    // 更新 Agent 索引
    if (!this.agentMemories.has(sourceAgent)) {
      this.agentMemories.set(sourceAgent, new Set());
    }
    this.agentMemories.get(sourceAgent)!.add(entry.id);

    // 更新类型索引
    this.typeIndex.get(entry.type)?.add(entry.id);

    return entry;
  }

  /**
   * 获取记忆
   */
  get(memoryId: string): MemoryEntry | undefined {
    const entry = this.memories.get(memoryId);
    if (entry) {
      entry.accessCount++;
      entry.lastAccessedAt = Date.now();
    }
    return entry;
  }

  /**
   * 查询记忆
   */
  query(options: MemoryQueryOptions = {}): MemoryEntry[] {
    let results: MemoryEntry[] = [];

    // 确定搜索范围
    if (options.sourceAgent) {
      const agentMemoryIds = this.agentMemories.get(options.sourceAgent);
      if (agentMemoryIds) {
        results = Array.from(agentMemoryIds)
          .map(id => this.memories.get(id))
          .filter((e): e is MemoryEntry => e !== undefined);
      }
    } else {
      results = Array.from(this.memories.values());
    }

    // 过滤
    results = results.filter(entry => {
      // 过期检查
      if (!options.includeExpired && entry.expiresAt && entry.expiresAt < Date.now()) {
        return false;
      }

      // 目标 Agent 检查
      if (options.targetAgent) {
        if (entry.targetAgent && entry.targetAgent !== options.targetAgent) {
          return false;
        }
      }

      // 类型检查
      if (options.type && entry.type !== options.type) {
        return false;
      }

      // 置信度检查
      if (options.minConfidence !== undefined && (entry.confidence ?? 0) < options.minConfidence) {
        return false;
      }

      return true;
    });

    // 排序
    const orderBy = options.orderBy || 'createdAt';
    const order = options.order || 'desc';
    results.sort((a, b) => {
      const aVal = a[orderBy];
      const bVal = b[orderBy];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return order === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });

    // 限制数量
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * 获取 Agent 可访问的记忆
   */
  getAccessibleMemories(agentId: string, options?: MemoryQueryOptions): MemoryEntry[] {
    const policy = this.config.sharingPolicy;

    // 检查共享权限
    if (!policy.crossAgentSharing) {
      // 只返回自己的记忆
      return this.query({ ...options, sourceAgent: agentId });
    }

    // 检查是否在拒绝列表
    if (policy.deniedAgents?.includes(agentId)) {
      return this.query({ ...options, sourceAgent: agentId });
    }

    // 获取所有记忆并过滤
    const allMemories = this.query(options);
    
    return allMemories.filter(entry => {
      // 自己的记忆
      if (entry.sourceAgent === agentId) return true;
      
      // 指定给自己的记忆
      if (entry.targetAgent === agentId) return true;
      
      // 全局共享记忆（没有指定目标）
      if (!entry.targetAgent) {
        // 检查是否在允许列表（如果有）
        if (policy.allowedAgents && !policy.allowedAgents.includes(agentId)) {
          return false;
        }
        return true;
      }
      
      return false;
    });
  }

  /**
   * 分享记忆给指定 Agent
   */
  share(memoryId: string, targetAgent: string): boolean {
    const entry = this.memories.get(memoryId);
    if (!entry) return false;

    // 创建新的共享记忆
    const sharedEntry: MemoryEntry = {
      ...entry,
      id: uuidv4(),
      targetAgent,
      createdAt: Date.now(),
      accessCount: 0,
    };

    this.memories.set(sharedEntry.id, sharedEntry);
    
    if (!this.agentMemories.has(targetAgent)) {
      this.agentMemories.set(targetAgent, new Set());
    }
    this.agentMemories.get(targetAgent)!.add(sharedEntry.id);

    return true;
  }

  /**
   * 批量分享
   */
  shareToAgents(memoryIds: string[], targetAgents: string[]): number {
    let count = 0;
    for (const memoryId of memoryIds) {
      for (const targetAgent of targetAgents) {
        if (this.share(memoryId, targetAgent)) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * 更新记忆
   */
  update(memoryId: string, updates: Partial<MemoryEntry>): boolean {
    const entry = this.memories.get(memoryId);
    if (!entry) return false;

    Object.assign(entry, updates, { lastAccessedAt: Date.now() });
    return true;
  }

  /**
   * 删除记忆
   */
  delete(memoryId: string): boolean {
    const entry = this.memories.get(memoryId);
    if (!entry) return false;

    // 从主索引删除
    this.memories.delete(memoryId);

    // 从 Agent 索引删除
    this.agentMemories.get(entry.sourceAgent)?.delete(memoryId);

    // 从类型索引删除
    this.typeIndex.get(entry.type)?.delete(memoryId);

    return true;
  }

  /**
   * 清理过期记忆
   */
  cleanupExpired(): number {
    const now = Date.now();
    let count = 0;

    for (const [id, entry] of this.memories) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.delete(id);
        count++;
      }
    }

    return count;
  }

  /**
   * 清理最旧记忆
   */
  private evictOldest(): void {
    const entries = Array.from(this.memories.values())
      .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

    const toEvict = Math.floor(this.config.maxEntries * 0.1);
    for (let i = 0; i < toEvict && i < entries.length; i++) {
      this.delete(entries[i].id);
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalEntries: number;
    byAgent: Record<string, number>;
    byType: Record<string, number>;
    expiredCount: number;
  } {
    const now = Date.now();
    const byAgent: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let expiredCount = 0;

    for (const entry of this.memories.values()) {
      byAgent[entry.sourceAgent] = (byAgent[entry.sourceAgent] || 0) + 1;
      byType[entry.type] = (byType[entry.type] || 0) + 1;
      if (entry.expiresAt && entry.expiresAt < now) {
        expiredCount++;
      }
    }

    return {
      totalEntries: this.memories.size,
      byAgent,
      byType,
      expiredCount,
    };
  }

  /**
   * 导出记忆
   */
  export(): MemoryEntry[] {
    return Array.from(this.memories.values());
  }

  /**
   * 导入记忆
   */
  import(memories: MemoryEntry[]): number {
    let count = 0;
    for (const entry of memories) {
      if (!this.memories.has(entry.id)) {
        this.memories.set(entry.id, entry);
        
        if (!this.agentMemories.has(entry.sourceAgent)) {
          this.agentMemories.set(entry.sourceAgent, new Set());
        }
        this.agentMemories.get(entry.sourceAgent)!.add(entry.id);
        
        this.typeIndex.get(entry.type)?.add(entry.id);
        count++;
      }
    }
    return count;
  }
}

// ============ 全局实例 ============

let globalMemoryStore: AgentMemoryStore | null = null;

/**
 * 获取全局记忆存储
 */
export function getMemoryStore(config?: Partial<MemoryStoreConfig>): AgentMemoryStore {
  if (!globalMemoryStore) {
    globalMemoryStore = new AgentMemoryStore(config);
  }
  return globalMemoryStore;
}

/**
 * 配置全局记忆存储
 */
export function configureMemoryStore(config: Partial<MemoryStoreConfig>): void {
  globalMemoryStore = new AgentMemoryStore(config);
}