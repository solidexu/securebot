/**
 * 统一数据存储层
 * 
 * 合并 Memory/SuccessPattern/ErrorPattern/Feedback/RAG 五套存储
 * 提供统一的存储、向量化、检索接口
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { SuccessPattern, ErrorPattern, UserFeedback } from './types.js';

// ============ 类型定义 ============

/**
 * 统一条目类型
 */
export type UnifiedEntryType = 'memory' | 'success' | 'error' | 'feedback';

/**
 * 统一数据条目
 */
export interface UnifiedEntry {
  /** 唯一 ID */
  id: string;
  /** 条目类型 */
  type: UnifiedEntryType;
  /** Agent ID */
  agentId: string;
  /** 内容 */
  content: string;
  /** 元数据 */
  metadata: Record<string, unknown>;
  /** 向量（可选，延迟加载） */
  embedding?: number[];
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 重要性 (0-1) */
  importance: number;
  /** 标签 */
  tags: string[];
  /** 来源 */
  source: 'user' | 'agent' | 'system';
}

/**
 * 搜索选项
 */
export interface UnifiedSearchOptions {
  /** 条目类型过滤 */
  types?: UnifiedEntryType[];
  /** Agent ID 过滤 */
  agentId?: string;
  /** 标签过滤 */
  tags?: string[];
  /** 最小重要性 */
  minImportance?: number;
  /** 是否使用语义搜索 */
  semantic?: boolean;
  /** 是否使用关键词搜索 */
  keywords?: boolean;
  /** 返回数量限制 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/**
 * 搜索结果
 */
export interface UnifiedSearchResult {
  /** 条目 */
  entry: UnifiedEntry;
  /** 相似度分数 (0-1) */
  score: number;
  /** 匹配类型 */
  matchType: 'semantic' | 'keyword' | 'exact';
  /** 高亮片段 */
  highlights?: string[];
}

/**
 * 统一存储配置
 */
export interface UnifiedStoreConfig {
  /** 存储目录 */
  storageDir: string;
  /** 是否启用向量化 */
  enableEmbedding: boolean;
  /** 向量化模型 */
  embeddingModel: string;
  /** 向量化服务 URL */
  embeddingUrl: string;
  /** 最大条目数 */
  maxEntries: number;
  /** 清理天数 */
  cleanupDays: number;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: UnifiedStoreConfig = {
  storageDir: join(homedir(), '.securebot', 'unified-store'),
  enableEmbedding: true,
  embeddingModel: 'nomic-embed-text',
  embeddingUrl: 'http://localhost:11434',
  maxEntries: 10000,
  cleanupDays: 90,
};

// ============ JSONL 存储 ============

/**
 * JSONL 文件存储（支持追加写入）
 */
class JSONLStore {
  private filePath: string;
  private cache: Map<string, UnifiedEntry> = new Map();
  private loaded: boolean = false;
  
  constructor(filePath: string) {
    this.filePath = filePath;
  }
  
  /**
   * 加载所有条目
   */
  async load(): Promise<void> {
    if (this.loaded) return;
    
    if (existsSync(this.filePath)) {
      const content = readFileSync(this.filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as UnifiedEntry;
          this.cache.set(entry.id, entry);
        } catch {
          // 忽略解析错误
        }
      }
    }
    
    this.loaded = true;
  }
  
