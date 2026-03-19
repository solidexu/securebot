/**
 * 统一偏好管理器
 * 
 * 合并 User/Agent/Self-Improving 三套偏好系统
 * 提供统一的偏好管理接口
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { getMemoryManager } from '../memory.js';
import { getSuccessPatternStore, getErrorPatternStore } from './index.js';

// ============ 类型定义 ============

/**
 * 偏好来源
 */
export type PreferenceSource = 'user' | 'feedback' | 'success' | 'error';

/**
 * 全局偏好（适用于所有 Agent）
 */
export interface GlobalPreferences {
  /** 语言偏好 */
  language: 'zh' | 'en' | 'auto';
  /** 详细程度 */
  detailLevel: 'brief' | 'normal' | 'detailed';
  /** 沟通风格 */
  communicationStyle: 'formal' | 'casual' | 'technical';
  /** 主动性级别 (0-1) */
  proactivityLevel: number;
}

/**
 * Agent 特定偏好
 */
export interface AgentPreferences {
  /** 偏好使用的工具 */
  preferredTools: string[];
  /** 避免使用的工具 */
  avoidedTools: string[];
  /** 偏好的方法 */
  preferredApproaches: string[];
  /** 避免的方法 */
  avoidedApproaches: string[];
  /** 偏好的任务类型 */
  preferredTaskTypes: string[];
  /** 避免的任务类型 */
  avoidedTaskTypes: string[];
}

/**
 * 偏好条目（带来源追踪）
 */
export interface PreferenceEntry<T> {
  /** 值 */
  value: T;
  /** 来源 */
  source: PreferenceSource;
  /** 更新时间 */
  updatedAt: string;
  /** 置信度 (0-1) */
  confidence: number;
}

/**
 * 统一偏好存储结构
 */
export interface UnifiedPreferencesStore {
  /** 全局偏好 */
  global: {
    [K in keyof GlobalPreferences]?: PreferenceEntry<GlobalPreferences[K]>;
  };
  /** Agent 偏好 */
  agents: Record<string, {
    [K in keyof AgentPreferences]?: PreferenceEntry<AgentPreferences[K]>;
  }>;
  /** 元数据 */
  metadata: {
    version: string;
    createdAt: string;
    updatedAt: string;
  };
}

// ============ 默认值 ============

const DEFAULT_GLOBAL_PREFERENCES: GlobalPreferences = {
  language: 'auto',
  detailLevel: 'normal',
  communicationStyle: 'casual',
  proactivityLevel: 0.5,
};

const DEFAULT_AGENT_PREFERENCES: AgentPreferences = {
  preferredTools: [],
  avoidedTools: [],
  preferredApproaches: [],
  avoidedApproaches: [],
  preferredTaskTypes: [],
  avoidedTaskTypes: [],
};

// ============ 统一偏好管理器 ============

/**
 * 统一偏好管理器
 * 
 * 管理所有偏好，提供统一接口，自动同步
 */
export class UnifiedPreferenceManager {
  private store: UnifiedPreferencesStore;
  private storagePath: string;
  private dirty: boolean = false;
  
  constructor(storageDir?: string) {
    this.storagePath = join(storageDir ?? join(homedir(), '.securebot'), 'preferences.json');
    this.store = this.load();
  }
  
  // ============ 全局偏好 ============
  
  /**
   * 获取全局偏好
   */
  getGlobalPreference<K extends keyof GlobalPreferences>(
    key: K
  ): GlobalPreferences[K] {
    const entry = this.store.global[key];
    return entry?.value ?? DEFAULT_GLOBAL_PREFERENCES[key];
  }
  
  /**
   * 设置全局偏好
   */
  async setGlobalPreference<K extends keyof GlobalPreferences>(
    key: K,
    value: GlobalPreferences[K],
    source: PreferenceSource = 'user'
  ): Promise<void> {
    this.store.global[key] = {
      value,
      source,
      updatedAt: new Date().toISOString(),
      confidence: source === 'user' ? 1.0 : 0.8,
    };
    this.markDirty();
    
    // 同步到旧系统
    await this.syncToLegacySystems();
  }
  
  /**
   * 获取所有全局偏好
   */
  getGlobalPreferences(): GlobalPreferences {
    const result: Partial<GlobalPreferences> = {};
    for (const key of Object.keys(DEFAULT_GLOBAL_PREFERENCES) as (keyof GlobalPreferences)[]) {
      result[key] = this.getGlobalPreference(key);
    }
    return result as GlobalPreferences;
  }
  
  // ============ Agent 偏好 ============
  
