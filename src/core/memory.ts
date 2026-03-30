/**
 * 三层记忆架构
 * 
 * Layer 1: 工作记忆 (daily) - 每日笔记，自动加载最近 3 天
 * Layer 2: 结构化记忆 (profiles/events) - Agent/用户档案，重要事件
 * Layer 3: 向量记忆 (RAG) - 通过 rag 系统检索历史知识
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { LRUCache, SearchCache } from './cache.js';
import { getMemoryDir } from './config.js';
import type { Config } from './types.js';
import { homedir } from 'node:os';
import type { AdvancedRAGStore } from '../rag/store.js';
import { encode } from 'gpt-tokenizer';

// ============ Token 计数工具 ============

/**
 * 精确计算文本的token数量
 * 使用cl100k_base编码（GPT-4/3.5-turbo使用）
 */
export function countTokens(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  try {
    return encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

/**
 * 截断文本到指定token数量
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  if (!text || maxTokens <= 0) return '';
  
  const tokens = encode(text);
  if (tokens.length <= maxTokens) return text;
  
  // 解码前maxTokens个token
  const { decode } = require('gpt-tokenizer');
  return decode(tokens.slice(0, maxTokens));
}

// ============ RAG 同步接口 ============

/**
 * RAG 同步处理器
 */
export interface RAGSyncHandler {
  syncToRAG(entry: MemoryEntry): Promise<void>;
}

// ============ 类型定义 ============

/**
 * 记忆条目
 */
export interface MemoryEntry {
  /** 时间戳 */
  timestamp: string;
  /** 类型 */
  type: 'conversation' | 'task' | 'knowledge' | 'event' | 'preference';
  /** 内容 */
  content: string;
  /** 重要性 (1-5) */
  importance: number;
  /** 标签 */
  tags?: string[];
  /** 关联的 Agent */
  agentId?: string;
  /** 是否已同步到 RAG */
  ragSynced?: boolean;
  /** 置信度 (0-1)，用于事实类记忆 */
  confidence?: number;
}

/**
 * 记忆事实
 * 结构化的事实存储，支持分类和置信度
 */
export interface MemoryFact {
  /** 唯一ID */
  id: string;
  /** 事实内容 */
  content: string;
  /** 分类: preference/preference/knowledge/context/behavior/goal */
  category: 'preference' | 'knowledge' | 'context' | 'behavior' | 'goal';
  /** 置信度 (0-1) */
  confidence: number;
  /** 创建时间 */
  createdAt: string;
  /** 来源（thread_id或'manual'） */
  source: string;
  /** 标签 */
  tags?: string[];
}

/**
 * 每日记忆
 */
export interface DailyMemory {
  /** 日期 (YYYY-MM-DD) */
  date: string;
  /** Agent ID */
  agentId: string;
  /** 条目列表 */
  entries: MemoryEntry[];
  /** 摘要 */
  summary?: string;
}

/**
 * 记忆段落
 */
export interface MemorySection {
  /** 摘要内容 */
  summary: string;
  /** 更新时间 */
  updatedAt: string;
}

/**
 * 用户档案
 */
export interface UserProfile {
  /** 用户 ID */
  userId: string;
  /** 显示名称 */
  displayName?: string;
  /** 偏好设置 */
  preferences: Record<string, unknown>;
  /** 常用 Agent */
  frequentAgents: string[];
  /** 重要信息（旧格式，保持兼容） */
  keyInfo: Record<string, string>;
  /** 更新时间 */
  updatedAt: string;
  
  // ========== P0 新增字段 ==========
  
  /** 结构化事实列表 */
  facts: MemoryFact[];
  /** 工作上下文 */
  workContext?: MemorySection;
  /** 个人上下文 */
  personalContext?: MemorySection;
  /** 当前关注点 */
  topOfMind?: MemorySection;
  /** 近期历史（1-3个月） */
  recentMonths?: MemorySection;
  /** 更早历史（3-12个月） */
  earlierContext?: MemorySection;
  /** 长期背景 */
  longTermBackground?: MemorySection;
}

/**
 * Agent 档案
 */
export interface AgentProfile {
  /** Agent ID */
  agentId: string;
  /** 名称 */
  name: string;
  /** 角色描述 */
  role: string;
  /** 技能 */
  skills: string[];
  /** 使用统计 */
  stats: {
    totalSessions: number;
    totalMessages: number;
    lastUsed: string;
    /** 总任务数 */
    totalTasks?: number;
    /** 成功任务数 */
    successfulTasks?: number;
    /** 失败任务数 */
    failedTasks?: number;
    /** 平均用户评分 */
    averageUserRating?: number;
  };
  /** 学习到的偏好 */
  learnedPreferences: Record<string, unknown>;
  
  // ========== Self-Improving 扩展 ==========
  
  /** 自我认知 */
  selfAwareness?: {
    /** 自我评估的优势 */
    strengths: string[];
    /** 自我评估的劣势 */
    weaknesses: string[];
    /** 需要改进的领域 */
    improvementAreas: string[];
    /** 擅长的任务类型 */
    preferredTaskTypes: string[];
    /** 不擅长的任务类型 */
    avoidedTaskTypes: string[];
    /** 上次更新时间 */
    updatedAt: string;
  };
  
  /** 能力评分 */
  capabilityScores?: {
    /** 代码能力 (0-100) */
    coding?: number;
    /** 分析能力 (0-100) */
    analysis?: number;
    /** 沟通能力 (0-100) */
    communication?: number;
    /** 创造力 (0-100) */
    creativity?: number;
    /** 准确性 (0-100) */
    accuracy?: number;
    /** 响应速度评分 (0-100) */
    responsiveness?: number;
    /** 最后更新时间 */
    updatedAt: string;
  };
  
  /** 最后反思时间 */
  lastReflectionAt?: string;
}

/**
 * 事件记录
 */
export interface EventRecord {
  /** 时间戳 */
  timestamp: string;
  /** 事件类型 */
  type: 'created' | 'updated' | 'deleted' | 'learned' | 'error' | 'milestone';
  /** 实体类型 */
  entityType: 'agent' | 'file' | 'config' | 'knowledge';
  /** 实体 ID */
  entityId: string;
  /** 描述 */
  description: string;
  /** 相关数据 */
  data?: Record<string, unknown>;
}

/**
 * 记忆配置
 */
export interface MemoryConfig {
  /** 存储根目录 */
  rootDir: string;
  /** 工作记忆天数 */
  workingMemoryDays: number;
  /** 最大条目数 */
  maxEntriesPerDay: number;
  /** 是否自动摘要 */
  autoSummary: boolean;
  /** 摘要触发阈值（条目数） */
  summaryThreshold: number;
  /** 摘要保留条目数 */
  summaryKeepEntries: number;
  /** 是否启用记忆衰减 */
  enableDecay: boolean;
  /** 衰减系数 (0-1, 越小衰减越快) */
  decayFactor: number;
  /** 自动提取重要信息 */
  autoExtractKeyInfo: boolean;
  /** 是否启用 RAG 自动同步 */
  enableRAGSync: boolean;
  /** RAG 同步最小重要性阈值 (1-5) */
  ragSyncThreshold: number;
  // ========== P0 新增配置 ==========
  /** 最大事实数量 */
  maxFacts: number;
  /** 事实置信度阈值 (0-1) */
  factConfidenceThreshold: number;
  /** 最大注入token数 */
  maxInjectionTokens: number;
  /** 是否启用记忆注入 */
  injectionEnabled: boolean;
}

/**
 * 摘要记录
 */
export interface SummaryRecord {
  /** 摘要ID */
  id: string;
  /** 创建时间 */
  createdAt: string;
  /** 原始条目数 */
  originalCount: number;
  /** 摘要后条目数 */
  summarizedCount: number;
  /** 摘要内容 */
  summary: string;
  /** 关键信息提取 */
  keyInfo: Array<{ key: string; value: string }>;
  /** 时间范围 */
  timeRange: {
    start: string;
    end: string;
  };
}

/**
 * 重要信息模式
 */
export interface KeyInfoPattern {
  /** 模式名称 */
  name: string;
  /** 正则表达式 */
  pattern: RegExp;
  /** 提取函数 */
  extract: (match: RegExpMatchArray) => { key: string; value: string };
}

// ============ 默认配置 ============

const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  rootDir: getMemoryDir(),
  workingMemoryDays: 3,
  maxEntriesPerDay: 100,
  autoSummary: true,
  summaryThreshold: 50,
  summaryKeepEntries: 20,
  enableDecay: true,
  decayFactor: 0.9,
  autoExtractKeyInfo: true,
  enableRAGSync: true,
  ragSyncThreshold: 4,
  // P0 新增配置
  maxFacts: 100,
  factConfidenceThreshold: 0.7,
  maxInjectionTokens: 2000,
  injectionEnabled: true,
};

// ============ 智能重要性评估 ============

/**
 * 重要性评估规则
 */
interface ImportanceRule {
  /** 规则名称 */
  name: string;
  /** 匹配函数 */
  match: (content: string, type: MemoryEntry['type']) => boolean;
  /** 分数调整 */
  score: number;
}

const IMPORTANCE_RULES: ImportanceRule[] = [
  // 类型加权
  { name: 'knowledge_type', match: (_, type) => type === 'knowledge', score: 2 },
  { name: 'preference_type', match: (_, type) => type === 'preference', score: 2 },
  { name: 'event_type', match: (_, type) => type === 'event', score: 1 },
  { name: 'task_type', match: (_, type) => type === 'task', score: 1 },
  
  // 关键词：明确要求记住
  { name: 'explicit_remember', match: (c) => /^(记住|记得|保存|记录|别忘了)/.test(c), score: 2 },
  { name: 'important_keywords', match: (c) => /重要|关键|必须|一定要/.test(c), score: 1 },
  
  // 配置/偏好相关
  { name: 'preference_keywords', match: (c) => /我喜欢|我偏好|我习惯|我的/.test(c), score: 1 },
  { name: 'config_keywords', match: (c) => /配置|设置|选项|参数/.test(c), score: 1 },
  
  // 项目/路径相关
  { name: 'project_keywords', match: (c) => /项目|工程|仓库/.test(c), score: 1 },
  { name: 'path_pattern', match: (c) => /[/\\][\w-.]+/.test(c), score: 1 },
  
  // 高风险操作
  { name: 'dangerous_keywords', match: (c) => /删除|移除|清空|格式化/.test(c), score: 1 },
  
  // 决策相关
  { name: 'decision_keywords', match: (c) => /决定|选择|方案|架构/.test(c), score: 1 },
  
  // 复杂任务
  { name: 'complex_keywords', match: (c) => /重构|迁移|部署|设计|实现/.test(c), score: 1 },
  
  // 时间相关
  { name: 'schedule_keywords', match: (c) => /明天|下周|日期|时间|计划/.test(c), score: 1 },
];

/**
 * 智能评估记忆重要性
 * 
 * @param content 记忆内容
 * @param type 记忆类型
 * @returns 重要性分数 (1-5)
 */
export function assessImportance(content: string, type: MemoryEntry['type']): number {
  let score = 3; // 基础分

  // 应用规则
  for (const rule of IMPORTANCE_RULES) {
    if (rule.match(content, type)) {
      score += rule.score;
    }
  }

  // 内容长度加权（长内容可能更重要）
  if (content.length > 500) score += 1;
  if (content.length < 50) score -= 1;

  // 限制在 1-5 范围
  return Math.min(5, Math.max(1, score));
}

/**
 * 重要信息提取模式
 */
const KEY_INFO_PATTERNS: KeyInfoPattern[] = [
  {
    name: 'remember_explicit',
    pattern: /(?:记住|记得|保存|记录)[：:]\s*(.+?)\s*[是为]\s*(.+)/i,
    extract: (match) => ({ 
      key: (match[1] ?? '').trim(), 
      value: (match[2] ?? '').trim() 
    }),
  },
  {
    name: 'project_path',
    pattern: /(?:项目|工程)(?:路径|目录|位置)[是为：:]\s*(\/[^\s]+)/i,
    extract: (match) => ({ key: '项目路径', value: (match[1] ?? '').trim() }),
  },
  {
    name: 'preference',
    pattern: /(?:我喜欢|我偏好|我习惯)(.+?)(?:，|。|$)/i,
    extract: (match) => ({ key: '用户偏好', value: (match[1] ?? '').trim() }),
  },
  {
    name: 'config',
    pattern: /(?:配置|设置)[是为：:]\s*(.+?)\s*=\s*(.+)/i,
    extract: (match) => ({ 
      key: (match[1] ?? '').trim(), 
      value: (match[2] ?? '').trim() 
    }),
  },
  {
    name: 'deadline',
    pattern: /(?:截止|到期|最后)日期[是为：:]\s*(.+)/i,
    extract: (match) => ({ key: '截止日期', value: (match[1] ?? '').trim() }),
  },
];

// ============ 记忆管理器 ============

/**
 * 三层记忆管理器
 */
export class MemoryManager {
  private config: MemoryConfig;
  private dailyCache: LRUCache<string, DailyMemory>;
  private searchCache: SearchCache;
  private contextSummaryCache: LRUCache<string, { summary: string; timestamp: number }>;
  private userProfile: UserProfile | null = null;
  private agentProfiles: Map<string, AgentProfile> = new Map();
  private initialized: boolean = false;
  private summaryHistory: Map<string, SummaryRecord[]> = new Map();
  private ragStore: AdvancedRAGStore | null = null;
  // 内存清理配置
  private maxAgentProfiles: number = 100;
  private lastCleanupTime: number = 0;
  private cleanupIntervalMs: number = 60 * 60 * 1000; // 1小时清理一次

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
    // LRU 缓存，最多缓存 50 个每日记忆
    this.dailyCache = new LRUCache(50);
    // 搜索缓存，30秒过期
    this.searchCache = new SearchCache(30, 30000);
    // 上下文摘要缓存
    this.contextSummaryCache = new LRUCache(10);
  }

  /**
   * 定期清理内存，防止内存泄漏
   */
  private maybeCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanupTime < this.cleanupIntervalMs) return;
    
    this.lastCleanupTime = now;
    
    // 清理 agentProfiles（保留最近使用的）
    if (this.agentProfiles.size > this.maxAgentProfiles) {
      const entries = Array.from(this.agentProfiles.entries())
        .sort((a, b) => {
          const aTime = a[1].stats?.lastUsed ? new Date(a[1].stats.lastUsed).getTime() : 0;
          const bTime = b[1].stats?.lastUsed ? new Date(b[1].stats.lastUsed).getTime() : 0;
          return bTime - aTime;
        });
      
      // 保留前 maxAgentProfiles 个
      this.agentProfiles = new Map(entries.slice(0, this.maxAgentProfiles));
    }
    
    // 清理 summaryHistory（保留最近 30 天）
    const cutoffDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
    for (const [key, records] of this.summaryHistory) {
      const filtered = records.filter(r => new Date(r.createdAt) > cutoffDate);
      if (filtered.length === 0) {
        this.summaryHistory.delete(key);
      } else if (filtered.length < records.length) {
        this.summaryHistory.set(key, filtered);
      }
    }
  }

  /**
   * 设置 RAG 存储（用于自动同步重要记忆）
   */
  setRAGStore(store: AdvancedRAGStore | null): void {
    this.ragStore = store;
  }

  /**
   * 获取 RAG 存储
   */
  getRAGStore(): AdvancedRAGStore | null {
    return this.ragStore;
  }

  /**
   * 初始化记忆系统
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // 确保记忆目录存在
      // 所有记忆文件都在 rootDir 下
      const memoryDir = this.config.rootDir;
      const dirs = [
        join(memoryDir, 'daily'),
        join(memoryDir, 'profiles'),
        join(memoryDir, 'events'),
        join(memoryDir, 'summaries'),
      ];
      for (const dir of dirs) {
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
      }

      // 加载工作记忆
      await this.loadWorkingMemory();
      
      // 加载用户档案
      await this.loadUserProfile();
      
      // 加载 Agent 档案
      await this.loadAgentProfiles();
      
      // 加载摘要历史
      await this.loadSummaryHistory();

      this.initialized = true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`MemoryManager initialize error: ${errorMsg}`);
      // 即使初始化失败，也标记为已初始化，避免重复尝试
      this.initialized = true;
    }
  }

  // ============ Layer 1: 工作记忆 ============

  /**
   * 记录记忆条目
   * @param agentId Agent ID
   * @param content 记忆内容
   * @param type 记忆类型
   * @param importance 重要性（可选，默认智能评估）
   * @param tags 标签
   */
  async remember(
    agentId: string,
    content: string,
    type: MemoryEntry['type'] = 'conversation',
    importance?: number,
    tags?: string[]
  ): Promise<void> {
    if (!this.initialized) await this.initialize();
    
    // 定期清理内存
    this.maybeCleanup();

    // 智能评估重要性（如果未指定）
    const finalImportance = importance ?? assessImportance(content, type);

    const today = new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);
    const memory = await this.getDailyMemory(today, agentId);

    const entry: MemoryEntry = {
      timestamp: new Date().toISOString(),
      type,
      content,
      importance: finalImportance,
      tags,
      agentId,
    };

    memory.entries.push(entry);

    // 限制条目数量
    if (memory.entries.length > this.config.maxEntriesPerDay) {
      // 移除低重要性的条目
      memory.entries.sort((a, b) => b.importance - a.importance);
      memory.entries = memory.entries.slice(0, this.config.maxEntriesPerDay);
    }

    // 保存
    await this.saveDailyMemory(memory);
    
    // 自动提取重要信息
    if (this.config.autoExtractKeyInfo) {
      await this.extractKeyInfoFromContent(content);
    }
    
    // 自动同步到 RAG（仅限重要记忆）
    // 只同步 knowledge/preference/event 类型，避免琐碎操作污染 RAG
    const shouldSyncToRAG = 
      this.config.enableRAGSync &&
      finalImportance >= this.config.ragSyncThreshold &&
      this.ragStore &&
      ['knowledge', 'preference', 'event'].includes(type);
    
    if (shouldSyncToRAG) {
      await this.syncToRAG(entry);
    }
    
    // 检查是否需要自动摘要
    if (this.config.autoSummary && memory.entries.length >= this.config.summaryThreshold) {
      await this.autoSummarize(today, agentId);
    }
  }

  /**
   * 同步记忆条目到 RAG
   */
  private async syncToRAG(entry: MemoryEntry): Promise<void> {
    if (!this.ragStore) return;

    try {
      // 格式化为文档
      const doc = this.formatEntryAsDocument(entry);
      
      await this.ragStore.addDocument(doc.content, {
        source: `memory://${entry.type}/${entry.timestamp}`,
        title: doc.title,
      });
      
      // 标记已同步
      entry.ragSynced = true;
      
      console.log(`[Memory] 已同步到 RAG: ${doc.title}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[Memory] RAG 同步失败: ${msg}`);
    }
  }

  /**
   * 格式化记忆条目为文档
   */
  private formatEntryAsDocument(entry: MemoryEntry): { title: string; content: string } {
    const typeLabels: Record<string, string> = {
      conversation: '对话',
      task: '任务',
      knowledge: '知识',
      event: '事件',
      preference: '偏好',
    };

    const typeLabel = typeLabels[entry.type] || entry.type;
    const tags = entry.tags?.length ? ` [${entry.tags.join(', ')}]` : '';
    const title = `[${typeLabel}]${tags} ${entry.content.slice(0, 50)}...`;

    const content = `# ${typeLabel}记忆

**时间**: ${entry.timestamp}
**重要性**: ${entry.importance}/5
**Agent**: ${entry.agentId || '未知'}
${entry.tags?.length ? `**标签**: ${entry.tags.join(', ')}` : ''}

## 内容

${entry.content}
`;

    return { title, content };
  }

  /**
   * 手动将内容存入 RAG
   */
  async rememberToRAG(
    content: string,
    title?: string,
    tags?: string[]
  ): Promise<{ success: boolean; message: string }> {
    if (!this.ragStore) {
      return { success: false, message: 'RAG 存储未配置' };
    }

    try {
      const docTitle = title || `用户记忆 - ${new Date().toLocaleDateString('zh-CN')}`;
      const docContent = tags?.length 
        ? `标签: ${tags.join(', ')}\n\n${content}`
        : content;

      await this.ragStore.addDocument(docContent, {
        source: `user-memory://${Date.now()}`,
        title: docTitle,
      });

      // 同时记录到记忆系统
      await this.remember(
        'system',
        content,
        'knowledge',
        5,  // 最高重要性
        tags
      );

      return { success: true, message: `已记住: ${docTitle}` };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `存储失败: ${msg}` };
    }
  }

  /**
   * 获取工作记忆（最近 N 天）
   */
  async getWorkingMemory(agentId?: string): Promise<MemoryEntry[]> {
    if (!this.initialized) await this.initialize();

    const entries: MemoryEntry[] = [];
    const dates = this.getRecentDates(this.config.workingMemoryDays);

    for (const date of dates) {
      const dailyMemories = await this.loadDailyMemoriesForDate(date);
      for (const memory of dailyMemories) {
        if (!agentId || memory.agentId === agentId) {
          entries.push(...memory.entries);
        }
      }
    }

    // 按重要性排序
    entries.sort((a, b) => b.importance - a.importance);
    
    return entries;
  }

  /**
   * 获取每日记忆
   */
  private async getDailyMemory(date: string, agentId: string): Promise<DailyMemory> {
    const key = `${date}:${agentId}`;
    
    if (this.dailyCache.has(key)) {
      return this.dailyCache.get(key)!;
    }

    // 尝试加载
    const memory = await this.loadDailyMemory(date, agentId);
    if (memory) {
      this.dailyCache.set(key, memory);
      return memory;
    }

    // 创建新的
    const newMemory: DailyMemory = {
      date,
      agentId,
      entries: [],
    };
    this.dailyCache.set(key, newMemory);
    return newMemory;
  }

  /**
   * 加载每日记忆
   */
  private async loadDailyMemory(date: string, agentId: string): Promise<DailyMemory | null> {
    const filePath = join(this.config.rootDir, 'daily', `${date}_${agentId}.json`);
    if (!existsSync(filePath)) return null;

    try {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as DailyMemory;
    } catch {
      return null;
    }
  }

  /**
   * 加载某天的所有每日记忆
   */
  private async loadDailyMemoriesForDate(date: string): Promise<DailyMemory[]> {
    const dailyDir = join(this.config.rootDir, 'daily');
    if (!existsSync(dailyDir)) return [];

    const memories: DailyMemory[] = [];
    const files = readdirSync(dailyDir).filter(f => f.startsWith(date));

    for (const file of files) {
      try {
        const content = readFileSync(join(dailyDir, file), 'utf-8');
        memories.push(JSON.parse(content) as DailyMemory);
      } catch {
        // 忽略
      }
    }

    return memories;
  }

  /**
   * 保存每日记忆
   */
  private async saveDailyMemory(memory: DailyMemory): Promise<void> {
    const filePath = join(this.config.rootDir, 'daily', `${memory.date}_${memory.agentId}.json`);
    writeFileSync(filePath, JSON.stringify(memory, null, 2), 'utf-8');
  }

  /**
   * 加载工作记忆
   */
  private async loadWorkingMemory(): Promise<void> {
    const dates = this.getRecentDates(this.config.workingMemoryDays);
    for (const date of dates) {
      const memories = await this.loadDailyMemoriesForDate(date);
      for (const memory of memories) {
        const key = `${memory.date}:${memory.agentId}`;
        this.dailyCache.set(key, memory);
      }
    }
  }

  // ============ Layer 2: 结构化记忆 ============

  /**
   * 加载用户档案
   */
  private async loadUserProfile(): Promise<void> {
    const filePath = join(this.config.rootDir, 'profiles', 'user.json');
    if (!existsSync(filePath)) {
      this.userProfile = {
        userId: 'default',
        preferences: {},
        frequentAgents: [],
        keyInfo: {},
        facts: [],
        updatedAt: new Date().toISOString(),
      };
      return;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      this.userProfile = JSON.parse(content) as UserProfile;
      if (!this.userProfile.keyInfo) {
        this.userProfile.keyInfo = {};
      }
      if (!this.userProfile.facts) {
        this.userProfile.facts = [];
      }
    } catch {
      this.userProfile = {
        userId: 'default',
        preferences: {},
        frequentAgents: [],
        keyInfo: {},
        facts: [],
        updatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * 保存用户档案
   */
  async saveUserProfile(): Promise<void> {
    if (!this.userProfile) return;
    
    this.userProfile.updatedAt = new Date().toISOString();
    const filePath = join(this.config.rootDir, 'profiles', 'user.json');
    writeFileSync(filePath, JSON.stringify(this.userProfile, null, 2), 'utf-8');
  }

  /**
   * 获取用户档案
   */
  getUserProfile(): UserProfile | null {
    return this.userProfile;
  }

  /**
   * 更新用户偏好
   */
  async setUserPreference(key: string, value: unknown): Promise<void> {
    if (!this.userProfile) await this.loadUserProfile();
    
    this.userProfile!.preferences[key] = value;
    await this.saveUserProfile();
  }

  /**
   * 记录关键信息
   */
  async rememberKeyInfo(key: string, value: string): Promise<void> {
    if (!this.userProfile) {
      await this.loadUserProfile();
      if (!this.userProfile) {
        this.userProfile = {
          userId: 'default',
          preferences: {},
          keyInfo: {},
          frequentAgents: [],
          facts: [],
          updatedAt: new Date().toISOString(),
        };
      }
    }
    
    if (!this.userProfile.keyInfo) {
      this.userProfile.keyInfo = {};
    }
    this.userProfile.keyInfo[key] = value;
    await this.saveUserProfile();
    
    await this.remember('system', `记住: ${key} = ${value}`, 'knowledge', 5, ['key-info']);
  }

  /**
   * 加载 Agent 档案
   */
  private async loadAgentProfiles(): Promise<void> {
    const profileDir = join(this.config.rootDir, 'profiles');
    if (!existsSync(profileDir)) return;

    const files = readdirSync(profileDir).filter(f => f.startsWith('agent_'));
    for (const file of files) {
      try {
        const content = readFileSync(join(profileDir, file), 'utf-8');
        const profile = JSON.parse(content) as AgentProfile;
        this.agentProfiles.set(profile.agentId, profile);
      } catch {
        // 忽略
      }
    }
  }

  /**
   * 获取或创建 Agent 档案
   */
  async getAgentProfile(agentId: string, name?: string): Promise<AgentProfile> {
    if (this.agentProfiles.has(agentId)) {
      return this.agentProfiles.get(agentId)!;
    }

    // 创建新档案
    const profile: AgentProfile = {
      agentId,
      name: name ?? agentId,
      role: '',
      skills: [],
      stats: {
        totalSessions: 0,
        totalMessages: 0,
        lastUsed: new Date().toISOString(),
      },
      learnedPreferences: {},
    };

    this.agentProfiles.set(agentId, profile);
    await this.saveAgentProfile(profile);
    
    return profile;
  }

  /**
   * 保存 Agent 档案
   */
  async saveAgentProfile(profile: AgentProfile): Promise<void> {
    const filePath = join(this.config.rootDir, 'profiles', `agent_${profile.agentId}.json`);
    writeFileSync(filePath, JSON.stringify(profile, null, 2), 'utf-8');
    this.agentProfiles.set(profile.agentId, profile);
  }

  /**
   * 更新 Agent 使用统计
   */
  async recordAgentUsage(agentId: string, messageCount: number = 1): Promise<void> {
    const profile = await this.getAgentProfile(agentId);
    profile.stats.totalSessions++;
    profile.stats.totalMessages += messageCount;
    profile.stats.lastUsed = new Date().toISOString();
    await this.saveAgentProfile(profile);

    if (this.userProfile) {
      if (!this.userProfile.frequentAgents.includes(agentId)) {
        this.userProfile.frequentAgents.push(agentId);
        if (this.userProfile.frequentAgents.length > 5) {
          this.userProfile.frequentAgents.shift();
        }
        await this.saveUserProfile();
      }
    }
  }

  // ============ P0: 事实管理（置信度+去重） ============

  /**
   * 生成事实ID
   */
  private generateFactId(): string {
    return `fact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * 规范化事实内容（用于去重比较）
   */
  private normalizeFactContent(content: string): string {
    const normalized = content.trim().toLowerCase().replace(/\s+/g, ' ');
    return normalized.replace(/\s/g, '');
  }

  private extractCoreKeywords(content: string): string[] {
    const normalized = content.trim().toLowerCase().replace(/\s+/g, ' ');
    const keywords: string[] = [];
    
    const techPatterns = [
      /python|c\+\+|java|javascript|go|rust|typescript|node|react|vue|angular/gi,
      /开发|developer|programmer|工程师|expert|专家/gi,
      /前端|backend|后端|fullstack|全栈/gi,
    ];
    
    for (const pattern of techPatterns) {
      const matches = normalized.match(pattern);
      if (matches) {
        keywords.push(...matches.map(m => m.toLowerCase()));
      }
    }
    
    return keywords.sort();
  }

  private calculateSimilarity(content1: string, content2: string): number {
    const keywords1 = this.extractCoreKeywords(content1);
    const keywords2 = this.extractCoreKeywords(content2);
    
    if (keywords1.length === 0 || keywords2.length === 0) {
      return 0;
    }
    
    const commonKeywords = keywords1.filter(k => keywords2.includes(k));
    const maxLen = Math.max(keywords1.length, keywords2.length);
    
    return commonKeywords.length / maxLen;
  }

  private findExistingFactIndex(content: string): number {
    if (!this.userProfile?.facts) return -1;
    
    const normalizedNew = this.normalizeFactContent(content);
    
    return this.userProfile.facts.findIndex(fact => {
      const normalizedExisting = this.normalizeFactContent(fact.content);
      
      if (normalizedNew === normalizedExisting) {
        return true;
      }
      
      const similarity = this.calculateSimilarity(content, fact.content);
      return similarity >= 0.6;
    });
  }

  /**
   * 验证置信度值
   */
  private validateConfidence(confidence: number): number {
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      return 0.5;
    }
    return Math.round(confidence * 1000) / 1000;
  }

  /**
   * 添加事实（自动去重）
   */
  async addFact(
    content: string,
    category: MemoryFact['category'] = 'context',
    confidence: number = 0.5,
    source: string = 'manual',
    tags?: string[]
  ): Promise<MemoryFact> {
    if (!this.initialized) await this.initialize();
    
    const normalizedContent = content.trim();
    if (!normalizedContent) {
      throw new Error('事实内容不能为空');
    }

    const validatedConfidence = this.validateConfidence(confidence);
    
    if (validatedConfidence < this.config.factConfidenceThreshold) {
      throw new Error(`置信度 ${validatedConfidence} 低于阈值 ${this.config.factConfidenceThreshold}`);
    }

    if (!this.userProfile) {
      await this.loadUserProfile();
    }

    if (!this.userProfile!.facts) {
      this.userProfile!.facts = [];
    }

    const existingIndex = this.findExistingFactIndex(normalizedContent);
    
    if (existingIndex >= 0) {
      const existingFact = this.userProfile!.facts[existingIndex]!;
      if (validatedConfidence > existingFact.confidence) {
        existingFact.confidence = validatedConfidence;
        existingFact.source = source;
        await this.saveUserProfile();
      }
      return existingFact;
    }

    const now = new Date().toISOString();
    const newFact: MemoryFact = {
      id: this.generateFactId(),
      content: normalizedContent,
      category,
      confidence: validatedConfidence,
      createdAt: now,
      source,
      tags,
    };

    this.userProfile!.facts.push(newFact);
    
    await this.enforceMaxFacts();
    await this.saveUserProfile();

    return newFact;
  }

  /**
   * 删除事实
   */
  async deleteFact(factId: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    
    if (!this.userProfile?.facts) return false;

    const index = this.userProfile.facts.findIndex(f => f.id === factId);
    if (index < 0) return false;

    this.userProfile.facts.splice(index, 1);
    await this.saveUserProfile();
    
    return true;
  }

  /**
   * 更新事实
   */
  async updateFact(
    factId: string,
    updates: Partial<Pick<MemoryFact, 'content' | 'category' | 'confidence' | 'tags'>>
  ): Promise<MemoryFact | null> {
    if (!this.initialized) await this.initialize();
    
    if (!this.userProfile?.facts) return null;

    const fact = this.userProfile.facts.find(f => f.id === factId);
    if (!fact) return null;

    if (updates.content !== undefined) {
      const normalizedContent = updates.content.trim();
      if (!normalizedContent) {
        throw new Error('事实内容不能为空');
      }
      fact.content = normalizedContent;
    }

    if (updates.category !== undefined) {
      fact.category = updates.category;
    }

    if (updates.confidence !== undefined) {
      fact.confidence = this.validateConfidence(updates.confidence);
    }

    if (updates.tags !== undefined) {
      fact.tags = updates.tags;
    }

    await this.saveUserProfile();
    
    return fact;
  }

  /**
   * 获取所有事实（按置信度排序）
   */
  getFacts(options?: {
    category?: MemoryFact['category'];
    minConfidence?: number;
    limit?: number;
  }): MemoryFact[] {
    if (!this.userProfile?.facts) return [];

    let facts = [...this.userProfile.facts];

    if (options?.category) {
      facts = facts.filter(f => f.category === options.category);
    }

    if (options?.minConfidence !== undefined) {
      facts = facts.filter(f => f.confidence >= options.minConfidence!);
    }

    facts.sort((a, b) => b.confidence - a.confidence);

    if (options?.limit) {
      facts = facts.slice(0, options.limit);
    }

    return facts;
  }

  /**
   * 强制执行最大事实数量限制
   */
  private async enforceMaxFacts(): Promise<void> {
    if (!this.userProfile?.facts) return;

    if (this.userProfile.facts.length > this.config.maxFacts) {
      this.userProfile.facts.sort((a, b) => b.confidence - a.confidence);
      this.userProfile.facts = this.userProfile.facts.slice(0, this.config.maxFacts);
    }
  }

  // ============ Layer 2: 事件记录 ============

  /**
   * 记录事件
   */
  async recordEvent(event: Omit<EventRecord, 'timestamp'>): Promise<void> {
    if (!this.initialized) await this.initialize();

    const fullEvent: EventRecord = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    // 追加到事件日志
    const logPath = join(this.config.rootDir, 'events', 'events.log');
    const logLine = JSON.stringify(fullEvent) + '\n';
    appendFileSync(logPath, logLine, 'utf-8');

    // 如果是重要事件，也记录到每日记忆
    if (event.type === 'milestone' || event.type === 'error') {
      await this.remember(
        'system',
        event.description,
        'event',
        event.type === 'error' ? 4 : 5,
        [event.type, event.entityType]
      );
    }
  }

  /**
   * 获取最近事件
   */
  async getRecentEvents(limit: number = 50): Promise<EventRecord[]> {
    const logPath = join(this.config.rootDir, 'events', 'events.log');
    if (!existsSync(logPath)) return [];

    try {
      const content = readFileSync(logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      
      return lines
        .slice(-limit)
        .map(line => {
          try {
            return JSON.parse(line) as EventRecord;
          } catch {
            return null;
          }
        })
        .filter((e): e is EventRecord => e !== null);
    } catch {
      return [];
    }
  }

  // ============ 记忆检索 ============

  /**
   * 搜索记忆
   */
  async search(query: string, options?: {
    agentId?: string;
    type?: MemoryEntry['type'];
    minImportance?: number;
    days?: number;
  }): Promise<MemoryEntry[]> {
    // 检查缓存
    const cached = this.searchCache.get<MemoryEntry>(query, options as Record<string, unknown>);
    if (cached) {
      return cached;
    }
    
    const entries = await this.getWorkingMemory(options?.agentId);
    
    const queryLower = query.toLowerCase();
    
    const results = entries.filter(entry => {
      // 类型过滤
      if (options?.type && entry.type !== options.type) return false;
      
      // 重要性过滤
      if (options?.minImportance && entry.importance < options.minImportance) return false;
      
      // 内容匹配
      return entry.content.toLowerCase().includes(queryLower) ||
        entry.tags?.some(tag => tag.toLowerCase().includes(queryLower));
    });
    
    // 缓存结果
    this.searchCache.set(query, results, options as Record<string, unknown>);
    
    return results;
  }

  /**
   * 获取上下文摘要（精确token计数）
   */
  async getContextSummary(agentId: string, maxTokens: number = 1000): Promise<string> {
    const cacheKey = `${agentId}:${maxTokens}`;
    const cached = this.contextSummaryCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 60000) {
      return cached.summary;
    }
    
    const entries = await this.getWorkingMemory(agentId);
    const sorted = [...entries].sort((a, b) => b.importance - a.importance);
    
    const sections: string[] = [];
    let totalTokens = 0;

    // 1. 添加用户上下文（最高优先级）
    const userContext = this.formatUserContext();
    if (userContext) {
      const userTokens = countTokens(userContext);
      if (totalTokens + userTokens <= maxTokens) {
        sections.push(userContext);
        totalTokens += userTokens;
      }
    }

    // 2. 添加历史记录
    const historySection = this.formatHistorySection();
    if (historySection) {
      const historyTokens = countTokens(historySection);
      if (totalTokens + historyTokens <= maxTokens) {
        sections.push(historySection);
        totalTokens += historyTokens;
      }
    }

    // 3. 添加事实（按置信度排序）
    const factsSection = this.formatFactsSection(maxTokens - totalTokens);
    if (factsSection) {
      const factsTokens = countTokens(factsSection);
      if (totalTokens + factsTokens <= maxTokens) {
        sections.push(factsSection);
        totalTokens += factsTokens;
      }
    }

    // 4. 添加工作记忆
    const workingMemorySection = this.formatWorkingMemorySection(sorted, maxTokens - totalTokens);
    if (workingMemorySection) {
      sections.push(workingMemorySection);
    }
    
    const summary = sections.join('\n\n');
    
    this.contextSummaryCache.set(cacheKey, { summary, timestamp: Date.now() });

    return summary;
  }

  /**
   * 格式化用户上下文
   */
  private formatUserContext(): string {
    if (!this.userProfile) return '';
    
    const lines: string[] = [];
    
    if (this.userProfile.workContext?.summary) {
      lines.push(`工作: ${this.userProfile.workContext.summary}`);
    }
    if (this.userProfile.personalContext?.summary) {
      lines.push(`个人: ${this.userProfile.personalContext.summary}`);
    }
    if (this.userProfile.topOfMind?.summary) {
      lines.push(`当前关注: ${this.userProfile.topOfMind.summary}`);
    }
    
    return lines.length > 0 ? '用户上下文:\n' + lines.map(l => `- ${l}`).join('\n') : '';
  }

  private formatHistorySection(): string {
    if (!this.userProfile) return '';
    
    const lines: string[] = [];
    
    if (this.userProfile.recentMonths?.summary) {
      lines.push(`近期: ${this.userProfile.recentMonths.summary}`);
    }
    if (this.userProfile.earlierContext?.summary) {
      lines.push(`更早: ${this.userProfile.earlierContext.summary}`);
    }
    if (this.userProfile.longTermBackground?.summary) {
      lines.push(`长期: ${this.userProfile.longTermBackground.summary}`);
    }
    
    return lines.length > 0 ? '历史记录:\n' + lines.map(l => `- ${l}`).join('\n') : '';
  }

  /**
   * 格式化事实部分（精确token预算）
   */
  private formatFactsSection(maxTokens: number): string {
    if (!this.config.injectionEnabled || !this.userProfile?.facts?.length) {
      return '';
    }

    const facts = this.getFacts({ limit: 50 });
    if (facts.length === 0) return '';

    const header = '事实:\n';
    const headerTokens = countTokens(header);
    let remainingTokens = maxTokens - headerTokens;

    if (remainingTokens <= 0) return '';

    const factLines: string[] = [];
    for (const fact of facts) {
      const line = `- [${fact.category} | ${(fact.confidence * 100).toFixed(0)}%] ${fact.content}`;
      const lineTokens = countTokens(line);
      
      if (remainingTokens - lineTokens >= 0) {
        factLines.push(line);
        remainingTokens -= lineTokens;
      } else {
        break;
      }
    }

    return factLines.length > 0 ? header + factLines.join('\n') : '';
  }

  /**
   * 格式化工作记忆部分（精确token预算）
   */
  private formatWorkingMemorySection(entries: MemoryEntry[], maxTokens: number): string {
    if (!entries.length) return '';

    const header = '当前记忆:\n';
    const headerTokens = countTokens(header);
    let remainingTokens = maxTokens - headerTokens;

    if (remainingTokens <= 0) return '';

    const lines: string[] = [];
    for (const entry of entries) {
      const line = `- [${entry.type}] ${entry.content}`;
      const lineTokens = countTokens(line);
      
      if (remainingTokens - lineTokens >= 0) {
        lines.push(line);
        remainingTokens -= lineTokens;
      } else {
        break;
      }
    }

    return lines.length > 0 ? header + lines.join('\n') : '';
  }

  // ============ 工具方法 ============

  /**
   * 获取最近 N 天的日期
   */
  private getRecentDates(days: number): string[] {
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]!);
    }
    return dates;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    dailyMemoryCount: number;
    totalEntries: number;
    agentCount: number;
    eventCount: number;
    summaryCount: number;
  } {
    let totalEntries = 0;
    for (const memory of this.dailyCache.values()) {
      totalEntries += memory.entries.length;
    }

    let summaryCount = 0;
    for (const summaries of this.summaryHistory.values()) {
      summaryCount += summaries.length;
    }

    return {
      dailyMemoryCount: this.dailyCache.size,
      totalEntries,
      agentCount: this.agentProfiles.size,
      eventCount: 0, // 需要读取文件
      summaryCount,
    };
  }

  /**
   * 检查 Agent 是否已初始化记忆
   * 初始化条件：存在 Agent 档案文件 或 存在工作记忆
   */
  async isAgentInitialized(agentId: string): Promise<{
    initialized: boolean;
    hasProfile: boolean;
    hasMemory: boolean;
    hasKeyInfo: boolean;
    missing: string[];
  }> {
    try {
      if (!this.initialized) await this.initialize();

      const missing: string[] = [];
      let hasProfile = false;
      let hasMemory = false;
      let hasKeyInfo = false;

      // 检查 Agent 档案文件是否存在
      const profilePath = join(this.config.rootDir, 'profiles', `agent_${agentId}.json`);
      if (existsSync(profilePath)) {
        hasProfile = true;
      }
      if (!hasProfile) {
        missing.push('Agent 档案');
      }

      // 检查工作记忆是否存在
      const dates = this.getRecentDates(this.config.workingMemoryDays);
      for (const date of dates) {
        try {
          const memory = await this.loadDailyMemory(date, agentId);
          if (memory && memory.entries.length > 0) {
            hasMemory = true;
            break;
          }
        } catch {
          // 忽略加载错误
        }
      }
      if (!hasMemory) {
        missing.push('工作记忆');
      }

      // 检查用户档案中是否有关于此 agent 的关键信息
      if (this.userProfile?.keyInfo && Object.keys(this.userProfile.keyInfo).length > 0) {
        hasKeyInfo = true;
      }

      return {
        initialized: hasProfile || hasMemory || hasKeyInfo,
        hasProfile,
        hasMemory,
        hasKeyInfo,
        missing,
      };
    } catch (error) {
      // 如果发生任何错误，返回未初始化状态而不是抛出异常
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`isAgentInitialized error: ${errorMsg}`);
      return {
        initialized: false,
        hasProfile: false,
        hasMemory: false,
        hasKeyInfo: false,
        missing: ['初始化检查失败: ' + errorMsg],
      };
    }
  }

  /**
   * 初始化 Agent 记忆
   */
  async initializeAgentMemory(agentId: string, agentName: string, role?: string): Promise<void> {
    if (!this.initialized) await this.initialize();

    // 创建 Agent 档案
    const profile = await this.getAgentProfile(agentId, agentName);
    if (role) {
      profile.role = role;
    }
    await this.saveAgentProfile(profile);

    // 创建初始工作记忆
    const today = new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);
    const memory: DailyMemory = {
      date: today,
      agentId,
      entries: [
        {
          timestamp: new Date().toISOString(),
          type: 'event',
          content: `Agent ${agentName} 记忆系统初始化`,
          importance: 3,
          tags: ['init'],
          agentId,
        },
      ],
    };
    await this.saveDailyMemory(memory);
  }

  // ============ 自动摘要系统 ============

  /**
   * 加载摘要历史
   */
  private async loadSummaryHistory(): Promise<void> {
    const summaryDir = join(this.config.rootDir, 'summaries');
    if (!existsSync(summaryDir)) return;

    const files = readdirSync(summaryDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = readFileSync(join(summaryDir, file), 'utf-8');
        const summaries = JSON.parse(content) as SummaryRecord[];
        const key = file.replace('.json', '');
        this.summaryHistory.set(key, summaries);
      } catch {
        // 忽略
      }
    }
  }

  /**
   * 保存摘要历史
   */
  private async saveSummaryHistory(date: string, agentId: string, summaries: SummaryRecord[]): Promise<void> {
    const key = `${date}_${agentId}`;
    const filePath = join(this.config.rootDir, 'summaries', `${key}.json`);
    writeFileSync(filePath, JSON.stringify(summaries, null, 2), 'utf-8');
    this.summaryHistory.set(key, summaries);
  }

  /**
   * 从内容提取重要信息
   */
  private async extractKeyInfoFromContent(content: string): Promise<void> {
    for (const pattern of KEY_INFO_PATTERNS) {
      const match = content.match(pattern.pattern);
      if (match) {
        try {
          const { key, value } = pattern.extract(match);
          await this.rememberKeyInfo(key, value);
        } catch {
          // 忽略提取错误
        }
      }
    }
  }

  /**
   * 自动摘要
   */
  async autoSummarize(date: string, agentId: string): Promise<SummaryRecord | null> {
    const memory = await this.getDailyMemory(date, agentId);
    if (memory.entries.length < this.config.summaryThreshold) {
      return null;
    }

    // 按重要性排序
    const sorted = [...memory.entries].sort((a, b) => b.importance - a.importance);
    
    // 保留高重要性的条目
    const keepEntries = sorted.slice(0, this.config.summaryKeepEntries);
    
    // 需要摘要的条目
    const toSummarize = sorted.slice(this.config.summaryKeepEntries);
    
    if (toSummarize.length === 0) {
      return null;
    }

    // 生成摘要内容
    const summaryContent = this.generateSummaryContent(toSummarize);
    
    // 提取关键信息
    const keyInfo: Array<{ key: string; value: string }> = [];
    for (const entry of toSummarize) {
      await this.extractKeyInfoFromContent(entry.content);
    }
    
    // 从用户档案获取提取的关键信息
    if (this.userProfile?.keyInfo) {
      for (const [k, v] of Object.entries(this.userProfile.keyInfo)) {
        keyInfo.push({ key: k, value: v });
      }
    }

    // 创建摘要记录
    const summaryRecord: SummaryRecord = {
      id: `summary-${Date.now()}`,
      createdAt: new Date().toISOString(),
      originalCount: toSummarize.length,
      summarizedCount: keepEntries.length,
      summary: summaryContent,
      keyInfo: keyInfo.slice(-10), // 保留最近 10 条
      timeRange: {
        start: toSummarize[toSummarize.length - 1]?.timestamp ?? '',
        end: toSummarize[0]?.timestamp ?? '',
      },
    };

    // 更新每日记忆（只保留高重要性条目）
    memory.entries = keepEntries;
    memory.summary = summaryContent;
    await this.saveDailyMemory(memory);

    // 保存摘要历史
    const key = `${date}_${agentId}`;
    const existing = this.summaryHistory.get(key) ?? [];
    existing.push(summaryRecord);
    await this.saveSummaryHistory(date, agentId, existing);

    return summaryRecord;
  }

  /**
   * 生成摘要内容
   */
  private generateSummaryContent(entries: MemoryEntry[]): string {
    // 按类型分组
    const grouped = new Map<string, MemoryEntry[]>();
    for (const entry of entries) {
      const type = entry.type;
      if (!grouped.has(type)) {
        grouped.set(type, []);
      }
      grouped.get(type)!.push(entry);
    }

    const parts: string[] = [];

    // 任务类摘要
    const tasks = grouped.get('task') ?? [];
    if (tasks.length > 0) {
      const completed = tasks.filter(t => t.content.includes('完成') || t.content.includes('成功'));
      const failed = tasks.filter(t => t.content.includes('失败') || t.content.includes('错误'));
      parts.push(`任务: ${completed.length} 个完成, ${failed.length} 个失败`);
    }

    // 对话类摘要
    const conversations = grouped.get('conversation') ?? [];
    if (conversations.length > 0) {
      const topics = this.extractTopics(conversations);
      parts.push(`讨论主题: ${topics.join(', ')}`);
    }

    // 知识类摘要
    const knowledge = grouped.get('knowledge') ?? [];
    if (knowledge.length > 0) {
      const keyPoints = knowledge
        .filter(k => k.importance >= 4)
        .map(k => k.content.slice(0, 50))
        .slice(0, 5);
      if (keyPoints.length > 0) {
        parts.push(`关键知识: ${keyPoints.join('; ')}`);
      }
    }

    // 事件类摘要
    const events = grouped.get('event') ?? [];
    if (events.length > 0) {
      const milestones = events.filter(e => e.importance >= 4);
      parts.push(`重要事件: ${milestones.length} 个`);
    }

    if (parts.length === 0) {
      return `压缩了 ${entries.length} 条记忆记录`;
    }

    return parts.join(' | ');
  }

  /**
   * 提取讨论主题
   */
  private extractTopics(entries: MemoryEntry[]): string[] {
    const keywords = new Map<string, number>();
    
    // 常见主题词
    const topicPatterns = [
      /(?:关于|讨论|分析|设计|实现)(.+?)(?:的|问题|方案|$)/,
      /(.+?)(?:功能|模块|系统|组件)/,
      /(?:问题|错误|bug)[:：]?\s*(.+)/,
    ];

    for (const entry of entries) {
      for (const pattern of topicPatterns) {
        const match = entry.content.match(pattern);
        if (match) {
          const topic = match[1]?.trim() ?? '';
          if (topic.length > 1 && topic.length < 20) {
            keywords.set(topic, (keywords.get(topic) ?? 0) + 1);
          }
        }
      }
    }

    // 返回高频主题
    return Array.from(keywords.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);
  }

  /**
   * 应用记忆衰减
   */
  async applyDecay(): Promise<void> {
    if (!this.config.enableDecay) return;

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    for (const [, memory] of this.dailyCache) {
      let modified = false;
      
      for (const entry of memory.entries) {
        const entryTime = new Date(entry.timestamp).getTime();
        const daysOld = (now - entryTime) / dayMs;
        
        if (daysOld > 1) {
          // 每天衰减一次
          const decayTimes = Math.floor(daysOld);
          const newImportance = entry.importance * Math.pow(this.config.decayFactor, decayTimes);
          
          // 如果重要性降到 1 以下，移除该条目
          if (newImportance < 1) {
            memory.entries = memory.entries.filter(e => e !== entry);
            modified = true;
          } else if (entry.importance !== Math.round(newImportance)) {
            entry.importance = Math.round(newImportance);
            modified = true;
          }
        }
      }
      
      if (modified) {
        await this.saveDailyMemory(memory);
      }
    }
  }

  /**
   * 获取摘要历史
   */
  async getSummaryHistory(date?: string, agentId?: string): Promise<SummaryRecord[]> {
    if (date && agentId) {
      const key = `${date}_${agentId}`;
      return this.summaryHistory.get(key) ?? [];
    }

    // 返回所有摘要
    const all: SummaryRecord[] = [];
    for (const summaries of this.summaryHistory.values()) {
      all.push(...summaries);
    }
    return all.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * 手动触发摘要
   */
  async triggerSummary(agentId?: string): Promise<SummaryRecord[]> {
    const results: SummaryRecord[] = [];
    const today = new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);

    if (agentId) {
      const result = await this.autoSummarize(today, agentId);
      if (result) results.push(result);
    } else {
      // 对所有 Agent 触发摘要
      for (const [key] of this.dailyCache) {
        const [date, aid] = key.split(':');
        if (date && aid) {
          const result = await this.autoSummarize(date, aid);
          if (result) results.push(result);
        }
      }
    }

    return results;
  }

  /**
   * 获取压缩后的上下文（用于大模型输入，精确token计数）
   */
  async getCompressedContext(agentId: string, maxTokens?: number): Promise<string> {
    const budget = maxTokens ?? this.config.maxInjectionTokens;
    
    if (!this.config.injectionEnabled) {
      return '';
    }

    const sections: string[] = [];
    let totalTokens = 0;

    // 1. 用户上下文（最高优先级）
    const userContext = this.formatUserContext();
    if (userContext) {
      const tokens = countTokens(userContext);
      if (totalTokens + tokens <= budget) {
        sections.push('## 用户上下文\n' + userContext);
        totalTokens += tokens;
      }
    }

    // 2. 事实（按置信度排序）
    const factsSection = this.formatFactsSection(budget - totalTokens);
    if (factsSection) {
      const tokens = countTokens(factsSection);
      if (totalTokens + tokens <= budget) {
        sections.push('## ' + factsSection);
        totalTokens += tokens;
      }
    }

    // 3. 近期摘要
    const today = new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);
    const summaries = await this.getSummaryHistory(today, agentId);
    
    if (summaries.length > 0) {
      const summarySection = this.formatSummariesSection(summaries, budget - totalTokens);
      if (summarySection) {
        const tokens = countTokens(summarySection);
        if (totalTokens + tokens <= budget) {
          sections.push(summarySection);
          totalTokens += tokens;
        }
      }
    }

    // 4. 当前工作记忆
    const entries = await this.getWorkingMemory(agentId);
    const sorted = [...entries].sort((a, b) => b.importance - a.importance);
    
    const workingMemorySection = this.formatWorkingMemorySection(sorted, budget - totalTokens);
    if (workingMemorySection) {
      sections.push('## ' + workingMemorySection);
    }

    return sections.join('\n\n');
  }

  /**
   * 格式化摘要部分
   */
  private formatSummariesSection(summaries: SummaryRecord[], maxTokens: number): string {
    if (!summaries.length || maxTokens <= 0) return '';

    const header = '## 近期摘要\n';
    const headerTokens = countTokens(header);
    let remainingTokens = maxTokens - headerTokens;

    if (remainingTokens <= 0) return '';

    const lines: string[] = [];
    for (const summary of summaries.slice(0, 3)) {
      let line = `- ${summary.summary}`;
      if (summary.keyInfo.length > 0) {
        line += `\n  关键信息: ${summary.keyInfo.map(k => `${k.key}=${k.value}`).join(', ')}`;
      }
      
      const lineTokens = countTokens(line);
      if (remainingTokens - lineTokens >= 0) {
        lines.push(line);
        remainingTokens -= lineTokens;
      } else {
        break;
      }
    }

    return lines.length > 0 ? header + lines.join('\n') : '';
  }

  // ============ 内存管理 ============

  /**
   * 清理缓存（用于内存清理）
   */
  clearCache(): void {
    this.dailyCache.clear();
    this.searchCache.clear();
    this.contextSummaryCache.clear();
    // 清除部分 agent profiles 缓存（保留最近使用的）
    if (this.agentProfiles.size > 10) {
      const keys = Array.from(this.agentProfiles.keys()).slice(0, this.agentProfiles.size - 10);
      for (const key of keys) {
        this.agentProfiles.delete(key);
      }
    }
  }
}

// ============ 全局实例 ============

let globalMemoryManager: MemoryManager | null = null;
let globalMemoryConfig: Partial<MemoryConfig> | null = null;

/**
 * 获取记忆管理器
 * @param configOrRootDir 可选：Config 对象、MemoryConfig 或 memory 目录路径
 * 
 * 注意：如果不传参数，将返回已存在的实例（如果有），或使用默认路径创建新实例。
 * 传入参数时，如果与现有配置不同，会发出警告。
 */
export function getMemoryManager(configOrRootDir?: Partial<MemoryConfig> | Config | string): MemoryManager {
  // 如果没有传参数，直接返回已存在的实例
  if (!configOrRootDir && globalMemoryManager) {
    return globalMemoryManager;
  }
  
  let memoryConfig: Partial<MemoryConfig> = {};
  
  if (typeof configOrRootDir === 'string') {
    memoryConfig = { rootDir: configOrRootDir };
  } else if (configOrRootDir && 'agents' in configOrRootDir && 'model' in configOrRootDir) {
    const config = configOrRootDir as Config;
    memoryConfig = { rootDir: getMemoryDir(config) };
  } else if (configOrRootDir) {
    memoryConfig = configOrRootDir as Partial<MemoryConfig>;
  } else {
    memoryConfig = { rootDir: join(homedir(), '.securebot', 'memory') };
  }
  
  if (!globalMemoryManager) {
    globalMemoryManager = new MemoryManager(memoryConfig);
    globalMemoryConfig = memoryConfig;
  } else if (configOrRootDir && globalMemoryConfig && memoryConfig.rootDir && globalMemoryConfig.rootDir !== memoryConfig.rootDir) {
    // 只有传了参数且配置不同时才发出警告
    console.warn(`[MemoryManager] 配置已变化: ${globalMemoryConfig.rootDir} -> ${memoryConfig.rootDir}`);
    console.warn('[MemoryManager] 如需使用新配置，请调用 reconfigureMemoryManager() 或 resetMemoryManager()');
  }
  
  return globalMemoryManager;
}

/**
 * 重置记忆管理器（用于重新加载配置）
 */
export function resetMemoryManager(): void {
  globalMemoryManager = null;
  globalMemoryConfig = null;
}

/**
 * 重新配置记忆管理器（热更新配置）
 * @param configOrRootDir 新的配置
 */
export function reconfigureMemoryManager(configOrRootDir?: Partial<MemoryConfig> | Config | string): MemoryManager {
  resetMemoryManager();
  return getMemoryManager(configOrRootDir);
}

/**
 * 获取当前记忆管理器的配置
 */
export function getMemoryManagerConfig(): Partial<MemoryConfig> | null {
  return globalMemoryConfig;
}