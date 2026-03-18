/**
 * 改进日志管理器
 * 
 * 记录 Agent 的改进历史
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import type { 
  ImprovementLogEntry, 
  ImprovementTrigger, 
  ImprovementType 
} from './types.js';
import { writeJsonAtomic } from './atomic-write.js';

// ============ 改进日志存储 ============

/**
 * 改进日志存储
 */
class ImprovementLogStorage {
  private dataDir: string;
  private cache: Map<string, ImprovementLogEntry[]> = new Map();
  
  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.ensureDir();
  }
  
  private ensureDir(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }
  
  private getFilePath(agentId: string): string {
    return join(this.dataDir, `${agentId}-improvements.json`);
  }
  
  async load(agentId: string): Promise<ImprovementLogEntry[]> {
    const cached = this.cache.get(agentId);
    if (cached) return cached;
    
    const filePath = this.getFilePath(agentId);
    if (!existsSync(filePath)) {
      return [];
    }
    
    try {
      const content = readFileSync(filePath, 'utf-8');
      const entries = JSON.parse(content) as ImprovementLogEntry[];
      this.cache.set(agentId, entries);
      return entries;
    } catch {
      return [];
    }
  }
  
  async save(agentId: string, entries: ImprovementLogEntry[]): Promise<void> {
    this.cache.set(agentId, entries);
    
    const filePath = this.getFilePath(agentId);
    writeJsonAtomic(filePath, entries);
  }
  
  async append(agentId: string, entry: ImprovementLogEntry): Promise<void> {
    const entries = await this.load(agentId);
    entries.push(entry);
    await this.save(agentId, entries);
  }
  
  async clear(agentId: string): Promise<void> {
    this.cache.delete(agentId);
    const filePath = this.getFilePath(agentId);
    if (existsSync(filePath)) {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(filePath);
    }
  }
}

// ============ 改进日志管理器 ============

/**
 * 改进日志管理器配置
 */
export interface ImprovementLogConfig {
  /** 存储目录 */
  storageDir: string;
  /** 最大保留条数 */
  maxEntries: number;
}

/**
 * 改进日志管理器
 */
export class ImprovementLogManager {
  private storage: ImprovementLogStorage;
  private config: ImprovementLogConfig;
  
  constructor(config: Partial<ImprovementLogConfig> = {}) {
    const defaultDir = join(homedir(), '.securebot', 'self-improving');
    this.config = {
      storageDir: config.storageDir ?? defaultDir,
      maxEntries: config.maxEntries ?? 1000,
    };
    this.storage = new ImprovementLogStorage(this.config.storageDir);
  }
  
  /**
   * 记录改进
   */
  async log(params: {
    agentId: string;
    trigger: ImprovementTrigger;
    type: ImprovementType;
    before: string;
    after: string;
    reason: string;
    relatedTaskId?: string;
    userFeedback?: string;
  }): Promise<ImprovementLogEntry> {
    const entry: ImprovementLogEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      trigger: params.trigger,
      type: params.type,
      before: params.before,
      after: params.after,
      reason: params.reason,
      effectiveness: null,
      relatedTaskId: params.relatedTaskId,
      userFeedback: params.userFeedback,
    };
    
    await this.storage.append(params.agentId, entry);
    
    // 清理旧条目
    await this.cleanup(params.agentId);
    