  /**
   * 获取 Agent 偏好
   */
  getAgentPreference<K extends keyof AgentPreferences>(
    agentId: string,
    key: K
  ): AgentPreferences[K] {
    const agentPrefs = this.store.agents[agentId];
    const entry = agentPrefs?.[key];
    return entry?.value ?? DEFAULT_AGENT_PREFERENCES[key];
  }
  
  /**
   * 设置 Agent 偏好
   */
  async setAgentPreference<K extends keyof AgentPreferences>(
    agentId: string,
    key: K,
    value: AgentPreferences[K],
    source: PreferenceSource = 'user'
  ): Promise<void> {
    if (!this.store.agents[agentId]) {
      this.store.agents[agentId] = {};
    }
    this.store.agents[agentId][key] = {
      value,
      source,
      updatedAt: new Date().toISOString(),
      confidence: source === 'user' ? 1.0 : 0.8,
    };
    this.markDirty();
    
    // 同步到旧系统
    await this.syncToLegacySystems();
  }
  
  /**
   * 获取所有 Agent 偏好
   */
  getAgentPreferences(agentId: string): AgentPreferences {
    const result: Partial<AgentPreferences> = {};
    for (const key of Object.keys(DEFAULT_AGENT_PREFERENCES) as (keyof AgentPreferences)[]) {
      result[key] = this.getAgentPreference(agentId, key);
    }
    return result as AgentPreferences;
  }
  
  // ============ 学习接口 ============
  
  /**
   * 从成功模式学习偏好
   */
  async learnFromSuccess(
    agentId: string,
    pattern: {
      taskType: string;
      approach: string;
      toolsUsed: string[];
      effectiveness: number;
    }
  ): Promise<void> {
    // 高效的方法 -> 偏好方法
    if (pattern.effectiveness > 0.7 && pattern.approach) {
      const current = this.getAgentPreference(agentId, 'preferredApproaches');
      if (!current.includes(pattern.approach)) {
        await this.setAgentPreference(agentId, 'preferredApproaches', 
          [...current, pattern.approach].slice(-10), 'success');
      }
    }
    
    // 常用工具 -> 偏好工具
    if (pattern.toolsUsed.length > 0) {
      const current = this.getAgentPreference(agentId, 'preferredTools');
      const newTools = [...new Set([...current, ...pattern.toolsUsed])];
      if (newTools.length !== current.length) {
        await this.setAgentPreference(agentId, 'preferredTools', 
          newTools.slice(-20), 'success');
      }
    }
    
    // 高效任务类型 -> 偏好类型
    if (pattern.effectiveness > 0.8 && pattern.taskType) {
      const current = this.getAgentPreference(agentId, 'preferredTaskTypes');
      if (!current.includes(pattern.taskType)) {
        await this.setAgentPreference(agentId, 'preferredTaskTypes', 
          [...current, pattern.taskType].slice(-10), 'success');
      }
    }
  }
  
  /**
   * 从错误模式学习偏好
   */
  async learnFromError(
    agentId: string,
    pattern: {
      taskType?: string;
      approach?: string;
      toolsUsed?: string[];
    }
  ): Promise<void> {
    // 失败方法 -> 避免方法
    if (pattern.approach) {
      const current = this.getAgentPreference(agentId, 'avoidedApproaches');
      if (!current.includes(pattern.approach)) {
        await this.setAgentPreference(agentId, 'avoidedApproaches', 
          [...current, pattern.approach].slice(-10), 'error');
      }
    }
    
    // 导致错误的工具 -> 避免工具
    if (pattern.toolsUsed && pattern.toolsUsed.length > 0) {
      const current = this.getAgentPreference(agentId, 'avoidedTools');
      const newTools = [...new Set([...current, ...pattern.toolsUsed])];
      if (newTools.length !== current.length) {
        await this.setAgentPreference(agentId, 'avoidedTools', 
          newTools.slice(-10), 'error');
      }
    }
    
    // 失败任务类型 -> 避免类型
    if (pattern.taskType) {
      const current = this.getAgentPreference(agentId, 'avoidedTaskTypes');
      if (!current.includes(pattern.taskType)) {
        await this.setAgentPreference(agentId, 'avoidedTaskTypes', 
          [...current, pattern.taskType].slice(-5), 'error');
      }
    }
  }
  
