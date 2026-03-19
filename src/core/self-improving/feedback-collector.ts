/**
 * 用户反馈收集器
 * 
 * 收集和管理用户对 Agent 的反馈
 */

import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import type { 
  UserFeedback, 
  FeedbackType, 
  FeedbackTrendAnalysis 
} from './types.js';
import { eventBus } from '../event-bus.js';
import { EventTypes } from '../events.js';
import { writeJsonAtomic } from './atomic-write.js';

// ============ 反馈存储 ============

/**
 * 反馈存储
 */
class FeedbackStorage {
  private dataDir: string;
  private cache: Map<string, UserFeedback> = new Map();
  
  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.ensureDir();
  }
  
  private ensureDir(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }
  
  async save(feedback: UserFeedback): Promise<void> {
    this.cache.set(feedback.id, feedback);
    
    const filePath = join(this.dataDir, `${feedback.id}.json`);
    writeJsonAtomic(filePath, feedback);
  }
  
  async load(feedbackId: string): Promise<UserFeedback | null> {
    const cached = this.cache.get(feedbackId);
    if (cached) return cached;
    
    const filePath = join(this.dataDir, `${feedbackId}.json`);
    if (!existsSync(filePath)) return null;
    
    try {
      const content = readFileSync(filePath, 'utf-8');
      const feedback = JSON.parse(content) as UserFeedback;
      this.cache.set(feedbackId, feedback);
      return feedback;
    } catch {
      return null;
    }
  }
  
  async listByAgent(agentId: string, limit?: number): Promise<UserFeedback[]> {
    const results: UserFeedback[] = [];
    
    // 从缓存获取
    for (const feedback of this.cache.values()) {
      if (feedback.agentId === agentId) {
        results.push(feedback);
      }
    }
    
    // 从文件加载
    if (results.length === 0 || limit === undefined || results.length < limit) {
      const files = readdirSync(this.dataDir).filter(f => f.endsWith('.json'));
      
      for (const file of files) {
        try {
          const content = readFileSync(join(this.dataDir, file), 'utf-8');
          const feedback = JSON.parse(content) as UserFeedback;
          
          if (feedback.agentId === agentId && !this.cache.has(feedback.id)) {
            this.cache.set(feedback.id, feedback);
            results.push(feedback);
          }
        } catch {
          // 忽略
        }
      }
    }
    
    // 按时间排序
    results.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    return limit ? results.slice(0, limit) : results;
  }
  
  async listUnprocessed(agentId: string): Promise<UserFeedback[]> {
    const all = await this.listByAgent(agentId);
    return all.filter(f => !f.processed);
  }
  
  async update(feedbackId: string, updates: Partial<UserFeedback>): Promise<void> {
    const feedback = await this.load(feedbackId);
    if (!feedback) return;
    
    const updated = { ...feedback, ...updates };
    this.cache.set(feedbackId, updated);
    
    const filePath = join(this.dataDir, `${feedbackId}.json`);
    writeJsonAtomic(filePath, updated);
  }
  
  async listByTimeRange(agentId: string, startTime: number, endTime: number): Promise<UserFeedback[]> {
    const all = await this.listByAgent(agentId);
    return all.filter(f => {
      const time = new Date(f.createdAt).getTime();
      return time >= startTime && time <= endTime;
    });
  }
  
  async clear(agentId: string): Promise<number> {
    const feedbacks = await this.listByAgent(agentId);
    let count = 0;
    
    for (const feedback of feedbacks) {
      this.cache.delete(feedback.id);
      const filePath = join(this.dataDir, `${feedback.id}.json`);
      if (existsSync(filePath)) {
        const { unlinkSync } = await import('node:fs');
        unlinkSync(filePath);
        count++;
      }
    }
    
    return count;
  }
}

// ============ 反馈收集器 ============

/**
 * 反馈收集器配置
 */
export interface FeedbackCollectorConfig {
  /** 存储目录 */
  storageDir: string;
  /** 是否自动询问反馈 */
  autoAskFeedback: boolean;
  /** 反馈询问延迟（毫秒） */
  feedbackAskDelay: number;
}

/**
 * 用户反馈收集器
 */
export class FeedbackCollector {
  private storage: FeedbackStorage;
  private config: FeedbackCollectorConfig;
  
  constructor(config: Partial<FeedbackCollectorConfig> = {}) {
    const defaultDir = join(homedir(), '.securebot', 'self-improving', 'feedback');
    this.config = {
      storageDir: config.storageDir ?? defaultDir,
      autoAskFeedback: config.autoAskFeedback ?? true,
      feedbackAskDelay: config.feedbackAskDelay ?? 1000,
    };
    this.storage = new FeedbackStorage(this.config.storageDir);
  }
  
  /**
   * 收集用户反馈
   */
  async collect(feedback: {
    agentId: string;
    sessionId: string;
    taskId?: string;
    type: FeedbackType;
    rating?: number;
    content: string;
  }): Promise<UserFeedback> {
    const entry: UserFeedback = {
      id: uuidv4(),
      agentId: feedback.agentId,
      sessionId: feedback.sessionId,
      taskId: feedback.taskId,
      type: feedback.type,
      rating: feedback.rating,
      content: feedback.content,
      createdAt: new Date().toISOString(),
      processed: false,
    };
    
    await this.storage.save(entry);
    
    // ★ 同步到统一存储
    await this.syncToUnifiedStore(entry);
    
    // 发布反馈事件
    eventBus.publishSync({
      type: EventTypes.USER_MESSAGE, // 复用现有事件类型
      timestamp: new Date(),
      agentId: feedback.agentId,
      sessionId: feedback.sessionId,
      payload: {
        eventType: 'user_feedback',
        feedback: entry,
      },
    });
    
    return entry;
  }
  
