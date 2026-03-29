/**
 * 经验有效性评估系统
 * 
 * 多维度评估经验质量，判断是否值得保留
 */

import type { SuccessPattern, ErrorPattern, UserFeedback } from './types.js';

// ============ 类型定义 ============

/**
 * 经验评分维度
 */
export interface DimensionScores {
  /** 效果评分 (用户反馈/成功率) */
  effectiveness: number;
  /** 时效性 (时间衰减) */
  recency: number;
  /** 使用频率 */
  usageFrequency: number;
  /** 通用性 */
  generalizability: number;
  /** 独特性 */
  uniqueness: number;
}

/**
 * 经验评估结果
 */
export interface ExperienceScore {
  experienceId: string;
  overallScore: number;
  dimensions: DimensionScores;
  isValid: boolean;
  recommendation: 'keep' | 'merge' | 'retire';
  reason: string;
}

/**
 * 评估配置
 */
export interface EvaluatorConfig {
  effectivenessWeight: number;
  recencyWeight: number;
  usageFrequencyWeight: number;
  generalizabilityWeight: number;
  uniquenessWeight: number;
  validThreshold: number;
  mergeThreshold: number;
  recencyHalfLife: number;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: EvaluatorConfig = {
  effectivenessWeight: 0.35,
  recencyWeight: 0.15,
  usageFrequencyWeight: 0.20,
  generalizabilityWeight: 0.15,
  uniquenessWeight: 0.15,
  validThreshold: 0.6,
  mergeThreshold: 0.4,
  recencyHalfLife: 30,
};

// ============ 经验有效性评估器 ============

/**
 * 经验有效性评估器
 */
export class ExperienceEvaluator {
  private config: EvaluatorConfig;

  constructor(config?: Partial<EvaluatorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 评估成功模式
   */
  async evaluateSuccessPattern(pattern: SuccessPattern): Promise<ExperienceScore> {
    const dimensions: DimensionScores = {
      effectiveness: pattern.effectiveness,
      recency: this.calculateRecencyScore(pattern.createdAt, pattern.lastUsedAt),
      usageFrequency: this.calculateUsageScore(pattern.usageCount),
      generalizability: this.calculateGeneralizability(pattern),
      uniqueness: 0.8,
    };

    const overallScore = this.calculateOverallScore(dimensions);

    return {
      experienceId: pattern.id,
      overallScore,
      dimensions,
      isValid: overallScore >= this.config.validThreshold,
      recommendation: this.getRecommendation(overallScore, dimensions),
      reason: this.getReason(dimensions),
    };
  }

  /**
   * 批量评估并更新独特性
   */
  async evaluateBatch(patterns: SuccessPattern[]): Promise<ExperienceScore[]> {
    const scores: ExperienceScore[] = [];

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i]!;
      
      const dimensions: DimensionScores = {
        effectiveness: pattern.effectiveness,
        recency: this.calculateRecencyScore(pattern.createdAt, pattern.lastUsedAt),
        usageFrequency: this.calculateUsageScore(pattern.usageCount),
        generalizability: this.calculateGeneralizability(pattern),
        uniqueness: this.calculateUniqueness(pattern, patterns, i),
      };

      const overallScore = this.calculateOverallScore(dimensions);

      scores.push({
        experienceId: pattern.id,
        overallScore,
        dimensions,
        isValid: overallScore >= this.config.validThreshold,
        recommendation: this.getRecommendation(overallScore, dimensions),
        reason: this.getReason(dimensions),
      });
    }

    return scores;
  }

  /**
   * 评估并推荐处理
   */
  async evaluateAndRecommend(
    patterns: SuccessPattern[]
  ): Promise<{
    toKeep: SuccessPattern[];
    toMerge: SuccessPattern[];
    toRetire: SuccessPattern[];
    scores: ExperienceScore[];
  }> {
    const scores = await this.evaluateBatch(patterns);

    const toKeep: SuccessPattern[] = [];
    const toMerge: SuccessPattern[] = [];
    const toRetire: SuccessPattern[] = [];

    for (let i = 0; i < patterns.length; i++) {
      const score = scores[i]!;
      if (score.recommendation === 'keep') {
        toKeep.push(patterns[i]!);
      } else if (score.recommendation === 'merge') {
        toMerge.push(patterns[i]!);
      } else {
        toRetire.push(patterns[i]!);
      }
    }

    return { toKeep, toMerge, toRetire, scores };
  }