  /**
   * 添加条目
   */
  async add(entry: UnifiedEntry): Promise<void> {
    await this.load();
    this.cache.set(entry.id, entry);
    
    // 追加写入文件
    const dir = join(this.filePath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    appendFileSync(this.filePath, JSON.stringify(entry) + '\n', 'utf-8');
  }
  
  /**
   * 更新条目
   */
  async update(entry: UnifiedEntry): Promise<void> {
    await this.load();
    this.cache.set(entry.id, entry);
    
    // 重写整个文件
    const lines = Array.from(this.cache.values()).map(e => JSON.stringify(e));
    writeFileSync(this.filePath, lines.join('\n') + '\n', 'utf-8');
  }
  
  /**
   * 删除条目
   */
  async delete(id: string): Promise<void> {
    await this.load();
    this.cache.delete(id);
    
    // 重写整个文件
    const lines = Array.from(this.cache.values()).map(e => JSON.stringify(e));
    writeFileSync(this.filePath, lines.join('\n') + '\n', 'utf-8');
  }
  
  /**
   * 获取条目
   */
  async get(id: string): Promise<UnifiedEntry | undefined> {
    await this.load();
    return this.cache.get(id);
  }
  
  /**
   * 获取所有条目
   */
  async getAll(): Promise<UnifiedEntry[]> {
    await this.load();
    return Array.from(this.cache.values());
  }
  
  /**
   * 按条件过滤
   */
  async filter(predicate: (entry: UnifiedEntry) => boolean): Promise<UnifiedEntry[]> {
    await this.load();
    return Array.from(this.cache.values()).filter(predicate);
  }
  
  /**
   * 清空
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.loaded = false;
    if (existsSync(this.filePath)) {
      writeFileSync(this.filePath, '', 'utf-8');
    }
  }
  
  /**
   * 获取数量
   */
  async count(): Promise<number> {
    await this.load();
    return this.cache.size;
  }
}

// ============ 关键词索引 ============

/**
 * 倒排索引（用于关键词搜索）
 */
class InvertedIndex {
  private index: Map<string, Set<string>> = new Map();
  
  /**
   * 添加条目
   */
  add(entry: UnifiedEntry): void {
    const tokens = this.tokenize(entry.content);
    
    for (const token of tokens) {
      if (!this.index.has(token)) {
        this.index.set(token, new Set());
      }
      this.index.get(token)!.add(entry.id);
    }
  }
  
  /**
   * 删除条目
   */
  remove(id: string, tokens: string[]): void {
    for (const token of tokens) {
      this.index.get(token)?.delete(id);
    }
  }
  
  /**
   * 搜索
   */
  search(query: string): Set<string> {
    const tokens = this.tokenize(query);
    const result = new Set<string>();
    
    for (const token of tokens) {
      const ids = this.index.get(token);
      if (ids) {
        for (const id of ids) {
          result.add(id);
        }
      }
    }
    
    return result;
  }
  
  /**
   * 清空
   */
  clear(): void {
    this.index.clear();
  }
  
  /**
   * 分词
   */
  private tokenize(text: string): string[] {
    // 简单分词：按空格和标点分割，转小写
    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }
}

// ============ 向量索引（简化版） ============

/**
 * 向量索引（用于语义搜索）
 */
class VectorIndex {
  private vectors: Map<string, number[]> = new Map();
  private dimension: number = 0;
  
  /**
   * 添加向量
   */
  add(id: string, vector: number[]): void {
    this.vectors.set(id, vector);
    this.dimension = Math.max(this.dimension, vector.length);
  }
  
  /**
   * 删除向量
   */
  remove(id: string): void {
    this.vectors.delete(id);
  }
  
  /**
   * 搜索相似向量
   */
  search(query: number[], topK: number = 10): Array<{ id: string; score: number }> {
    const results: Array<{ id: string; score: number }> = [];
    
    for (const [id, vector] of this.vectors) {
      const score = this.cosineSimilarity(query, vector);
      results.push({ id, score });
    }
    
    // 按分数降序排序
    results.sort((a, b) => b.score - a.score);
    
    return results.slice(0, topK);
  }
  
  /**
   * 获取向量
   */
  get(id: string): number[] | undefined {
    return this.vectors.get(id);
  }
  
  /**
   * 清空
   */
  clear(): void {
    this.vectors.clear();
  }
  
  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

// ============ 统一存储 ============

/**
 * 统一数据存储
 */
export class UnifiedStore {
  private config: UnifiedStoreConfig;
  private store: JSONLStore;
  private keywordIndex: InvertedIndex;
  private vectorIndex: VectorIndex;
  private initialized: boolean = false;
  private embeddingAvailable: boolean = true;  // embedding 服务状态缓存
  private lastEmbeddingCheck: number = 0;      // 上次检查时间
  private readonly EMBEDDING_CHECK_INTERVAL = 60000;  // 1 分钟检查一次
  