  /**
   * 同步到统一存储
   */
  private async syncToUnifiedStore(feedback: UserFeedback): Promise<void> {
    try {
      const { getUnifiedStore } = await import('./unified-store.js');
      const store = getUnifiedStore();
      await store.addFromFeedback(feedback);
    } catch (error) {
      // 同步失败不影响主流程
      console.error('同步反馈到统一存储失败:', error);
    }
  }
  
  /**
   * 快速评分
   */
  async rate(
    agentId: string,
    sessionId: string,
    rating: number,
    comment?: string
  ): Promise<UserFeedback> {
    return this.collect({
      agentId,
      sessionId,
      type: 'rating',
      rating: Math.max(1, Math.min(5, rating)),
      content: comment ?? `用户评分: ${rating}/5`,
    });
  }
  
  /**
   * 提交建议
   */
  async suggest(
    agentId: string,
    sessionId: string,
    suggestion: string
  ): Promise<UserFeedback> {
    return this.collect({
      agentId,
      sessionId,
      type: 'suggestion',
      content: suggestion,
    });
  }
  
  /**
   * 提交投诉
   */
  async complain(
    agentId: string,
    sessionId: string,
    complaint: string
  ): Promise<UserFeedback> {
    return this.collect({
      agentId,
      sessionId,
      type: 'complaint',
      content: complaint,
    });
  }
  
  /**
   * 获取 Agent 的反馈列表
   */
  async getFeedbackForAgent(agentId: string, limit?: number): Promise<UserFeedback[]> {
    return this.storage.listByAgent(agentId, limit);
  }
  
  /**
   * 获取未处理的反馈
   */
  async getUnprocessedFeedback(agentId: string): Promise<UserFeedback[]> {
    return this.storage.listUnprocessed(agentId);
  }
  
  /**
   * 标记反馈已处理
   */
  async markProcessed(feedbackId: string, result: string): Promise<void> {
    await this.storage.update(feedbackId, {
      processed: true,
      processingResult: result,
    });
  }
  
  /**
   * 分析反馈趋势
   */
  async analyzeTrends(agentId: string, days: number = 7): Promise<FeedbackTrendAnalysis> {
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;
    const feedback = await this.storage.listByTimeRange(agentId, startTime, Date.now());
    
    // 计算平均评分
    const ratings = feedback.filter(f => f.rating !== undefined);
    const averageRating = ratings.length > 0
      ? ratings.reduce((sum, f) => sum + (f.rating ?? 0), 0) / ratings.length
      : 0;
    
    // 按类型分组
    const feedbackByType: Record<FeedbackType, number> = {
      rating: 0,
      correction: 0,
      suggestion: 0,
      preference: 0,
      complaint: 0,
    };
    
    for (const f of feedback) {
      feedbackByType[f.type]++;
    }
    
    // 提取常见问题
    const commonIssues = this.extractCommonIssues(feedback);
    
    // 识别改进领域
    const improvementAreas = this.identifyImprovementAreas(feedback);
    
    return {
      totalFeedback: feedback.length,
      averageRating: Math.round(averageRating * 100) / 100,
      feedbackByType,
      commonIssues,
      improvementAreas,
    };
  }
  
  /**
   * 提取常见问题
   */
  private extractCommonIssues(feedback: UserFeedback[]): string[] {
    const issues: string[] = [];
    const keywords = ['慢', '错误', '不准', '不好', '问题', '失败', '不符合'];
    
    for (const f of feedback) {
      if (f.type === 'complaint' || f.rating !== undefined && f.rating < 3) {
        for (const keyword of keywords) {
          if (f.content.includes(keyword)) {
            issues.push(f.content.slice(0, 100));
            break;
          }
        }
      }
    }
    
    return [...new Set(issues)].slice(0, 5);
  }
  
  /**
   * 识别改进领域
   */
  private identifyImprovementAreas(feedback: UserFeedback[]): string[] {
    const areas: string[] = [];
    
    // 分析低分反馈
    const lowRatings = feedback.filter(f => f.rating !== undefined && f.rating < 3);
    if (lowRatings.length > feedback.length * 0.2) {
      areas.push('提高回答质量');
    }
    
    // 分析投诉
    const complaints = feedback.filter(f => f.type === 'complaint');
    if (complaints.length > 0) {
      areas.push('处理用户投诉');
    }
    
    // 分析建议
    const suggestions = feedback.filter(f => f.type === 'suggestion');
    for (const s of suggestions.slice(0, 3)) {
      areas.push(s.content.slice(0, 50));
    }
    
    return [...new Set(areas)].slice(0, 5);
  }
  
  /**
   * 清除 Agent 的所有反馈
   */
  async clearAgentFeedback(agentId: string): Promise<number> {
    return this.storage.clear(agentId);
  }
  
  /**
   * 获取存储路径
   */
  getStorageDir(): string {
    return this.config.storageDir;
  }
}

// ============ 全局实例 ============

let globalCollector: FeedbackCollector | null = null;

/**
 * 获取全局反馈收集器
 */
export function getFeedbackCollector(config?: Partial<FeedbackCollectorConfig>): FeedbackCollector {
  if (!globalCollector) {
    globalCollector = new FeedbackCollector(config);
  }
  return globalCollector;
}

/**
 * 重置全局实例
 */
export function resetFeedbackCollector(): void {
  globalCollector = null;
}