  /**
   * 计算时效性评分
   */
  private calculateRecencyScore(createdAt: string, lastUsedAt?: string): number {
    const now = Date.now();
    const lastUse = lastUsedAt ? new Date(lastUsedAt).getTime() : new Date(createdAt).getTime();
    const daysSinceUse = (now - lastUse) / (1000 * 60 * 60 * 24);

    return Math.exp(-daysSinceUse / this.config.recencyHalfLife);
  }

  /**
   * 计算使用频率评分
   */
  private calculateUsageScore(usageCount: number): number {
    return Math.min(1, Math.log(usageCount + 1) / Math.log(11));
  }

  /**
   * 计算通用性评分
   */
  private calculateGeneralizability(pattern: SuccessPattern): number {
    const keywordScore = Math.min(1, pattern.keywords.length / 5);
    const conditionScore = Math.min(1, pattern.applicableConditions.length / 3);

    return (keywordScore + conditionScore) / 2;
  }

  /**
   * 计算独特性评分
   */
  private calculateUniqueness(
    pattern: SuccessPattern,
    allPatterns: SuccessPattern[],
    selfIndex: number
  ): number {
    if (allPatterns.length <= 1) return 1;

    let maxSimilarity = 0;

    for (let i = 0; i < allPatterns.length; i++) {
      if (i === selfIndex) continue;

      const other = allPatterns[i]!;
      const similarity = this.calculatePatternSimilarity(pattern, other);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }

    return 1 - maxSimilarity;
  }

  /**
   * 计算两个模式的相似度
   */
  private calculatePatternSimilarity(a: SuccessPattern, b: SuccessPattern): number {
    const typeSimilarity = a.taskType === b.taskType ? 1 : 0;

    const keywordSimilarity = this.jaccardSimilarity(a.keywords, b.keywords);

    const approachSimilarity = this.textSimilarity(a.approach, b.approach);

    const toolSimilarity = this.jaccardSimilarity(a.toolsUsed, b.toolsUsed);

    return (
      typeSimilarity * 0.2 +
      keywordSimilarity * 0.3 +
      approachSimilarity * 0.3 +
      toolSimilarity * 0.2
    );
  }

