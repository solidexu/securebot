/**
 * 成功模式存储
 * 
 * 记录和管理 Agent 的成功经验
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import type { 
  SuccessPattern, 
  SuccessPatternStoreConfig,
  TaskType,
  TaskExecution,
} from './types.js';

// ============ 默认配置 ============

const DEFAULT_CONFIG: SuccessPatternStoreConfig = {
  storageDir: join(homedir(), '.securebot', 'self-improving', 'success-patterns'),
  maxPatterns: 100,
  minEffectiveness: 0.5,
  cleanupDays: 30,
};

// ============ 关键词索引 ============

/**
 * 简单的关键词索引
 */
class KeywordIndex {
  private index: Map<string, Set<string>> = new Map();
  
  add(pattern: SuccessPattern): void {
    for (const keyword of pattern.keywords) {
      const lower = keyword.toLowerCase();
      if (!this.index.has(lower)) {
        this.index.set(lower, new Set());
      }
      this.index.get(lower)!.add(pattern.id);
    }
  }
  
  remove(patternId: string): void {
    for (const [_, ids] of this.index) {
      ids.delete(patternId);
    }
  }
  
  search(keywords: string[]): Set<string> {
    const result = new Set<string>();
    
    for (const keyword of keywords) {
      const lower = keyword.toLowerCase();
      const ids = this.index.get(lower);
      if (ids) {
        for (const id of ids) {
          result.add(id);
        }
      }
    }
    
    return result;
  }
  
  clear(): void {
    this.index.clear();
  }
}

// ============ 成功模式存储 ============

/**
 * 成功模式存储
 */
export class SuccessPatternStore {
  private config: SuccessPatternStoreConfig;
  private patterns: Map<string, SuccessPattern> = new Map();
  private index: KeywordIndex;
  private initialized: boolean = false;
  
  constructor(config: Partial<SuccessPatternStoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.index = new KeywordIndex();
  }
  
  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    if (!existsSync(this.config.storageDir)) {
      mkdirSync(this.config.storageDir, { recursive: true });
    }
    
