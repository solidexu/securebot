/**
 * 智能保存触发机制
 * 
 * 通过语义分析判断是否应该保存知识
 * 支持内容去重、重要性评估
 */

import type { Agent, Session } from '../core/types.js';

// ============ 类型定义 ============

/**
 * 保存决策结果
 */
export interface SaveDecision {
  shouldSave: boolean;
  confidence: number;
  reason: string;
  suggestedImportance: number;
  suggestedTags: string[];
  duplicateOf?: string;
}

/**
 * 重要性级别
 */
export type ImportanceLevel = 'high' | 'medium' | 'low';

/**
 * 智能触发配置
 */
export interface SmartTriggerConfig {
  highImportanceKeywords: string[];
  mediumImportanceKeywords: string[];
  lowImportanceKeywords: string[];
  saveIntentKeywords: string[];
  summaryKeywords: string[];
  minContentLength: number;
  minResponseLength: number;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: SmartTriggerConfig = {
  highImportanceKeywords: [
    '重要', '关键', '核心', '必须', '最佳实践', '教训', '注意',
    'critical', 'important', 'key', 'must', 'best practice',
  ],
  mediumImportanceKeywords: [
    '总结', '方法', '步骤', '配置', '设置', '实现', '方案',
    'summary', 'method', 'step', 'config', 'solution',
  ],
  lowImportanceKeywords: [
    '顺便', '顺便提', '只是', '可能', '也许',
    'by the way', 'just', 'maybe', 'perhaps',
  ],
  saveIntentKeywords: [
    '记住', '保存', '记下来', '存到', '记录', '别忘了',
    '以后要', '以后用', '记住这个', '保存知识',
    'remember', 'save', 'note', 'keep this',
  ],
  summaryKeywords: [
    '总结', '最佳实践', '经验', '教训', '学习到',
    '总结一下', '做个总结', '回顾',
  ],
  minContentLength: 20,
  minResponseLength: 50,
};

// ============ 忽略模式 ============

const IGNORE_PATTERNS = [
  /^.{0,10}$/,
  /^(ok|好|好的|明白|收到|yes|no|嗯|哦)$/i,
  /^(test|测试)$/i,
  /^(hi|hello|你好|嗨)$/i,
  /^(谢谢|感谢|thanks)$/i,
];

// ============ 智能保存触发器 ============

/**
 * 智能保存触发器
 */
export class SmartSaveTrigger {
  private config: SmartTriggerConfig;
  private recentSaves: Map<string, { content: string; timestamp: number }> = new Map();
  private readonly RECENT_SAVE_TTL = 5 * 60 * 1000;

  constructor(config?: Partial<SmartTriggerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cleanupRecentSaves();
  }

  /**
   * 分析是否应该保存
   */
  async analyze(message: string, response: string): Promise<SaveDecision> {
    for (const pattern of IGNORE_PATTERNS) {
      if (pattern.test(message.trim())) {
        return {
          shouldSave: false,
          confidence: 0.9,
          reason: '消息匹配忽略模式',
          suggestedImportance: 0,
          suggestedTags: [],
        };
      }
    }

    if (message.length < this.config.minContentLength) {
      return {
        shouldSave: false,
        confidence: 0.8,
        reason: '消息内容过短',
        suggestedImportance: 0,
        suggestedTags: [],
      };
    }

    if (response.length < this.config.minResponseLength) {
      return {
        shouldSave: false,
        confidence: 0.7,
        reason: '回复内容过短',
        suggestedImportance: 0,
        suggestedTags: [],
      };
    }

    const intentScore = this.detectSaveIntent(message);

    const importance = this.assessImportance(message, response);

    const tags = this.extractTags(message, response);

    const duplicateCheck = this.checkDuplication(message, response);
    if (duplicateCheck.isDuplicate) {
      return {
        shouldSave: false,
        confidence: 0.85,
        reason: `与最近保存的内容相似 (${duplicateCheck.similarity})`,
        suggestedImportance: 0,
        suggestedTags: [],
        duplicateOf: duplicateCheck.duplicateOf,
      };
    }

    const shouldSave = intentScore > 0.5 || importance > 0.6;
    const confidence = Math.max(intentScore, importance);

    if (shouldSave) {
      const contentHash = this.hashContent(message, response);
      this.recentSaves.set(contentHash, {
        content: `${message} ${response}`.slice(0, 500),
        timestamp: Date.now(),
      });
    }

    return {
      shouldSave,
      confidence,
      reason: shouldSave
        ? '检测到保存意图或高重要性内容'
        : '未检测到明显保存价值',
      suggestedImportance: importance,
      suggestedTags: tags,
    };
  }

  /**
   * 检测保存意图
   */
  private detectSaveIntent(message: string): number {
    const lowerMessage = message.toLowerCase();

    for (const keyword of this.config.saveIntentKeywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return 0.9;
      }
    }

    for (const keyword of this.config.summaryKeywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return 0.7;
      }
    }

    if (lowerMessage.includes('?') || lowerMessage.includes('？')) {
      return 0.2;
    }