  /**
   * Jaccard 相似度
   */
  private jaccardSimilarity(a: string[], b: string[]): number {
    const setA = new Set(a.map(s => s.toLowerCase()));
    const setB = new Set(b.map(s => s.toLowerCase()));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * 文本相似度
   */
  private textSimilarity(a: string, b: string): number {
    const wordsA = a.toLowerCase().split(/\s+/);
    const wordsB = b.toLowerCase().split(/\s+/);
    return this.jaccardSimilarity(wordsA, wordsB);
  }

  /**
   * 计算综合评分
   */
  private calculateOverallScore(dimensions: DimensionScores): number {
    return (
      dimensions.effectiveness * this.config.effectivenessWeight +
      dimensions.recency * this.config.recencyWeight +
      dimensions.usageFrequency * this.config.usageFrequencyWeight +
      dimensions.generalizability * this.config.generalizabilityWeight +
      dimensions.uniqueness * this.config.uniquenessWeight
    );
  }

  /**
   * 获取推荐操作
   */
  private getRecommendation(
    overallScore: number,
    dimensions: DimensionScores
  ): 'keep' | 'merge' | 'retire' {
    if (overallScore >= this.config.validThreshold) {
      return 'keep';
    } else if (overallScore >= this.config.mergeThreshold) {
      if (dimensions.uniqueness < 0.5) {
        return 'merge';
      }
      return 'keep';
    }
    return 'retire';
  }

  /**
   * 获取原因说明
   */
  private getReason(dimensions: DimensionScores): string {
    const reasons: string[] = [];

    if (dimensions.effectiveness < 0.5) {
      reasons.push('效果评分较低');
    }
    if (dimensions.recency < 0.3) {
      reasons.push('长期未使用');
    }
    if (dimensions.usageFrequency < 0.2) {
      reasons.push('使用频率低');
    }
    if (dimensions.uniqueness < 0.5) {
      reasons.push('与其他经验相似');
    }

    return reasons.length > 0 ? reasons.join('；') : '经验质量良好';
  }

  /**
   * 快速判断是否有效
   */
  isExperienceValid(pattern: SuccessPattern): boolean {
    const recency = this.calculateRecencyScore(pattern.createdAt, pattern.lastUsedAt);
    const usage = this.calculateUsageScore(pattern.usageCount);

    return pattern.effectiveness >= 0.5 && recency >= 0.2 && (usage >= 0.1 || pattern.usageCount === 0);
  }
}

// ============ 经验合并器 ============

/**
 * 相似经验组
 */
export interface SimilarGroup {
  groupId: string;
  patterns: SuccessPattern[];
  similarity: number;
  representative: SuccessPattern;
}

/**
 * 合并后的经验
 */
export interface MergedExperience extends SuccessPattern {
  mergedFrom: string[];
  mergeStrategy: 'best_of' | 'union' | 'weighted';
  mergeConfidence: number;
}

/**
 * 经验合并器
 */
export class ExperienceMerger {
  private similarityThreshold: number;

  constructor(similarityThreshold: number = 0.75) {
    this.similarityThreshold = similarityThreshold;
  }

  /**
   * 检测相似经验组
   */
  async detectSimilarGroups(patterns: SuccessPattern[]): Promise<SimilarGroup[]> {
    const groups: SimilarGroup[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < patterns.length; i++) {
      const patternA = patterns[i]!;
      if (processed.has(patternA.id)) continue;

      const similar: SuccessPattern[] = [patternA];

      for (let j = i + 1; j < patterns.length; j++) {
        const patternB = patterns[j]!;
        if (processed.has(patternB.id)) continue;

        const similarity = this.calculateSimilarity(patternA, patternB);
        if (similarity >= this.similarityThreshold) {
          similar.push(patternB);
          processed.add(patternB.id);
        }
      }

      if (similar.length > 1) {
        const representative = this.selectRepresentative(similar);

        groups.push({
          groupId: `group_${Date.now().toString(36)}_${i}`,
          patterns: similar,
          similarity: this.calculateGroupSimilarity(similar),
          representative,
        });
      }

      processed.add(patternA.id);
    }

    return groups;
  }

  /**
   * 合并相似经验组
   */
  async mergeGroup(group: SimilarGroup): Promise<MergedExperience> {
    const { patterns } = group;

    const base = this.selectBestExperience(patterns);

    const mergedApproach = this.mergeApproaches(patterns);
    const mergedSteps = this.mergeSteps(patterns);
    const mergedTools = this.mergeTools(patterns);
    const mergedKeywords = this.mergeKeywords(patterns);

    const totalUsage = patterns.reduce((sum, p) => sum + p.usageCount, 0);
    const avgEffectiveness =
      patterns.reduce((sum, p) => sum + p.effectiveness, 0) / patterns.length;

    const merged: MergedExperience = {
      ...base,
      id: `merged_${Date.now().toString(36)}`,
      approach: mergedApproach,
      steps: mergedSteps,
      toolsUsed: mergedTools,
      keywords: mergedKeywords,
      usageCount: totalUsage,
      effectiveness: avgEffectiveness,
      mergedFrom: patterns.map(p => p.id),
      mergeStrategy: 'best_of',
      mergeConfidence: group.similarity,
    };

    return merged;
  }