    await this.load();
    this.initialized = true;
  }
  
  /**
   * 加载已有数据
   */
  private async load(): Promise<void> {
    const files = readdirSync(this.config.storageDir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      try {
        const content = readFileSync(join(this.config.storageDir, file), 'utf-8');
        const pattern = JSON.parse(content) as SuccessPattern;
        this.patterns.set(pattern.id, pattern);
        this.index.add(pattern);
      } catch {
        // 忽略无效文件
      }
    }
  }
  
  /**
   * 持久化单个模式
   */
  private async persist(pattern: SuccessPattern): Promise<void> {
    const filePath = join(this.config.storageDir, `${pattern.id}.json`);
    writeFileSync(filePath, JSON.stringify(pattern, null, 2), 'utf-8');
  }
  
  /**
   * 记录成功模式
   */
  async recordSuccess(
    agentId: string,
    task: TaskExecution,
    result: {
      summary: string;
      userFeedback?: string;
      userRating?: number;
    }
  ): Promise<SuccessPattern> {
    await this.initialize();
    
    // 提取特征
    const taskType = task.taskType || this.classifyTask(task.description);
    const keywords = this.extractKeywords(task.description);
    const taskPatterns = this.extractPatterns(task.description);
    const effectiveness = this.calculateEffectiveness(task, result);
    
    const pattern: SuccessPattern = {
      id: uuidv4(),
      agentId,
      taskType,
      taskDescription: task.description,
      context: this.buildContext(task),
      approach: task.approach,
      toolsUsed: task.toolsUsed,
      steps: task.steps.map(s => s.description),
      result: result.summary,
      userFeedback: result.userFeedback,
      effectiveness,
      createdAt: new Date().toISOString(),
      usageCount: 0,
      keywords,
      taskPatterns,
      applicableConditions: this.extractConditions(task),
    };
    
    // 检查效果评分是否达标
    if (effectiveness >= this.config.minEffectiveness) {
      this.patterns.set(pattern.id, pattern);
      this.index.add(pattern);
      await this.persist(pattern);
      await this.cleanup();
    }
    
    return pattern;
  }
  
  /**
   * 查找相似的成功模式
   */
  async findSimilarSuccess(
    agentId: string,
    taskDescription: string,
    limit: number = 5
  ): Promise<SuccessPattern[]> {
    await this.initialize();
    
    const keywords = this.extractKeywords(taskDescription);
    const candidateIds = this.index.search(keywords);
    
    const candidates: SuccessPattern[] = [];
    
    for (const id of candidateIds) {
      const pattern = this.patterns.get(id);
      if (pattern && pattern.agentId === agentId) {
        candidates.push(pattern);
      }
    }
    
    // 按相关度和效果评分排序
    candidates.sort((a, b) => {
      const scoreA = a.effectiveness * 0.7 + (a.usageCount / 100) * 0.3;
      const scoreB = b.effectiveness * 0.7 + (b.usageCount / 100) * 0.3;
      return scoreB - scoreA;
    });
    
    return candidates.slice(0, limit);
  }
  
  /**
   * 获取最佳实践
   */
  async getBestPractices(agentId: string, taskType?: TaskType): Promise<SuccessPattern[]> {
    await this.initialize();
    
    let patterns = Array.from(this.patterns.values())
      .filter(p => p.agentId === agentId);
    
    if (taskType) {
      patterns = patterns.filter(p => p.taskType === taskType);
    }
    
    // 按效果评分和使用次数排序
    return patterns
      .sort((a, b) => {
        const scoreA = a.effectiveness * 0.8 + (a.usageCount / 50) * 0.2;
        const scoreB = b.effectiveness * 0.8 + (b.usageCount / 50) * 0.2;
        return scoreB - scoreA;
      })
      .slice(0, 10);
  }
  
  /**
   * 记录模式使用
   */
  async recordUsage(patternId: string): Promise<void> {
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      pattern.usageCount++;
      pattern.lastUsedAt = new Date().toISOString();
      await this.persist(pattern);
    }
  }
  
  /**
   * 获取 Agent 的所有模式
   */
  async getPatternsByAgent(agentId: string): Promise<SuccessPattern[]> {
    await this.initialize();
    return Array.from(this.patterns.values())
      .filter(p => p.agentId === agentId)
      .sort((a, b) => b.effectiveness - a.effectiveness);
  }
  
  /**
   * 获取按时间范围的模式
   */
  async getByTimeRange(agentId: string, startTime: number, endTime: number): Promise<SuccessPattern[]> {
    const patterns = await this.getPatternsByAgent(agentId);
    return patterns.filter(p => {
      const time = new Date(p.createdAt).getTime();
      return time >= startTime && time <= endTime;
    });
  }
  
  /**
   * 删除模式
   */
  async deletePattern(patternId: string): Promise<boolean> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return false;
    
    this.patterns.delete(patternId);
    this.index.remove(patternId);
    
    const filePath = join(this.config.storageDir, `${patternId}.json`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
    
    return true;
  }
  
  /**
   * 清除 Agent 的所有模式
   */
  async clearAgent(agentId: string): Promise<number> {
    const patterns = await this.getPatternsByAgent(agentId);
    let count = 0;
    
    for (const pattern of patterns) {
      if (await this.deletePattern(pattern.id)) {
        count++;
      }
    }
    
    return count;
  }
  
  /**
   * 获取统计
   */
  async getStats(agentId: string): Promise<{
    totalPatterns: number;
    byTaskType: Record<TaskType, number>;
    averageEffectiveness: number;
    totalUsage: number;
    topPatterns: SuccessPattern[];
  }> {
    const patterns = await this.getPatternsByAgent(agentId);
    
    const byTaskType: Record<TaskType, number> = {
      coding: 0,
      analysis: 0,
      writing: 0,
      planning: 0,
      execution: 0,
      debugging: 0,
      learning: 0,
      general: 0,
    };
    
    let totalEffectiveness = 0;
    let totalUsage = 0;
    
    for (const p of patterns) {
      byTaskType[p.taskType]++;
      totalEffectiveness += p.effectiveness;
      totalUsage += p.usageCount;
    }
    
    return {
      totalPatterns: patterns.length,
      byTaskType,
      averageEffectiveness: patterns.length > 0 
        ? Math.round(totalEffectiveness / patterns.length * 100) / 100 
        : 0,
      totalUsage,
      topPatterns: patterns.slice(0, 5),
    };
  }
  
  // ============ 私有方法 ============
  
  /**
   * 分类任务
   */
  private classifyTask(description: string): TaskType {
    const text = description.toLowerCase();
    
    const classifiers: [TaskType, string[]][] = [
      ['coding', ['写代码', '实现', '开发', '编程', 'debug', '修复', '重构', 'code']],
      ['analysis', ['分析', '研究', '调查', '理解', '解释', 'analyze', 'review']],
      ['writing', ['写', '撰写', '生成', '创建文档', '编写', 'write', 'document']],
      ['planning', ['计划', '规划', '设计', '架构', 'plan', 'design', 'architect']],
      ['execution', ['执行', '运行', '部署', '配置', 'execute', 'deploy', 'config']],
      ['debugging', ['调试', '修复', 'bug', '错误', 'debug', 'fix', 'error']],
      ['learning', ['学习', '教程', '指南', '文档', '说明', 'learn', 'tutorial']],
    ];
    
    for (const [type, keywords] of classifiers) {
      if (keywords.some(kw => text.includes(kw))) {
        return type;
      }
    }
    
    return 'general';
  }
  
  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    // 提取中文词汇和英文单词
    const words = text.match(/[\u4e00-\u9fa5]+|[a-zA-Z]+/g) || [];
    const stopWords = new Set([
      '的', '是', '在', '有', '和', '了', '不', '这', '那', '我', '你', '他', '她',
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    ]);
    
    return [...new Set(words.filter(w => !stopWords.has(w.toLowerCase()) && w.length > 1))];
  }
  
  /**
   * 提取任务模式
   */
  private extractPatterns(text: string): string[] {
    const patterns: string[] = [];
    const patternRegex = /(创建|实现|开发|修复|分析|设计|优化|配置|部署|测试|编写|生成|执行)[\u4e00-\u9fa5\w]+/g;
    
    let match;
    while ((match = patternRegex.exec(text)) !== null) {
      patterns.push(match[0]);
    }
    
    return patterns;
  }
  
  /**
   * 构建上下文
   */
  private buildContext(task: TaskExecution): string {
    const parts: string[] = [];
    
    if (task.toolsUsed.length > 0) {
      parts.push(`使用工具: ${task.toolsUsed.join(', ')}`);
    }
    
    if (task.duration) {
      parts.push(`耗时: ${Math.round(task.duration / 1000)}秒`);
    }
    
    return parts.join(' | ') || '无特殊上下文';
  }
  
  /**
   * 提取适用条件
   */
  private extractConditions(task: TaskExecution): string[] {
    const conditions: string[] = [];
    
    if (task.toolsUsed.length > 0) {
      conditions.push(`需要工具: ${task.toolsUsed.slice(0, 3).join(', ')}`);
    }
    
    // 从描述中提取条件词
    const conditionKeywords = ['当', '如果', '需要', '要求', '必须', '假设'];
    for (const keyword of conditionKeywords) {
      if (task.description.includes(keyword)) {
        const idx = task.description.indexOf(keyword);
        conditions.push(task.description.slice(Math.max(0, idx - 10), idx + 30));
      }
    }
    
    return conditions.slice(0, 3);
  }
  
  /**
   * 计算效果评分
   */
  private calculateEffectiveness(
    task: TaskExecution,
    result: { userFeedback?: string; userRating?: number }
  ): number {
    let score = 0.5; // 基础分
    
    // 成功加分
    if (task.success) score += 0.2;
    
    // 用户评分
    if (result.userRating !== undefined) {
      score = score * 0.6 + (result.userRating / 5) * 0.4;
    }
    
    // 用户反馈加分
    if (result.userFeedback) {
      const positiveWords = ['很好', '完美', '不错', '优秀', '满意', 'excellent', 'great', 'good'];
      const negativeWords = ['不好', '差', '慢', '错误', '问题', 'bad', 'slow', 'error'];
      
      const hasPositive = positiveWords.some(w => result.userFeedback!.includes(w));
      const hasNegative = negativeWords.some(w => result.userFeedback!.includes(w));
      
      if (hasPositive && !hasNegative) score += 0.1;
      if (hasNegative && !hasPositive) score -= 0.1;
    }
    
    return Math.min(1, Math.max(0, score));
  }
  
  /**
   * 清理旧模式
   */
  private async cleanup(): Promise<void> {
    if (this.patterns.size <= this.config.maxPatterns) return;
    
    // 按使用次数和效果评分排序，保留最有价值的
    const sorted = Array.from(this.patterns.values())
      .sort((a, b) => {
        const scoreA = a.effectiveness * 0.7 + (a.usageCount / 100) * 0.3;
        const scoreB = b.effectiveness * 0.7 + (b.usageCount / 100) * 0.3;
        return scoreB - scoreA;
      });
    
    // 保留前 maxPatterns 个
    const toDelete = sorted.slice(this.config.maxPatterns);
    
    for (const pattern of toDelete) {
      await this.deletePattern(pattern.id);
    }
  }
}

// ============ 全局实例 ============

let globalStore: SuccessPatternStore | null = null;

/**
 * 获取全局成功模式存储
 */
export function getSuccessPatternStore(config?: Partial<SuccessPatternStoreConfig>): SuccessPatternStore {
  if (!globalStore) {
    globalStore = new SuccessPatternStore(config);
  }
  return globalStore;
}

/**
 * 重置全局实例
 */
export function resetSuccessPatternStore(): void {
  globalStore = null;
}