/**
 * Skills 匹配器
 * 
 * 支持渐进式匹配：
 * 1. 意图识别（智能分类）
 * 2. 关键词匹配（快速）
 * 3. 语义匹配（可选，需要嵌入模型）
 */

import type { SkillMetadata, MatchedSkill } from './types.js';
import type { SkillLoader } from './loader.js';
import { getIntentRecognizer, type UserIntent, type IntentResult } from './intent-recognizer.js';

/**
 * 嵌入服务接口
 */
export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
}

/**
 * 技能匹配器配置
 */
export interface SkillMatcherConfig {
  /** 关键词匹配阈值 */
  keywordThreshold?: number;
  /** 语义匹配阈值 */
  semanticThreshold?: number;
  /** 意图匹配阈值 */
  intentThreshold?: number;
  /** 是否启用语义匹配 */
  enableSemanticMatch?: boolean;
  /** 是否启用意图识别 */
  enableIntentRecognition?: boolean;
  /** 最大匹配数量 */
  maxMatches?: number;
}

/**
 * 匹配结果（扩展）
 */
export interface EnhancedMatchResult extends MatchedSkill {
  intent?: UserIntent;
  intentConfidence?: number;
  matchedKeywords?: string[];
}

/**
 * 技能匹配器
 */
export class SkillMatcher {
  private loader: SkillLoader;
  private embeddingService?: EmbeddingService;
  private config: Required<SkillMatcherConfig>;

  /** 嵌入缓存 */
  private embeddingCache: Map<string, number[]> = new Map();

  /** 意图识别器 */
  private intentRecognizer = getIntentRecognizer();

  /** 技能 ID 到意图的映射 */
  private skillToIntentMap: Map<string, UserIntent[]> = new Map([
    ['deep-research', ['research', 'learning']],
    ['data-analysis', ['analysis']],
    ['code-review', ['code_review', 'refactoring']],
    ['testing-helper', ['testing']],
    ['doc-generator', ['documentation']],
    ['doc-writer', ['documentation', 'learning']],
    ['debugger', ['debugging']],
    ['git-workflow', ['git', 'deployment']],
    ['api-design', ['api_design']],
    ['api-designer', ['api_design']],
    ['security-audit', ['security']],
  ]);

  constructor(
    loader: SkillLoader,
    embeddingService?: EmbeddingService,
    config?: SkillMatcherConfig
  ) {
    this.loader = loader;
    this.embeddingService = embeddingService;
    this.config = {
      keywordThreshold: config?.keywordThreshold ?? 0.5,
      semanticThreshold: config?.semanticThreshold ?? 0.6,
      intentThreshold: config?.intentThreshold ?? 0.4,
      enableSemanticMatch: config?.enableSemanticMatch ?? false,
      enableIntentRecognition: config?.enableIntentRecognition ?? true,
      maxMatches: config?.maxMatches ?? 3,
    };
  }

  /**
   * 匹配技能（增强版）
   * 
   * 流程：
   * 1. 意图识别
   * 2. 基于意图优先匹配
   * 3. 关键词匹配
   * 4. 语义匹配（如果启用）
   * 5. 返回匹配结果
   */
  async match(
    message: string,
    agentId?: string
  ): Promise<MatchedSkill[]> {
    // 1. 意图识别
    let intentResult: IntentResult | null = null;
    if (this.config.enableIntentRecognition) {
      intentResult = this.intentRecognizer.recognize(message);
    }

    // 2. 获取所有缓存的元数据
    const allMetadata = this.loader.getAllCachedMetadata();

    // 过滤当前 Agent 可用的技能
    const availableMetadata = agentId
      ? allMetadata.filter(m => m.category === 'public' || m.agentId === agentId)
      : allMetadata.filter(m => m.category === 'public');

    // 3. 匹配技能
    const matches: Array<{
      metadata: SkillMetadata;
      score: number;
      method: 'intent' | 'keyword' | 'semantic';
      intent?: UserIntent;
      intentConfidence?: number;
      matchedKeywords?: string[];
    }> = [];

    for (const metadata of availableMetadata) {
      // 意图匹配（优先）
      if (intentResult && intentResult.confidence >= this.config.intentThreshold) {
        const intentScore = this.matchByIntent(metadata, intentResult.intent);
        if (intentScore > 0) {
          matches.push({
            metadata,
            score: intentScore * intentResult.confidence,
            method: 'intent',
            intent: intentResult.intent,
            intentConfidence: intentResult.confidence,
            matchedKeywords: intentResult.keywords,
          });
          continue;
        }
      }

      // 关键词匹配
      const keywordResult = this.matchByKeywords(message, metadata);
      if (keywordResult.score >= this.config.keywordThreshold) {
        matches.push({
          metadata,
          score: keywordResult.score,
          method: 'keyword',
          matchedKeywords: keywordResult.matchedKeywords,
        });
        continue;
      }

      // 语义匹配（如果启用）
      if (this.config.enableSemanticMatch && this.embeddingService && metadata.description) {
        const semanticScore = await this.matchBySemantic(message, metadata);

        if (semanticScore >= this.config.semanticThreshold) {
          matches.push({
            metadata,
            score: semanticScore,
            method: 'semantic',
          });
        }
      }
    }

    // 按分数排序，意图匹配优先
    matches.sort((a, b) => {
      // 意图匹配优先
      if (a.method === 'intent' && b.method !== 'intent') return -1;
      if (b.method === 'intent' && a.method !== 'intent') return 1;
      // 同类型按分数排序
      return b.score - a.score;
    });

    // 限制返回数量
    const topMatches = matches.slice(0, this.config.maxMatches);

    // 4. 按需加载匹配技能的完整内容
    const results: MatchedSkill[] = [];

    for (const match of topMatches) {
      const skill = await this.loader.loadSkillContent(match.metadata.id);

      results.push({
        skill,
        score: match.score,
        method: match.method,
        metadata: match.metadata,
      });
    }

    return results;
  }