    return 0.3;
  }

  /**
   * 评估内容重要性
   */
  private assessImportance(message: string, response: string): number {
    let score = 0.3;

    const lowerMessage = message.toLowerCase();

    for (const keyword of this.config.highImportanceKeywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        score += 0.3;
        break;
      }
    }

    if (score === 0.3) {
      for (const keyword of this.config.mediumImportanceKeywords) {
        if (lowerMessage.includes(keyword.toLowerCase())) {
          score += 0.15;
          break;
        }
      }
    }

    for (const keyword of this.config.lowImportanceKeywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        score -= 0.15;
        break;
      }
    }

    if (response.length > 500) {
      score += 0.1;
    }
    if (response.length > 1000) {
      score += 0.05;
    }

    if (response.includes('```')) {
      score += 0.15;
    }

    if (/\d+\.\s/.test(response)) {
      score += 0.05;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * 提取建议标签
   */
  private extractTags(message: string, response: string): string[] {
    const tags: string[] = [];
    const content = `${message} ${response}`.toLowerCase();

    const techTags: [string, string[]][] = [
      ['python', ['python', 'py ', 'pip', 'uv ', 'django', 'flask', 'fastapi']],
      ['javascript', ['javascript', 'js ', 'node', 'npm', 'react', 'vue', 'typescript']],
      ['docker', ['docker', 'container', '镜像', '容器']],
      ['git', ['git ', 'commit', 'branch', 'merge', 'pull request']],
      ['api', ['api', 'rest', 'graphql', 'endpoint']],
      ['database', ['database', 'sql', 'mysql', 'postgres', 'mongodb', 'redis']],
      ['testing', ['test', '测试', 'jest', 'pytest', 'unit test']],
    ];

    for (const [tag, keywords] of techTags) {
      if (keywords.some(kw => content.includes(kw))) {
        tags.push(tag);
      }
    }

    const taskTags: [RegExp, string][] = [
      [/实现|开发|写代码|coding|implement/, 'development'],
      [/调试|修复|bug|debug|fix/, 'debugging'],
      [/测试|test/, 'testing'],
      [/部署|deploy|发布/, 'deployment'],
      [/优化|optimize|性能/, 'optimization'],
      [/配置|config|设置/, 'configuration'],
    ];

    for (const [pattern, tag] of taskTags) {
      if (pattern.test(content)) {
        tags.push(tag);
      }
    }

    return [...new Set(tags)].slice(0, 5);
  }

  /**
   * 检查重复
   */
  private checkDuplication(
    message: string,
    response: string
  ): { isDuplicate: boolean; similarity: number; duplicateOf?: string } {
    const contentHash = this.hashContent(message, response);
    const contentSample = `${message} ${response}`.slice(0, 500).toLowerCase();

    for (const [hash, saved] of this.recentSaves) {
      if (hash === contentHash) {
        return { isDuplicate: true, similarity: 1, duplicateOf: hash };
      }

      const similarity = this.textSimilarity(contentSample, saved.content.toLowerCase());
      if (similarity > 0.85) {
        return { isDuplicate: true, similarity, duplicateOf: hash };
      }
    }

    return { isDuplicate: false, similarity: 0 };
  }

  /**
   * 生成内容哈希
   */
  private hashContent(message: string, response: string): string {
    const content = `${message}:${response}`.slice(0, 200);
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * 文本相似度（简化版）
   */
  private textSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 2));

    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);

    return intersection.size / union.size;
  }

  /**
   * 清理过期的最近保存记录
   */
  private cleanupRecentSaves(): void {
    const now = Date.now();
    for (const [hash, saved] of this.recentSaves) {
      if (now - saved.timestamp > this.RECENT_SAVE_TTL) {
        this.recentSaves.delete(hash);
      }
    }
  }

  /**
   * 分析任务完成后的总结是否值得保存
   */
  async analyzeTaskSummary(
    userRequest: string,
    summary: string,
    stepCount: number
  ): Promise<SaveDecision> {
    if (stepCount < 2) {
      return {
        shouldSave: false,
        confidence: 0.9,
        reason: '任务步骤过少，不生成总结',
        suggestedImportance: 0,
        suggestedTags: [],
      };
    }

    const importance = this.assessImportance(userRequest, summary);

    const hasValuableContent =
      summary.includes('```') ||
      summary.includes('步骤') ||
      summary.includes('方法') ||
      summary.includes('注意') ||
      /[一二三四五六七八九十\d]\./.test(summary);

    const shouldSave = importance > 0.5 && hasValuableContent;

    const tags = this.extractTags(userRequest, summary);

    return {
      shouldSave,
      confidence: importance,
      reason: shouldSave
        ? '任务包含有价值的经验和知识'
        : '任务总结价值较低',
      suggestedImportance: importance,
      suggestedTags: tags,
    };
  }
}

// ============ 全局实例 ============

let globalTrigger: SmartSaveTrigger | null = null;

/**
 * 获取智能保存触发器
 */
export function getSmartSaveTrigger(config?: Partial<SmartTriggerConfig>): SmartSaveTrigger {
  if (!globalTrigger) {
    globalTrigger = new SmartSaveTrigger(config);
  }
  return globalTrigger;
}

/**
 * 重置触发器
 */
export function resetSmartSaveTrigger(): void {
  globalTrigger = null;
}