  /**
   * 从用户反馈学习偏好
   */
  async learnFromFeedback(
    agentId: string,
    feedback: {
      content: string;
      rating?: number;
      type: string;
    }
  ): Promise<void> {
    // 低评分反馈 -> 提取改进点
    if (feedback.rating && feedback.rating < 3) {
      // 分析反馈内容，提取需要避免的行为
      const content = feedback.content.toLowerCase();
      
      // 检测常见问题
      if (content.includes('太长') || content.includes('啰嗦')) {
        await this.setGlobalPreference('detailLevel', 'brief', 'feedback');
      }
      if (content.includes('太短') || content.includes('不够详细')) {
        await this.setGlobalPreference('detailLevel', 'detailed', 'feedback');
      }
      if (content.includes('太正式') || content.includes('太严肃')) {
        await this.setGlobalPreference('communicationStyle', 'casual', 'feedback');
      }
      if (content.includes('太随意') || content.includes('不专业')) {
        await this.setGlobalPreference('communicationStyle', 'formal', 'feedback');
      }
    }
  }
  
  // ============ 迁移接口 ============
  
  /**
   * 从旧系统迁移偏好
   */
  async migrateFromLegacy(agentId: string): Promise<void> {
    try {
      const memoryManager = getMemoryManager();
      const profile = await memoryManager.getAgentProfile(agentId, '');
      
      if (profile?.learnedPreferences) {
        // 迁移旧的学习偏好
        const oldPrefs = profile.learnedPreferences as Record<string, unknown>;
        
        for (const [key, value] of Object.entries(oldPrefs)) {
          // 根据键名映射到新系统
          if (key === 'preferredTools' && Array.isArray(value)) {
            await this.setAgentPreference(agentId, 'preferredTools', value, 'user');
          }
          if (key === 'avoidedTools' && Array.isArray(value)) {
            await this.setAgentPreference(agentId, 'avoidedTools', value, 'user');
          }
        }
      }
      
      // 迁移自我认知
      if (profile?.selfAwareness) {
        const awareness = profile.selfAwareness;
        
        if (awareness.preferredTaskTypes) {
          await this.setAgentPreference(agentId, 'preferredTaskTypes', 
            awareness.preferredTaskTypes, 'success');
        }
        if (awareness.avoidedTaskTypes) {
          await this.setAgentPreference(agentId, 'avoidedTaskTypes', 
            awareness.avoidedTaskTypes, 'error');
        }
      }
    } catch (error) {
      console.error('迁移偏好失败:', error);
    }
  }
  
  /**
   * 同步到旧系统
   */
  private async syncToLegacySystems(): Promise<void> {
    try {
      const memoryManager = getMemoryManager();
      
      // 同步全局偏好到用户档案
      const globalPrefs = this.getGlobalPreferences();
      
      // 使用正确的方法名
      if (typeof memoryManager.setUserPreference === 'function') {
        await memoryManager.setUserPreference('language', globalPrefs.language);
        await memoryManager.setUserPreference('detailLevel', globalPrefs.detailLevel);
        await memoryManager.setUserPreference('communicationStyle', globalPrefs.communicationStyle);
      }
    } catch (error) {
      // 旧系统同步失败不影响主流程
      console.error('同步到旧系统失败:', error);
    }
  }
  
  // ============ 持久化 ============
  
  /**
   * 加载偏好存储
   */
  private load(): UnifiedPreferencesStore {
    if (existsSync(this.storagePath)) {
      try {
        const content = readFileSync(this.storagePath, 'utf-8');
        return JSON.parse(content);
      } catch {
        // 解析失败，返回默认值
      }
    }
    
    return {
      global: {},
      agents: {},
      metadata: {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  }
  
  /**
   * 保存偏好存储
   */
  async save(): Promise<void> {
    if (!this.dirty) return;
    
    this.store.metadata.updatedAt = new Date().toISOString();
    
    // 确保目录存在
    const dir = join(this.storagePath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    writeFileSync(this.storagePath, JSON.stringify(this.store, null, 2));
    this.dirty = false;
  }
  
  /**
   * 标记为已修改
   */
  private markDirty(): void {
    this.dirty = true;
  }
  
  /**
   * 获取偏好来源描述
   */
  getSourceDescription(source: PreferenceSource): string {
    const descriptions: Record<PreferenceSource, string> = {
      user: '用户设置',
      feedback: '从反馈学习',
      success: '从成功学习',
      error: '从错误学习',
    };
    return descriptions[source];
  }
}

// ============ 单例管理 ============

let globalManager: UnifiedPreferenceManager | null = null;

/**
 * 获取全局偏好管理器
 */
export function getUnifiedPreferenceManager(): UnifiedPreferenceManager {
  if (!globalManager) {
    globalManager = new UnifiedPreferenceManager();
  }
  return globalManager;
}

/**
 * 重置偏好管理器
 */
export function resetUnifiedPreferenceManager(): void {
  globalManager = null;
}