  /**
   * 计算两个经验的相似度
   */
  private calculateSimilarity(a: SuccessPattern, b: SuccessPattern): number {
    const typeSimilarity = a.taskType === b.taskType ? 1 : 0;

    const keywordSimilarity = this.jaccardSimilarity(a.keywords, b.keywords);

    const approachSimilarity = this.textSimilarity(a.approach, b.approach);

    const toolSimilarity = this.jaccardSimilarity(a.toolsUsed, b.toolsUsed);

    return (
      typeSimilarity * 0.2 +
      keywordSimilarity * 0.3 +
      approachSimilarity * 0.3 +
      toolSimilarity * 0.2
    );
  }

  /**
   * Jaccard 相似度
   */
  private jaccardSimilarity(a: string[], b: string[]): number {
    const setA = new Set(a.map(s => s.toLowerCase()));
    const setB = new Set(b.map(s => s.toLowerCase()));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * 文本相似度
   */
  private textSimilarity(a: string, b: string): number {
    const wordsA = a.toLowerCase().split(/\s+/);
    const wordsB = b.toLowerCase().split(/\s+/);
    return this.jaccardSimilarity(wordsA, wordsB);
  }

  /**
   * 选择代表性经验
   */
  private selectRepresentative(patterns: SuccessPattern[]): SuccessPattern {
    return patterns.reduce((best, current) => {
      const bestScore = best.effectiveness * 0.7 + Math.min(1, best.usageCount / 100) * 0.3;
      const currentScore =
        current.effectiveness * 0.7 + Math.min(1, current.usageCount / 100) * 0.3;
      return currentScore > bestScore ? current : best;
    });
  }

  /**
   * 选择最佳经验
   */
  private selectBestExperience(patterns: SuccessPattern[]): SuccessPattern {
    return this.selectRepresentative(patterns);
  }

  /**
   * 合并方法描述
   */
  private mergeApproaches(patterns: SuccessPattern[]): string {
    const uniqueApproaches = new Set(patterns.map(p => p.approach));

    if (uniqueApproaches.size === 1) {
      return patterns[0]!.approach;
    }

    const best = this.selectBestExperience(patterns);
    return best.approach;
  }

  /**
   * 合并步骤
   */
  private mergeSteps(patterns: SuccessPattern[]): string[] {
    const allSteps = patterns.flatMap(p => p.steps);
    const uniqueSteps = [...new Set(allSteps)];

    if (uniqueSteps.length > 10) {
      return uniqueSteps.slice(0, 10);
    }

    return uniqueSteps;
  }

  /**
   * 合并工具
   */
  private mergeTools(patterns: SuccessPattern[]): string[] {
    const allTools = patterns.flatMap(p => p.toolsUsed);
    return [...new Set(allTools)];
  }

  /**
   * 合并关键词
   */
  private mergeKeywords(patterns: SuccessPattern[]): string[] {
    const allKeywords = patterns.flatMap(p => p.keywords);
    return [...new Set(allKeywords)].slice(0, 10);
  }

  /**
   * 计算组内平均相似度
   */
  private calculateGroupSimilarity(patterns: SuccessPattern[]): number {
    if (patterns.length < 2) return 1;

    let totalSimilarity = 0;
    let count = 0;

    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        totalSimilarity += this.calculateSimilarity(patterns[i]!, patterns[j]!);
        count++;
      }
    }

    return count > 0 ? totalSimilarity / count : 1;
  }
}

// ============ 全局实例 ============

let globalEvaluator: ExperienceEvaluator | null = null;
let globalMerger: ExperienceMerger | null = null;

/**
 * 获取经验评估器
 */
export function getExperienceEvaluator(config?: Partial<EvaluatorConfig>): ExperienceEvaluator {
  if (!globalEvaluator) {
    globalEvaluator = new ExperienceEvaluator(config);
  }
  return globalEvaluator;
}

/**
 * 获取经验合并器
 */
export function getExperienceMerger(similarityThreshold?: number): ExperienceMerger {
  if (!globalMerger) {
    globalMerger = new ExperienceMerger(similarityThreshold);
  }
  return globalMerger;
}