  constructor(config: Partial<UnifiedStoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = new JSONLStore(join(this.config.storageDir, 'entries.jsonl'));
    this.keywordIndex = new InvertedIndex();
    this.vectorIndex = new VectorIndex();
  }
  
  // ============ 初始化 ============
  
  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // 确保目录存在
    if (!existsSync(this.config.storageDir)) {
      mkdirSync(this.config.storageDir, { recursive: true });
    }
    
    // 加载数据并构建索引
    const entries = await this.store.getAll();
    
    for (const entry of entries) {
      this.keywordIndex.add(entry);
      if (entry.embedding) {
        this.vectorIndex.add(entry.id, entry.embedding);
      }
    }
    
    this.initialized = true;
  }
  
  // ============ 添加条目 ============
  
  /**
   * 添加条目
   */
  async add(entry: UnifiedEntry): Promise<void> {
    await this.initialize();
    
    // 自动生成 ID
    if (!entry.id) {
      entry.id = this.generateId(entry);
    }
    
    // 设置时间戳
    const now = new Date().toISOString();
    entry.createdAt = entry.createdAt || now;
    entry.updatedAt = now;
    
    // 向量化（仅当服务可用时）
    if (this.config.enableEmbedding && !entry.embedding && this.embeddingAvailable) {
      entry.embedding = await this.getEmbedding(entry.content);
    }
    
    // 存储
    await this.store.add(entry);
    
    // 更新索引
    this.keywordIndex.add(entry);
    if (entry.embedding && entry.embedding.length > 0) {
      this.vectorIndex.add(entry.id, entry.embedding);
    }
  }
  
  /**
   * 从成功模式添加
   */
  async addFromSuccessPattern(pattern: SuccessPattern): Promise<void> {
    const entry: UnifiedEntry = {
      id: `success_${pattern.id}`,
      type: 'success',
      agentId: pattern.agentId,
      content: `${pattern.taskDescription}\n${pattern.approach}`,
      metadata: {
        taskType: pattern.taskType,
        toolsUsed: pattern.toolsUsed,
        effectiveness: pattern.effectiveness,
        result: pattern.result,
      },
      importance: pattern.effectiveness,
      tags: ['success', pattern.taskType, ...pattern.toolsUsed],
      source: 'agent',
      createdAt: pattern.createdAt,
      updatedAt: pattern.createdAt,
    };
    
    await this.add(entry);
  }
  
  /**
   * 从错误模式添加
   */
  async addFromErrorPattern(pattern: ErrorPattern): Promise<void> {
    const entry: UnifiedEntry = {
      id: `error_${pattern.id}`,
      type: 'error',
      agentId: pattern.agentId,
      content: `${pattern.taskContext}\n${pattern.errorMessage}`,
      metadata: {
        errorType: pattern.errorType,
        failedApproach: pattern.failedApproach,
        solution: pattern.solution,
        occurrenceCount: pattern.occurrenceCount,
      },
      importance: Math.min(1, pattern.occurrenceCount / 10),
      tags: ['error', pattern.errorType],
      source: 'agent',
      createdAt: pattern.firstOccurrence,
      updatedAt: pattern.lastOccurrence,
    };
    
    await this.add(entry);
  }
  
  /**
   * 从反馈添加
   */
  async addFromFeedback(feedback: UserFeedback): Promise<void> {
    const entry: UnifiedEntry = {
      id: `feedback_${feedback.id}`,
      type: 'feedback',
      agentId: feedback.agentId || 'unknown',
      content: feedback.content,
      metadata: {
        type: feedback.type,
        rating: feedback.rating,
      },
      importance: feedback.rating ? 1 - feedback.rating / 5 : 0.5,
      tags: ['feedback', feedback.type, `rating_${feedback.rating || 'none'}`],
      source: 'user',
      createdAt: feedback.createdAt,
      updatedAt: feedback.createdAt,
    };
    
    await this.add(entry);
  }
  
