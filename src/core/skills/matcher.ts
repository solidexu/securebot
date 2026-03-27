/**
 * Skills 匹配器
 * 
 * 支持渐进式匹配：
 * 1. 关键词匹配（快速）
 * 2. 语义匹配（可选，需要嵌入模型）
 */

import type { SkillMetadata, MatchedSkill } from './types.js';
import type { SkillLoader } from './loader.js';

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
  /** 是否启用语义匹配 */
  enableSemanticMatch?: boolean;
  /** 最大匹配数量 */
  maxMatches?: number;
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

  constructor(
    loader: SkillLoader,
    embeddingService?: EmbeddingService,
    config?: SkillMatcherConfig
  ) {
    this.loader = loader;
    this.embeddingService = embeddingService;
    this.config = {
      keywordThreshold: config?.keywordThreshold ?? 0.6,
      semanticThreshold: config?.semanticThreshold ?? 0.6,
      enableSemanticMatch: config?.enableSemanticMatch ?? false,
      maxMatches: config?.maxMatches ?? 3,
    };
  }

  /**
   * 匹配技能（渐进式）
   * 
   * 流程：
   * 1. 获取所有元数据（轻量级）
   * 2. 关键词匹配
   * 3. 语义匹配（如果启用）
   * 4. 返回匹配结果
   */
  async match(
    message: string,
    agentId?: string
  ): Promise<MatchedSkill[]> {
    // 1. 获取所有缓存的元数据
    const allMetadata = this.loader.getAllCachedMetadata();

    // 过滤当前 Agent 可用的技能
    const availableMetadata = agentId
      ? allMetadata.filter(m => m.category === 'public' || m.agentId === agentId)
      : allMetadata.filter(m => m.category === 'public');

    // 2. 匹配技能
    const matches: Array<{ metadata: SkillMetadata; score: number; method: 'keyword' | 'semantic' }> = [];

    for (const metadata of availableMetadata) {
      // 关键词匹配
      const keywordScore = this.matchByKeywords(message, metadata);

      if (keywordScore >= this.config.keywordThreshold) {
        matches.push({ metadata, score: keywordScore, method: 'keyword' });
        continue;
      }

      // 语义匹配（如果启用）
      if (this.config.enableSemanticMatch && this.embeddingService && metadata.description) {
        const semanticScore = await this.matchBySemantic(message, metadata);

        if (semanticScore >= this.config.semanticThreshold) {
          matches.push({ metadata, score: semanticScore, method: 'semantic' });
        }
      }
    }

    // 按分数排序
    matches.sort((a, b) => b.score - a.score);

    // 限制返回数量
    const topMatches = matches.slice(0, this.config.maxMatches);

    // 3. 按需加载匹配技能的完整内容
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
   * 关键词匹配
   * 
   * @returns 匹配分数 (0-1)
   */
  private matchByKeywords(message: string, metadata: SkillMetadata): number {
    if (!metadata.keywords || metadata.keywords.length === 0) {
      return 0;
    }

    const lowerMessage = message.toLowerCase();
    let matchCount = 0;

    for (const keyword of metadata.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }

    if (matchCount === 0) {
      return 0;
    }

    // 分数计算：
    // 匹配 1 个 = 0.6
    // 匹配 2 个 = 0.75
    // 匹配 3+ 个 = 0.85-1.0
    if (matchCount === 1) {
      return 0.6;
    }
    if (matchCount === 2) {
      return 0.75;
    }
    return Math.min(1, 0.85 + matchCount * 0.05);
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