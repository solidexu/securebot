/**
 * 三层记忆架构
 * 
 * Layer 1: 工作记忆 (daily) - 每日笔记，自动加载最近 3 天
 * Layer 2: 结构化记忆 (profiles/events) - Agent/用户档案，重要事件
 * Layer 3: 向量记忆 (RAG) - 通过 rag 系统检索历史知识
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { getMemoryDir } from './config.js';

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
  /** 重要信息 */
  keyInfo: Record<string, string>;
  /** 更新时间 */
  updatedAt: string;
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
  };
  /** 学习到的偏好 */
  learnedPreferences: Record<string, unknown>;
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
  summaryThreshold: 50,  // 超过 50 条触发摘要
  summaryKeepEntries: 20, // 摘要后保留 20 条
  enableDecay: true,
  decayFactor: 0.9,      // 每天衰减 10%
  autoExtractKeyInfo: true,
};

/**
 * 重要信息提取模式
 */
const KEY_INFO_PATTERNS: KeyInfoPattern[] = [
  {
    name: 'remember_explicit',
    pattern: /(?:记住|记得|保存|记录)[：:]\s*(.+?)\s*[是为]\s*(.+)/i,
    extract: (match) => ({ key: match[1].trim(), value: match[2].trim() }),
  },
  {
    name: 'project_path',
    pattern: /(?:项目|工程)(?:路径|目录|位置)[是为：:]\s*(\/[^\s]+)/i,
    extract: (match) => ({ key: '项目路径', value: match[1].trim() }),
  },
  {
    name: 'preference',
    pattern: /(?:我喜欢|我偏好|我习惯)(.+?)(?:，|。|$)/i,
    extract: (match) => ({ key: '用户偏好', value: match[1].trim() }),
  },
  {
    name: 'config',
    pattern: /(?:配置|设置)[是为：:]\s*(.+?)\s*=\s*(.+)/i,
    extract: (match) => ({ key: match[1].trim(), value: match[2].trim() }),
  },
  {
    name: 'deadline',
    pattern: /(?:截止|到期|最后)日期[是为：:]\s*(.+)/i,
    extract: (match) => ({ key: '截止日期', value: match[1].trim() }),
  },
];

// ============ 记忆管理器 ============

/**
 * 三层记忆管理器
 */