  /**
   * 从记忆添加
   */
  async addFromMemory(memory: {
    id: string;
    agentId: string;
    content: string;
    type: string;
    importance: number;
    createdAt: string;
  }): Promise<void> {
    const entry: UnifiedEntry = {
      id: `memory_${memory.id}`,
      type: 'memory',
      agentId: memory.agentId,
      content: memory.content,
      metadata: {
        memoryType: memory.type,
      },
      importance: memory.importance,
      tags: ['memory', memory.type],
      source: 'user',
      createdAt: memory.createdAt,
      updatedAt: memory.createdAt,
    };
    
    await this.add(entry);
  }
  
  // ============ 搜索 ============
  
  /**
   * 统一搜索
   */
  async search(query: string, options: UnifiedSearchOptions = {}): Promise<UnifiedSearchResult[]> {
    await this.initialize();
    
    const {
      types,
      agentId,
      tags,
      minImportance = 0,
      semantic = true,
      keywords = true,
      limit = 10,
      offset = 0,
    } = options;
    
    const results: Map<string, UnifiedSearchResult> = new Map();
    
    // 语义搜索
    if (semantic && this.config.enableEmbedding) {
      const queryEmbedding = await this.getEmbedding(query);
      const semanticResults = this.vectorIndex.search(queryEmbedding, limit * 2);
      
      for (const { id, score } of semanticResults) {
        const entry = await this.store.get(id);
        if (entry && this.matchesFilter(entry, { types, agentId, tags, minImportance })) {
          results.set(id, {
            entry,
            score,
            matchType: 'semantic',
          });
        }
      }
    }
    
    // 关键词搜索
    if (keywords) {
      const keywordIds = this.keywordIndex.search(query);
      
      for (const id of keywordIds) {
        if (results.has(id)) continue;
        
        const entry = await this.store.get(id);
        if (entry && this.matchesFilter(entry, { types, agentId, tags, minImportance })) {
          // 计算关键词匹配分数
          const score = this.calculateKeywordScore(query, entry);
          results.set(id, {
            entry,
            score,
            matchType: 'keyword',
            highlights: this.extractHighlights(query, entry.content),
          });
        }
      }
    }
    
    // 排序并返回
    const sortedResults = Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .slice(offset, offset + limit);
    
    return sortedResults;
  }
  
  /**
   * 获取条目
   */
  async get(id: string): Promise<UnifiedEntry | undefined> {
    await this.initialize();
    return this.store.get(id);
  }
  
  /**
   * 更新条目
   */
  async update(entry: UnifiedEntry): Promise<void> {
    await this.initialize();
    entry.updatedAt = new Date().toISOString();
    await this.store.update(entry);
  }
  
  /**
   * 删除条目
   */
  async delete(id: string): Promise<void> {
    await this.initialize();
    const entry = await this.store.get(id);
    if (entry) {
      await this.store.delete(id);
      this.keywordIndex.remove(id, this.tokenize(entry.content));
      this.vectorIndex.remove(id);
    }
  }
  
  /**
   * 获取所有条目
   */
  async getAll(options?: UnifiedSearchOptions): Promise<UnifiedEntry[]> {
    await this.initialize();
    
    if (!options) {
      return this.store.getAll();
    }
    
    return this.store.filter(entry => this.matchesFilter(entry, options));
  }
  
  /**
   * 统计
   */
  async stats(): Promise<{
    total: number;
    byType: Record<UnifiedEntryType, number>;
    byAgent: Record<string, number>;
  }> {
    await this.initialize();
    
    const entries = await this.store.getAll();
    
    const byType: Record<UnifiedEntryType, number> = {
      memory: 0,
      success: 0,
      error: 0,
      feedback: 0,
    };
    
    const byAgent: Record<string, number> = {};
    
    for (const entry of entries) {
      byType[entry.type]++;
      byAgent[entry.agentId] = (byAgent[entry.agentId] || 0) + 1;
    }
    
    return {
      total: entries.length,
      byType,
      byAgent,
    };
  }
  
