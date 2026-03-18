/**
 * 错误模式存储
 * 
 * 记录和管理 Agent 的错误经验
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import type { 
  ErrorPattern, 
  ErrorPatternStoreConfig,
  ErrorType,
  AvoidCheckResult,
} from './types.js';
import { writeJsonAtomic } from './atomic-write.js';

// ============ 默认配置 ============

const DEFAULT_CONFIG: ErrorPatternStoreConfig = {
  storageDir: join(homedir(), '.securebot', 'self-improving', 'error-patterns'),
  maxPatterns: 50,
  cleanupDays: 30,
};

// ============ 错误模式存储 ============

/**
 * 错误模式存储
 */
export class ErrorPatternStore {
  private config: ErrorPatternStoreConfig;
  private patterns: Map<string, ErrorPattern> = new Map();
  private avoidIndex: Map<string, Set<string>> = new Map(); // avoidPattern -> patternIds
  private initialized: boolean = false;
  
  constructor(config: Partial<ErrorPatternStoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
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
        const pattern = JSON.parse(content) as ErrorPattern;
        this.patterns.set(pattern.id, pattern);
        this.updateAvoidIndex(pattern);
      } catch {
        // 忽略无效文件
      }
    }
  }
  
  /**
   * 持久化单个模式
   */
  private async persist(pattern: ErrorPattern): Promise<void> {
    const filePath = join(this.config.storageDir, `${pattern.id}.json`);
    writeJsonAtomic(filePath, pattern);
  }
  
  /**
   * 更新避免索引
   */
  private updateAvoidIndex(pattern: ErrorPattern): void {
    for (const avoidPattern of pattern.avoidPatterns) {
      const lower = avoidPattern.toLowerCase();
      if (!this.avoidIndex.has(lower)) {
        this.avoidIndex.set(lower, new Set());
      }
      const set = this.avoidIndex.get(lower);
      if (set) {
        set.add(pattern.id);
      }
    }
  }
  
  /**
   * 从避免索引移除
   */
  private removeFromAvoidIndex(pattern: ErrorPattern): void {
    for (const avoidPattern of pattern.avoidPatterns) {
      const lower = avoidPattern.toLowerCase();
      const ids = this.avoidIndex.get(lower);
      if (ids) {
        ids.delete(pattern.id);
      }
    }
  }
  
  /**
   * 记录错误模式
   */
  async recordError(
    agentId: string,
    error: Error,
    context: {
      taskDescription: string;
      approach: string;
      toolsUsed?: string[];
      steps?: string[];
    }
  ): Promise<ErrorPattern> {
    await this.initialize();
    
    // 检查是否已存在相同错误
    const existingPattern = this.findExistingPattern(error, context.taskDescription);
    
    if (existingPattern) {
      // 更新现有模式
      existingPattern.occurrenceCount++;
      existingPattern.lastOccurrence = new Date().toISOString();
      await this.persist(existingPattern);
      return existingPattern;
    }
    
    // 创建新模式
    const pattern: ErrorPattern = {
      id: uuidv4(),
      agentId,
      errorType: this.classifyError(error),
      errorCategory: this.categorizeError(error, context),
      taskContext: context.taskDescription,
      failedApproach: context.approach,
      errorMessage: error.message,
      stackTrace: error.stack,
      avoidPatterns: this.generateAvoidPatterns(error, context),
      occurrenceCount: 1,
      firstOccurrence: new Date().toISOString(),
      lastOccurrence: new Date().toISOString(),
      resolved: false,
    };
    
    this.patterns.set(pattern.id, pattern);
    this.updateAvoidIndex(pattern);
    await this.persist(pattern);
    
    await this.cleanup();
    
    return pattern;
  }
  
  /**
   * 分析根因
   */
  async analyzeRootCause(patternId: string): Promise<string> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      throw new Error(`Pattern not found: ${patternId}`);
    }
    
    // 简单的根因分析（基于错误类型和消息）
    const analysis = this.performBasicAnalysis(pattern);
    
    pattern.rootCause = analysis.rootCause;
    pattern.solution = analysis.solution;
    await this.persist(pattern);
    
    return analysis.rootCause;
  }
  
  /**
   * 执行基本分析
   */
  private performBasicAnalysis(pattern: ErrorPattern): { rootCause: string; solution: string } {
    const analyses: Record<string, { rootCause: string; solution: string }> = {
      'tool_execution': {
        rootCause: '工具执行失败，可能是参数错误或环境问题',
        solution: '检查工具参数和执行环境，确保依赖已安装',
      },
      'planning': {
        rootCause: '任务规划不当，步骤缺失或顺序错误',
        solution: '重新分析任务，制定更详细的计划',
      },
      'understanding': {
        rootCause: '对任务需求理解不准确',
        solution: '重新确认需求，明确目标和约束',
      },
      'context': {
        rootCause: '上下文信息不足或丢失',
        solution: '确保相关上下文完整传递',
      },
      'timeout': {
        rootCause: '操作超时，可能是任务复杂度过高',
        solution: '分解任务，优化执行流程',
      },
      'resource': {
        rootCause: '资源不足或不可用',
        solution: '检查资源状态，必要时释放或请求更多资源',
      },
      'user_cancel': {
        rootCause: '用户取消了操作',
        solution: '无需修复，这是正常情况',
      },
    };
    
    return analyses[pattern.errorType] || {
      rootCause: '未知原因导致的错误',
      solution: '分析错误日志，寻找解决方案',
    };
  }
  
  /**
   * 检查是否应该避免某种方法
   */
  async shouldAvoid(agentId: string, approach: string): Promise<AvoidCheckResult> {
    await this.initialize();
    
    const lowerApproach = approach.toLowerCase();
    
    for (const [avoidPattern, patternIds] of this.avoidIndex) {
      if (lowerApproach.includes(avoidPattern)) {
        // 找到匹配的模式
        for (const patternId of patternIds) {
          const pattern = this.patterns.get(patternId);
          if (pattern && pattern.agentId === agentId && !pattern.resolved) {
            return {
              shouldAvoid: true,
              reason: `之前发生过类似错误: ${pattern.errorMessage.slice(0, 100)}`,
              alternative: pattern.solution,
              matchedPatternId: pattern.id,
            };
          }
        }
      }
    }
    
    return { shouldAvoid: false };
  }
  
  /**
   * 获取建议的修复方案
   */
  async getSuggestedFix(agentId: string, errorType: ErrorType): Promise<string | null> {
    await this.initialize();
    
    const patterns = Array.from(this.patterns.values())
      .filter(p => p.agentId === agentId && p.errorType === errorType && p.solution)
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount);
    
    return patterns[0]?.solution ?? null;
  }
  
  /**
   * 标记为已解决
   */
  async markResolved(patternId: string): Promise<void> {
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      pattern.resolved = true;
      pattern.resolvedAt = new Date().toISOString();
      await this.persist(pattern);
    }
  }
  
  /**
   * 获取 Agent 的所有错误模式
   */
  async getPatternsByAgent(agentId: string): Promise<ErrorPattern[]> {
    await this.initialize();
    return Array.from(this.patterns.values())
      .filter(p => p.agentId === agentId)
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount);
  }
  
  /**
   * 获取按时间范围的模式
   */
  async getByTimeRange(agentId: string, startTime: number, endTime: number): Promise<ErrorPattern[]> {
    const patterns = await this.getPatternsByAgent(agentId);
    return patterns.filter(p => {
      const time = new Date(p.lastOccurrence).getTime();
      return time >= startTime && time <= endTime;
    });
  }
  
  /**
   * 获取未解决的错误
   */
  async getUnresolvedErrors(agentId: string): Promise<ErrorPattern[]> {
    const patterns = await this.getPatternsByAgent(agentId);
    return patterns.filter(p => !p.resolved);
  }
  
  /**
   * 删除模式
   */
  async deletePattern(patternId: string): Promise<boolean> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return false;
    
    this.patterns.delete(patternId);
    this.removeFromAvoidIndex(pattern);
    
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
    byErrorType: Record<ErrorType, number>;
    totalOccurrences: number;
    resolvedCount: number;
    unresolvedCount: number;
    topErrors: ErrorPattern[];
  }> {
    const patterns = await this.getPatternsByAgent(agentId);
    
    const byErrorType: Record<ErrorType, number> = {
      tool_execution: 0,
      planning: 0,
      understanding: 0,
      context: 0,
      timeout: 0,
      resource: 0,
      user_cancel: 0,
      unknown: 0,
    };
    
    let totalOccurrences = 0;
    let resolvedCount = 0;
    let unresolvedCount = 0;
    
    for (const p of patterns) {
      byErrorType[p.errorType]++;
      totalOccurrences += p.occurrenceCount;
      if (p.resolved) resolvedCount++;
      else unresolvedCount++;
    }
    
    return {
      totalPatterns: patterns.length,
      byErrorType,
      totalOccurrences,
      resolvedCount,
      unresolvedCount,
      topErrors: patterns.slice(0, 5),
    };
  }
  
  // ============ 私有方法 ============
  
  /**
   * 查找现有模式
   */
  private findExistingPattern(error: Error, taskContext: string): ErrorPattern | null {
    for (const pattern of this.patterns.values()) {
      if (pattern.errorMessage === error.message && pattern.taskContext === taskContext) {
        return pattern;
      }
    }
    return null;
  }
  
  /**
   * 分类错误
   */
  private classifyError(error: Error): ErrorType {
    const message = error.message.toLowerCase();
    const name = error.name?.toLowerCase() || '';
    
    if (message.includes('timeout') || name.includes('timeout')) return 'timeout';
    if (message.includes('tool') || message.includes('execute') || message.includes('command')) return 'tool_execution';
    if (message.includes('plan') || message.includes('step')) return 'planning';
    if (message.includes('understand') || message.includes('parse') || message.includes('invalid')) return 'understanding';
    if (message.includes('memory') || message.includes('context') || message.includes('not found')) return 'context';
    if (message.includes('cancel') || message.includes('abort')) return 'user_cancel';
    if (message.includes('memory') || message.includes('disk') || message.includes('resource') || message.includes('enough')) return 'resource';
    
    return 'unknown';
  }
  
  /**
   * 分类错误类别
   */
  private categorizeError(error: Error, context: { taskDescription: string; approach: string }): string {
    const text = `${error.message} ${context.taskDescription} ${context.approach}`.toLowerCase();
    
    if (text.includes('代码') || text.includes('code') || text.includes('开发')) return 'development';
    if (text.includes('文件') || text.includes('file') || text.includes('路径')) return 'filesystem';
    if (text.includes('网络') || text.includes('network') || text.includes('连接')) return 'network';
    if (text.includes('数据') || text.includes('data') || text.includes('解析')) return 'data';
    
    return 'general';
  }
  
  /**
   * 生成避免模式
   */
  private generateAvoidPatterns(
    error: Error,
    context: { taskDescription: string; approach: string }
  ): string[] {
    const patterns: string[] = [];
    
    // 从错误消息提取关键词
    const errorKeywords = error.message.match(/[\u4e00-\u9fa5]+|[a-zA-Z]+/g) || [];
    patterns.push(...errorKeywords.filter(w => w.length > 2).slice(0, 3));
    
    // 从失败方法提取
    if (context.approach) {
      const approachWords = context.approach.match(/[\u4e00-\u9fa5]+|[a-zA-Z]+/g) || [];
      patterns.push(...approachWords.filter(w => w.length > 2).slice(0, 2));
    }
    
    return [...new Set(patterns)];
  }
  
  /**
   * 清理旧模式
   */
  private async cleanup(): Promise<void> {
    if (this.patterns.size <= this.config.maxPatterns) return;
    
    // 按发生次数和是否解决排序
    const sorted = Array.from(this.patterns.values())
      .sort((a, b) => {
        // 已解决的优先删除
        if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
        // 按发生次数排序
        return b.occurrenceCount - a.occurrenceCount;
      });
    
    const toDelete = sorted.slice(this.config.maxPatterns);
    
    for (const pattern of toDelete) {
      await this.deletePattern(pattern.id);
    }
  }
}

// ============ 全局实例 ============

let globalStore: ErrorPatternStore | null = null;

/**
 * 获取全局错误模式存储
 */
export function getErrorPatternStore(config?: Partial<ErrorPatternStoreConfig>): ErrorPatternStore {
  if (!globalStore) {
    globalStore = new ErrorPatternStore(config);
  }
  return globalStore;
}

/**
 * 重置全局实例
 */
export function resetErrorPatternStore(): void {
  globalStore = null;
}