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
}

// ============ 默认配置 ============

const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  rootDir: getMemoryDir(),
  workingMemoryDays: 3,
  maxEntriesPerDay: 100,
  autoSummary: true,
};

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

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
  }

  /**
   * 初始化记忆系统
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 确保目录存在
    const dirs = ['daily', 'profiles', 'events', 'knowledge'];
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
  } {
    let totalEntries = 0;
    for (const memory of this.dailyCache.values()) {
      totalEntries += memory.entries.length;
    }

    return {
      dailyMemoryCount: this.dailyCache.size,
      totalEntries,
      agentCount: this.agentProfiles.size,
      eventCount: 0, // 需要读取文件
    };
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