    return entry;
  }
  
  /**
   * 记录用户反馈驱动的改进
   */
  async logFromFeedback(
    agentId: string,
    feedback: string,
    before: string,
    after: string,
    reason: string
  ): Promise<ImprovementLogEntry> {
    return this.log({
      agentId,
      trigger: 'user_feedback',
      type: 'behavior_change',
      before,
      after,
      reason,
      userFeedback: feedback,
    });
  }
  
  /**
   * 记录任务成功驱动的改进
   */
  async logFromSuccess(
    agentId: string,
    task: string,
    approach: string,
    reason: string
  ): Promise<ImprovementLogEntry> {
    return this.log({
      agentId,
      trigger: 'task_success',
      type: 'knowledge_addition',
      before: '',
      after: `成功方法: ${approach}`,
      reason,
      relatedTaskId: task,
    });
  }
  
  /**
   * 记录任务失败驱动的改进
   */
  async logFromFailure(
    agentId: string,
    task: string,
    failedApproach: string,
    lesson: string
  ): Promise<ImprovementLogEntry> {
    return this.log({
      agentId,
      trigger: 'task_failure',
      type: 'behavior_change',
      before: failedApproach,
      after: `学到的教训: ${lesson}`,
      reason: '从失败中学习',
      relatedTaskId: task,
    });
  }
  
  /**
   * 更新效果评分
   */
  async updateEffectiveness(
    agentId: string,
    entryId: string,
    effectiveness: number
  ): Promise<void> {
    const entries = await this.storage.load(agentId);
    const entry = entries.find(e => e.id === entryId);
    
    if (entry) {
      entry.effectiveness = effectiveness;
      await this.storage.save(agentId, entries);
    }
  }
  
  /**
   * 获取改进日志
   */
  async getLog(agentId: string, limit?: number): Promise<ImprovementLogEntry[]> {
    const entries = await this.storage.load(agentId);
    
    // 按时间排序
    const sorted = entries.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    return limit ? sorted.slice(0, limit) : sorted;
  }
  
  /**
   * 获取最近改进
   */
  async getRecentImprovements(agentId: string, days: number = 7): Promise<ImprovementLogEntry[]> {
    const entries = await this.getLog(agentId);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    
    return entries.filter(e => 
      new Date(e.timestamp).getTime() >= cutoff
    );
  }
  
  /**
   * 按类型获取改进
   */
  async getByType(agentId: string, type: ImprovementType): Promise<ImprovementLogEntry[]> {
    const entries = await this.getLog(agentId);
    return entries.filter(e => e.type === type);
  }
  
  /**
   * 按触发源获取改进
   */
  async getByTrigger(agentId: string, trigger: ImprovementTrigger): Promise<ImprovementLogEntry[]> {
    const entries = await this.getLog(agentId);
    return entries.filter(e => e.trigger === trigger);
  }
  
  /**
   * 获取改进统计
   */
  async getStats(agentId: string): Promise<{
    totalImprovements: number;
    byType: Record<ImprovementType, number>;
    byTrigger: Record<ImprovementTrigger, number>;
    averageEffectiveness: number;
    recentCount: number;
  }> {
    const entries = await this.getLog(agentId);
    const recent = await this.getRecentImprovements(agentId, 7);
    
    // 按类型统计
    const byType: Record<ImprovementType, number> = {
      preference_update: 0,
      behavior_change: 0,
      knowledge_addition: 0,
      skill_refinement: 0,
      prompt_optimization: 0,
      tool_preference: 0,
    };
    
    // 按触发源统计
    const byTrigger: Record<ImprovementTrigger, number> = {
      user_feedback: 0,
      task_success: 0,
      task_failure: 0,
      reflection: 0,
      pattern_learning: 0,
      manual_adjustment: 0,
    };
    
    let totalEffectiveness = 0;
    let effectivenessCount = 0;
    
    for (const entry of entries) {
      byType[entry.type]++;
      byTrigger[entry.trigger]++;
      
      if (entry.effectiveness !== null) {
        totalEffectiveness += entry.effectiveness;
        effectivenessCount++;
      }
    }
    
    return {
      totalImprovements: entries.length,
      byType,
      byTrigger,
      averageEffectiveness: effectivenessCount > 0 
        ? Math.round(totalEffectiveness / effectivenessCount * 100) / 100 
        : 0,
      recentCount: recent.length,
    };
  }
  
  /**
   * 清理旧条目
   */
  private async cleanup(agentId: string): Promise<void> {
    const entries = await this.storage.load(agentId);
    
    if (entries.length > this.config.maxEntries) {
      // 保留最近的条目
      const sorted = entries.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      await this.storage.save(agentId, sorted.slice(0, this.config.maxEntries));
    }
  }
  
  /**
   * 清除所有改进日志
   */
  async clear(agentId: string): Promise<void> {
    await this.storage.clear(agentId);
  }
  
  /**
   * 导出改进日志
   */
  async export(agentId: string): Promise<string> {
    const entries = await this.getLog(agentId);
    return JSON.stringify(entries, null, 2);
  }
  
  /**
   * 导入改进日志
   */
  async import(agentId: string, data: string): Promise<number> {
    const entries = JSON.parse(data) as ImprovementLogEntry[];
    await this.storage.save(agentId, entries);
    return entries.length;
  }
}

// ============ 全局实例 ============

let globalManager: ImprovementLogManager | null = null;

/**
 * 获取全局改进日志管理器
 */
export function getImprovementLogManager(config?: Partial<ImprovementLogConfig>): ImprovementLogManager {
  if (!globalManager) {
    globalManager = new ImprovementLogManager(config);
  }
  return globalManager;
}

/**
 * 重置全局实例
 */
export function resetImprovementLogManager(): void {
  globalManager = null;
}