  /**
   * 基于意图匹配
   */
  private matchByIntent(metadata: SkillMetadata, intent: UserIntent): number {
    const skillIntents = this.skillToIntentMap.get(metadata.id) || [];
    
    if (skillIntents.includes(intent)) {
      // 完全匹配意图
      return 0.95;
    }

    // 检查技能关键词是否匹配意图
    const intentKeywords: Record<UserIntent, string[]> = {
      research: ['研究', '调查', '研究', 'research'],
      analysis: ['分析', '数据', 'analysis', 'data'],
      code_review: ['审查', 'review', '检查'],
      testing: ['测试', 'test'],
      documentation: ['文档', 'doc', 'readme'],
      debugging: ['调试', 'debug', '修复'],
      git: ['git', '分支', '提交'],
      api_design: ['api', '接口', 'endpoint'],
      security: ['安全', 'security', '漏洞'],
      deployment: ['部署', 'deploy', 'docker'],
      refactoring: ['重构', 'refactor'],
      learning: ['学习', '教程', 'tutorial'],
      general: [],
    };

    const keywords = intentKeywords[intent] || [];
    const skillKeywords = metadata.keywords || [];

    for (const kw of keywords) {
      if (skillKeywords.some(sk => sk.toLowerCase().includes(kw.toLowerCase()))) {
        return 0.75;
      }
    }

    return 0;
  }

  /**
   * 匹配最佳技能
   */
  async matchBest(
    message: string,
    agentId?: string
  ): Promise<MatchedSkill | null> {
    const results = await this.match(message, agentId);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * 关键词匹配（增强版）
   * 
   * @returns 匹配分数和匹配的关键词
   */
  private matchByKeywords(
    message: string,
    metadata: SkillMetadata
  ): { score: number; matchedKeywords: string[] } {
    if (!metadata.keywords || metadata.keywords.length === 0) {
      return { score: 0, matchedKeywords: [] };
    }

    const lowerMessage = message.toLowerCase();
    const matchedKeywords: string[] = [];
    let totalWeight = 0;

    // 加权关键词
    const weightedKeywords: Record<string, number> = {
      'research': 1.0,
      '研究': 1.0,
      'analysis': 1.0,
      '分析': 0.9,
      'review': 1.0,
      '审查': 1.0,
      'test': 0.9,
      '测试': 0.9,
      'debug': 1.0,
      '调试': 1.0,
      'git': 0.95,
      'api': 0.9,
      'security': 1.0,
      '安全': 1.0,
      'deploy': 0.95,
      '部署': 0.95,
    };

    for (const keyword of metadata.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
        totalWeight += weightedKeywords[keyword.toLowerCase()] || 0.7;
      }
    }

    if (matchedKeywords.length === 0) {
      return { score: 0, matchedKeywords: [] };
    }

    // 分数计算：基于匹配关键词数量和权重
    const baseScore = Math.min(1, matchedKeywords.length * 0.3);
    const weightedScore = Math.min(1, baseScore + totalWeight * 0.2);

    return {
      score: weightedScore,
      matchedKeywords,
    };
  }

  /**
   * 语义匹配（使用嵌入向量）
   */
  private async matchBySemantic(
    message: string,
    metadata: SkillMetadata
  ): Promise<number> {
    if (!this.embeddingService || !metadata.description) {
      return 0;
    }

    try {
      // 获取消息嵌入
      const messageEmbedding = await this.getEmbedding(message);

      // 获取技能描述嵌入
      const skillText = `${metadata.name} ${metadata.description}`;
      const skillEmbedding = await this.getEmbedding(skillText);

      // 计算余弦相似度
      return this.cosineSimilarity(messageEmbedding, skillEmbedding);
    } catch (error) {
      console.error('Semantic matching failed:', error);
      return 0;
    }
  }

  /**
   * 获取嵌入（带缓存）
   */
  private async getEmbedding(text: string): Promise<number[]> {
    const cacheKey = this.hashText(text);

    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    const embedding = await this.embeddingService!.embed(text);

    // 限制缓存大小
    if (this.embeddingCache.size < 100) {
      this.embeddingCache.set(cacheKey, embedding);
    }

    return embedding;
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

  /**
   * 简单的文本哈希（用于缓存）
   */
  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * 清除嵌入缓存
   */
  clearEmbeddingCache(): void {
    this.embeddingCache.clear();
  }

  /**
   * 获取意图识别结果（用于调试）
   */
  getIntentResult(message: string): IntentResult {
    return this.intentRecognizer.recognize(message);
  }
}

// ============ 全局实例 ============

let globalMatcher: SkillMatcher | null = null;

/**
 * 获取全局匹配器
 */
export function getSkillMatcher(
  loader?: SkillLoader,
  embeddingService?: EmbeddingService,
  config?: SkillMatcherConfig
): SkillMatcher {
  if (!globalMatcher) {
    const skillLoader = loader || getSkillLoader();
    globalMatcher = new SkillMatcher(skillLoader, embeddingService, config);
  }
  return globalMatcher;
}

/**
 * 重置全局匹配器
 */
export function resetSkillMatcher(): void {
  globalMatcher = null;
}

// 避免循环依赖，延迟导入
function getSkillLoader(): SkillLoader {
  const { getSkillLoader: _getSkillLoader } = require('./loader.js');
  return _getSkillLoader();
}