  // ============ 私有方法 ============
  
  /**
   * 生成 ID
   */
  private generateId(entry: UnifiedEntry): string {
    const hash = createHash('md5');
    hash.update(entry.type);
    hash.update(entry.agentId);
    hash.update(entry.content);
    return hash.digest('hex').slice(0, 12);
  }
  
  /**
   * 获取向量
   */
  private async getEmbedding(text: string): Promise<number[]> {
    if (!this.config.enableEmbedding) {
      return [];
    }
    
    // 检查是否需要跳过（服务不可用且还在缓存期内）
    const now = Date.now();
    if (!this.embeddingAvailable && (now - this.lastEmbeddingCheck) < this.EMBEDDING_CHECK_INTERVAL) {
      return [];  // 服务不可用，跳过
    }
    
    try {
      const response = await fetch(`${this.config.embeddingUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.embeddingModel,
          prompt: text.slice(0, 1000), // 限制长度
        }),
      });
      
      // 检查响应状态
      if (!response.ok) {
        // 标记服务不可用
        this.embeddingAvailable = false;
        this.lastEmbeddingCheck = now;
        // 只在首次失败时打印警告
        if (now - this.lastEmbeddingCheck > this.EMBEDDING_CHECK_INTERVAL) {
          console.warn(`⚠️ Embedding 服务不可用 (${response.status})，语义搜索功能已禁用`);
        }
        return [];
      }
      
      // 成功，标记服务可用
      this.embeddingAvailable = true;
      this.lastEmbeddingCheck = now;
      
      const data = await response.json() as { embedding?: number[] };
      return data.embedding || [];
    } catch (error) {
      // 标记服务不可用
      this.embeddingAvailable = false;
      this.lastEmbeddingCheck = now;
      // 静默失败，不打印错误
      return [];
    }
  }
  
  /**
   * 检查是否匹配过滤条件
   */
  private matchesFilter(
    entry: UnifiedEntry,
    options: Pick<UnifiedSearchOptions, 'types' | 'agentId' | 'tags' | 'minImportance'>
  ): boolean {
    if (options.types && !options.types.includes(entry.type)) {
      return false;
    }
    if (options.agentId && entry.agentId !== options.agentId) {
      return false;
    }
    if (options.tags && !options.tags.some(t => entry.tags.includes(t))) {
      return false;
    }
    if (entry.importance < options.minImportance) {
      return false;
    }
    return true;
  }
  
  /**
   * 计算关键词匹配分数
   */
  private calculateKeywordScore(query: string, entry: UnifiedEntry): number {
    const queryTokens = new Set(this.tokenize(query));
    const entryTokens = new Set(this.tokenize(entry.content));
    
    let matchCount = 0;
    for (const token of queryTokens) {
      if (entryTokens.has(token)) {
        matchCount++;
      }
    }
    
    return queryTokens.size > 0 ? matchCount / queryTokens.size : 0;
  }
  
  /**
   * 提取高亮片段
   */
  private extractHighlights(query: string, content: string): string[] {
    const tokens = this.tokenize(query);
    const highlights: string[] = [];
    const lowerContent = content.toLowerCase();
    
    for (const token of tokens) {
      const index = lowerContent.indexOf(token);
      if (index !== -1) {
        const start = Math.max(0, index - 20);
        const end = Math.min(content.length, index + token.length + 20);
        highlights.push(content.slice(start, end));
      }
    }
    
    return highlights.slice(0, 3);
  }
  
  /**
   * 分词
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }
}

// ============ 单例管理 ============

let globalStore: UnifiedStore | null = null;

/**
 * 获取全局统一存储
 */
export function getUnifiedStore(config?: Partial<UnifiedStoreConfig>): UnifiedStore {
  if (!globalStore) {
    globalStore = new UnifiedStore(config);
  }
  return globalStore;
}

/**
 * 重置统一存储
 */
export function resetUnifiedStore(): void {
  globalStore = null;
}