export class MemoryManager {
  private config: MemoryConfig;
  private dailyCache: Map<string, DailyMemory> = new Map();
  private userProfile: UserProfile | null = null;
  private agentProfiles: Map<string, AgentProfile> = new Map();
  private initialized: boolean = false;
  private summaryHistory: Map<string, SummaryRecord[]> = new Map();

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
  }

  /**
   * 初始化记忆系统
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 确保目录存在
    const dirs = ['daily', 'profiles', 'events', 'knowledge', 'summaries'];
    for (const dir of dirs) {
      const fullPath = join(this.config.rootDir, dir);
      if (!existsSync(fullPath)) {
        mkdirSync(fullPath, { recursive: true });
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
  }

  // ============ Layer 1: 工作记忆 ============

  /**
   * 记录记忆条目
   */
  async remember(
    agentId: string,
    content: string,
    type: MemoryEntry['type'] = 'conversation',
    importance: number = 3,
    tags?: string[]
  ): Promise<void> {
    if (!this.initialized) await this.initialize();

    const today = new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);
    const memory = await this.getDailyMemory(today, agentId);

    const entry: MemoryEntry = {
      timestamp: new Date().toISOString(),
      type,
      content,
      importance,
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
    
    // 检查是否需要自动摘要
    if (this.config.autoSummary && memory.entries.length >= this.config.summaryThreshold) {
      await this.autoSummarize(today, agentId);
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
      // 创建默认档案
      this.userProfile = {
        userId: 'default',
        preferences: {},
        frequentAgents: [],
        keyInfo: {},
        updatedAt: new Date().toISOString(),
      };
      return;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      this.userProfile = JSON.parse(content) as UserProfile;
    } catch {
      this.userProfile = {
        userId: 'default',
        preferences: {},
        frequentAgents: [],
        keyInfo: {},
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
    if (!this.userProfile) await this.loadUserProfile();
    
    this.userProfile!.keyInfo[key] = value;
    await this.saveUserProfile();
    
    // 同时记录到每日记忆
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

    // 更新用户常用 Agent
    if (this.userProfile) {
      if (!this.userProfile.frequentAgents.includes(agentId)) {
        this.userProfile.frequentAgents.push(agentId);
        // 最多保留 5 个
        if (this.userProfile.frequentAgents.length > 5) {
          this.userProfile.frequentAgents.shift();
        }
        await this.saveUserProfile();
      }
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
    const entries = await this.getWorkingMemory(options?.agentId);
    
    const queryLower = query.toLowerCase();
    
    return entries.filter(entry => {
      // 类型过滤
      if (options?.type && entry.type !== options.type) return false;
      
      // 重要性过滤
      if (options?.minImportance && entry.importance < options.minImportance) return false;
      
      // 内容匹配
      return entry.content.toLowerCase().includes(queryLower) ||
        entry.tags?.some(tag => tag.toLowerCase().includes(queryLower));
    });
  }

  /**
   * 获取上下文摘要
   */
  async getContextSummary(agentId: string, maxTokens: number = 1000): Promise<string> {
    const entries = await this.getWorkingMemory(agentId);
    
    // 按重要性排序
    const sorted = [...entries].sort((a, b) => b.importance - a.importance);
    
    let summary = '';
    let currentLength = 0;
    
    for (const entry of sorted) {
      const line = `- [${entry.type}] ${entry.content}\n`;
      if (currentLength + line.length > maxTokens * 4) break;
      
      summary += line;
      currentLength += line.length;
    }

    // 添加用户关键信息
    if (this.userProfile && Object.keys(this.userProfile.keyInfo).length > 0) {
      summary += '\n### 用户信息\n';
      for (const [key, value] of Object.entries(this.userProfile.keyInfo)) {
        summary += `- ${key}: ${value}\n`;
      }
    }

    return summary;
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
    if (this.userProfile) {
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

    for (const [key, memory] of this.dailyCache) {
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
   * 获取压缩后的上下文（用于大模型输入）
   */
  async getCompressedContext(agentId: string, maxTokens: number = 2000): Promise<string> {
    // 先尝试获取摘要
    const today = new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);
    const summaries = await this.getSummaryHistory(today, agentId);
    
    let context = '';
    
    // 添加最近的摘要
    if (summaries.length > 0) {
      context += '## 近期摘要\n';
      for (const summary of summaries.slice(0, 3)) {
        context += `- ${summary.summary}\n`;
        if (summary.keyInfo.length > 0) {
          context += `  关键信息: ${summary.keyInfo.map(k => `${k.key}=${k.value}`).join(', ')}\n`;
        }
      }
      context += '\n';
    }

    // 添加当前工作记忆
    const entries = await this.getWorkingMemory(agentId);
    const sorted = [...entries].sort((a, b) => b.importance - a.importance);
    
    context += '## 当前记忆\n';
    let currentLength = context.length;
    const maxChars = maxTokens * 4;

    for (const entry of sorted) {
      const line = `- [${entry.type}] ${entry.content}\n`;
      if (currentLength + line.length > maxChars) break;
      
      context += line;
      currentLength += line.length;
    }

    // 添加用户关键信息
    if (this.userProfile && Object.keys(this.userProfile.keyInfo).length > 0) {
      context += '\n## 用户信息\n';
      for (const [key, value] of Object.entries(this.userProfile.keyInfo)) {
        context += `- ${key}: ${value}\n`;
      }
    }

    return context;
  }
}

// ============ 全局实例 ============

let globalMemoryManager: MemoryManager | null = null;

/**
 * 获取记忆管理器
 */
export function getMemoryManager(config?: Partial<MemoryConfig>): MemoryManager {
  if (!globalMemoryManager) {
    globalMemoryManager = new MemoryManager(config);
  }
  return globalMemoryManager;
}

/**
 * 重置记忆管理器
 */
export function resetMemoryManager(): void {
  globalMemoryManager = null;
}