# Agent Self-Improving 功能设计

## 1. 概述

### 1.1 目标

让每个 Agent 具备自我改进能力，通过学习用户反馈、任务执行结果和反思分析，持续优化自身表现。

### 1.2 核心理念

```
Experience → Reflection → Learning → Improvement
```

- **Experience**: 积累执行经验（成功/失败）
- **Reflection**: 分析经验，提取教训
- **Learning**: 更新知识库和偏好
- **Improvement**: 优化行为和配置

### 1.3 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                      Self-Improving System                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │   任务执行   │───▶│   结果收集   │───▶│   反思分析   │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
│         ▲                                     │                  │
│         │                                     ▼                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │   行为优化   │◀───│   知识更新   │◀───│   经验存储   │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

数据存储层:
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│ SuccessPattern │  │  ErrorPattern  │  │ ImprovementLog │
│     Store      │  │     Store      │  │     Store      │
└────────────────┘  └────────────────┘  └────────────────┘
```

---

## 2. 数据模型设计

### 2.1 扩展 AgentProfile

```typescript
// src/core/types.ts

/**
 * Agent 档案（扩展）
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
  stats: AgentStats;
  /** 学习到的偏好 */
  learnedPreferences: Record<string, unknown>;
  
  // ========== Self-Improving 扩展 ==========
  
  /** 改进日志 */
  improvementLog?: ImprovementLogEntry[];
  /** 成功模式摘要（用于快速检索） */
  successPatternSummary?: string;
  /** 错误模式摘要（用于快速检索） */
  errorPatternSummary?: string;
  /** 自我认知（Agent 对自己的认知） */
  selfAwareness?: AgentSelfAwareness;
  /** 最后反思时间 */
  lastReflectionAt?: string;
  /** 能力评分（各维度） */
  capabilityScores?: CapabilityScores;
}

/**
 * Agent 使用统计
 */
export interface AgentStats {
  totalSessions: number;
  totalMessages: number;
  lastUsed: string;
  
  // 扩展统计
  totalTasks?: number;
  successfulTasks?: number;
  failedTasks?: number;
  averageUserRating?: number;
}

/**
 * Agent 自我认知
 */
export interface AgentSelfAwareness {
  /** 自我评估的优势 */
  strengths: string[];
  /** 自我评估的劣势 */
  weaknesses: string[];
  /** 需要改进的领域 */
  improvementAreas: string[];
  /** 擅长的任务类型 */
  preferredTaskTypes: string[];
  /** 不擅长的任务类型 */
  avoidedTaskTypes: string[];
  /** 上次更新时间 */
  updatedAt: string;
}

/**
 * 能力评分
 */
export interface CapabilityScores {
  /** 代码能力 (0-100) */
  coding?: number;
  /** 分析能力 (0-100) */
  analysis?: number;
  /** 沟通能力 (0-100) */
  communication?: number;
  /** 创造力 (0-100) */
  creativity?: number;
  /** 准确性 (0-100) */
  accuracy?: number;
  /** 响应速度评分 (0-100) */
  responsiveness?: number;
  /** 最后更新时间 */
  updatedAt: string;
}
```

### 2.2 改进日志

```typescript
// src/core/self-improving/types.ts

/**
 * 改进日志条目
 */
export interface ImprovementLogEntry {
  /** 条目 ID */
  id: string;
  /** 时间戳 */
  timestamp: string;
  /** 触发来源 */
  trigger: ImprovementTrigger;
  /** 改进类型 */
  type: ImprovementType;
  /** 改进前的状态 */
  before: string;
  /** 改进后的状态 */
  after: string;
  /** 改进原因 */
  reason: string;
  /** 效果评分 (0-1, null 表示未评估) */
  effectiveness: number | null;
  /** 相关任务 ID */
  relatedTaskId?: string;
  /** 用户反馈 */
  userFeedback?: string;
}

/**
 * 改进触发来源
 */
export type ImprovementTrigger = 
  | 'user_feedback'      // 用户反馈
  | 'task_success'       // 任务成功
  | 'task_failure'       // 任务失败
  | 'reflection'         // 自我反思
  | 'pattern_learning'   // 模式学习
  | 'manual_adjustment'; // 手动调整

/**
 * 改进类型
 */
export type ImprovementType = 
  | 'preference_update'   // 偏好更新
  | 'behavior_change'     // 行为改变
  | 'knowledge_addition'  // 知识添加
  | 'skill_refinement'    // 技能精炼
  | 'prompt_optimization' // 提示词优化
  | 'tool_preference';    // 工具偏好
```

### 2.3 成功模式

```typescript
/**
 * 成功模式
 */
export interface SuccessPattern {
  /** 模式 ID */
  id: string;
  /** Agent ID */
  agentId: string;
  /** 任务类型 */
  taskType: string;
  /** 任务描述 */
  taskDescription: string;
  /** 上下文 */
  context: string;
  /** 采用的方法 */
  approach: string;
  /** 使用的工具 */
  toolsUsed: string[];
  /** 执行步骤 */
  steps: string[];
  /** 结果描述 */
  result: string;
  /** 用户反馈 */
  userFeedback?: string;
  /** 效果评分 (0-1) */
  effectiveness: number;
  /** 创建时间 */
  createdAt: string;
  /** 最后使用时间 */
  lastUsedAt?: string;
  /** 使用次数 */
  usageCount: number;
  
  // 检索字段
  /** 关键词 */
  keywords: string[];
  /** 任务模式（用于匹配） */
  taskPatterns: string[];
  /** 适用的前置条件 */
  applicableConditions: string[];
}

/**
 * 成功模式存储配置
 */
export interface SuccessPatternStoreConfig {
  /** 存储目录 */
  storageDir: string;
  /** 最大存储数量 */
  maxPatterns: number;
  /** 最小效果评分阈值 */
  minEffectiveness: number;
  /** 自动清理天数 */
  cleanupDays: number;
}
```

### 2.4 错误模式

```typescript
/**
 * 错误模式
 */
export interface ErrorPattern {
  /** 模式 ID */
  id: string;
  /** Agent ID */
  agentId: string;
  /** 错误类型 */
  errorType: ErrorType;
  /** 错误分类 */
  errorCategory: string;
  /** 任务上下文 */
  taskContext: string;
  /** 失败的方法 */
  failedApproach: string;
  /** 错误消息 */
  errorMessage: string;
  /** 堆栈信息（如果有） */
  stackTrace?: string;
  /** 根因分析 */
  rootCause?: string;
  /** 解决方案 */
  solution?: string;
  /** 避免规则 */
  avoidPatterns: string[];
  /** 发生次数 */
  occurrenceCount: number;
  /** 首次发生时间 */
  firstOccurrence: string;
  /** 最后发生时间 */
  lastOccurrence: string;
  /** 是否已解决 */
  resolved: boolean;
  /** 解决时间 */
  resolvedAt?: string;
}

/**
 * 错误类型
 */
export type ErrorType = 
  | 'tool_execution'    // 工具执行错误
  | 'planning'          // 规划错误
  | 'understanding'     // 理解错误
  | 'context'           // 上下文错误
  | 'timeout'           // 超时
  | 'resource'          // 资源错误
  | 'user_cancel'       // 用户取消
  | 'unknown';          // 未知错误
```

### 2.5 反思结果

```typescript
/**
 * 反思结果
 */
export interface ReflectionResult {
  /** 反思 ID */
  id: string;
  /** Agent ID */
  agentId: string;
  /** 反思时间 */
  reflectedAt: string;
  /** 分析的时间范围 */
  timeRange: {
    start: string;
    end: string;
  };
  /** 分析的任务数量 */
  tasksAnalyzed: number;
  
  /** 做得好的方面 */
  whatWentWell: string[];
  /** 可以改进的方面 */
  whatCouldBeImproved: string[];
  /** 学到的教训 */
  lessonsLearned: string[];
  /** 改进建议 */
  suggestedActions: SuggestedAction[];
  
  /** 自我评估 */
  selfAssessment: {
    overallPerformance: number;  // 整体表现 (0-100)
    confidenceLevel: number;      // 信心水平 (0-100)
    areasToFocus: string[];       // 需要关注的领域
  };
}

/**
 * 改进建议
 */
export interface SuggestedAction {
  /** 建议 ID */
  id: string;
  /** 优先级 */
  priority: 'high' | 'medium' | 'low';
  /** 类型 */
  type: ImprovementType;
  /** 描述 */
  description: string;
  /** 预期效果 */
  expectedOutcome: string;
  /** 实施难度 */
  difficulty: 'easy' | 'medium' | 'hard';
  /** 相关的成功模式 */
  relatedSuccessPattern?: string;
  /** 相关的错误模式 */
  relatedErrorPattern?: string;
}
```

---

## 3. 核心组件设计

### 3.1 用户反馈收集器

```typescript
// src/core/self-improving/feedback-collector.ts

/**
 * 用户反馈类型
 */
export type FeedbackType = 
  | 'rating'     // 评分
  | 'correction' // 纠正
  | 'suggestion' // 建议
  | 'preference' // 偏好
  | 'complaint'; // 投诉

/**
 * 用户反馈
 */
export interface UserFeedback {
  /** 反馈 ID */
  id: string;
  /** Agent ID */
  agentId: string;
  /** 会话 ID */
  sessionId: string;
  /** 任务 ID */
  taskId?: string;
  /** 反馈类型 */
  type: FeedbackType;
  /** 评分 (1-5) */
  rating?: number;
  /** 反馈内容 */
  content: string;
  /** 创建时间 */
  createdAt: string;
  /** 是否已处理 */
  processed: boolean;
  /** 处理结果 */
  processingResult?: string;
}

/**
 * 用户反馈收集器
 */
export class FeedbackCollector {
  private storage: FeedbackStorage;
  
  constructor(config: FeedbackCollectorConfig) {
    this.storage = new FeedbackStorage(config.storageDir);
  }
  
  /**
   * 收集用户反馈
   */
  async collect(feedback: Omit<UserFeedback, 'id' | 'createdAt' | 'processed'>): Promise<UserFeedback> {
    const entry: UserFeedback = {
      ...feedback,
      id: generateId(),
      createdAt: new Date().toISOString(),
      processed: false,
    };
    
    await this.storage.save(entry);
    
    // 发布反馈事件
    eventBus.publish({
      type: EventTypes.USER_FEEDBACK,
      timestamp: new Date(),
      agentId: feedback.agentId,
      sessionId: feedback.sessionId,
      payload: entry,
    });
    
    return entry;
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
  async analyzeTrends(agentId: string, days: number): Promise<FeedbackTrendAnalysis> {
    const feedback = await this.storage.listByAgentAndTimeRange(
      agentId,
      Date.now() - days * 24 * 60 * 60 * 1000,
      Date.now()
    );
    
    return {
      totalFeedback: feedback.length,
      averageRating: this.calculateAverageRating(feedback),
      feedbackByType: this.groupByType(feedback),
      commonIssues: this.extractCommonIssues(feedback),
      improvementAreas: this.identifyImprovementAreas(feedback),
    };
  }
}
```

### 3.2 成功模式存储

```typescript
// src/core/self-improving/success-pattern-store.ts

/**
 * 成功模式存储
 */
export class SuccessPatternStore {
  private config: SuccessPatternStoreConfig;
  private patterns: Map<string, SuccessPattern> = new Map();
  private index: PatternIndex;
  
  constructor(config: SuccessPatternStoreConfig) {
    this.config = config;
    this.index = new PatternIndex();
  }
  
  /**
   * 记录成功模式
   */
  async recordSuccess(
    agentId: string,
    task: TaskExecution,
    result: TaskResult
  ): Promise<SuccessPattern> {
    // 分析任务特征
    const taskType = this.classifyTask(task);
    const keywords = this.extractKeywords(task.description);
    const taskPatterns = this.extractPatterns(task.description);
    
    const pattern: SuccessPattern = {
      id: generateId(),
      agentId,
      taskType,
      taskDescription: task.description,
      context: this.buildContext(task),
      approach: this.summarizeApproach(task.steps),
      toolsUsed: task.toolsUsed,
      steps: task.steps.map(s => s.description),
      result: result.summary,
      userFeedback: result.userFeedback,
      effectiveness: this.calculateEffectiveness(result),
      createdAt: new Date().toISOString(),
      usageCount: 0,
      keywords,
      taskPatterns,
      applicableConditions: this.extractConditions(task),
    };
    
    // 存储模式
    this.patterns.set(pattern.id, pattern);
    await this.persist(pattern);
    
    // 更新索引
    this.index.add(pattern);
    
    // 清理旧模式
    await this.cleanup();
    
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
    const keywords = this.extractKeywords(taskDescription);
    const patterns = this.index.search(agentId, keywords, limit);
    
    // 按效果评分和使用次数排序
    return patterns.sort((a, b) => {
      const scoreA = a.effectiveness * 0.7 + (a.usageCount / 100) * 0.3;
      const scoreB = b.effectiveness * 0.7 + (b.usageCount / 100) * 0.3;
      return scoreB - scoreA;
    });
  }
  
  /**
   * 获取最佳实践
   */
  async getBestPractices(agentId: string, taskType?: string): Promise<SuccessPattern[]> {
    let patterns = Array.from(this.patterns.values())
      .filter(p => p.agentId === agentId);
    
    if (taskType) {
      patterns = patterns.filter(p => p.taskType === taskType);
    }
    
    // 按效果评分排序
    return patterns
      .sort((a, b) => b.effectiveness - a.effectiveness)
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
   * 分类任务
   */
  private classifyTask(task: TaskExecution): string {
    const classifiers: Record<string, string[]> = {
      'coding': ['写代码', '实现', '开发', '编程', 'debug'],
      'analysis': ['分析', '研究', '调查', '理解', '解释'],
      'writing': ['写', '撰写', '生成', '创建文档'],
      'planning': ['计划', '规划', '设计', '架构'],
      'execution': ['执行', '运行', '部署', '配置'],
    };
    
    const text = task.description.toLowerCase();
    for (const [type, keywords] of Object.entries(classifiers)) {
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
    // 简单实现：提取中文词汇和英文单词
    const words = text.match(/[\u4e00-\u9fa5]+|[a-zA-Z]+/g) || [];
    const stopWords = new Set(['的', '是', '在', '有', '和', '了', '不', '这', '那', '我', '你']);
    return [...new Set(words.filter(w => !stopWords.has(w) && w.length > 1))];
  }
  
  /**
   * 提取模式
   */
  private extractPatterns(text: string): string[] {
    // 提取任务模式，如 "创建 XXX", "修复 XXX", "分析 XXX"
    const patterns: string[] = [];
    const patternRegex = /(创建|实现|开发|修复|分析|设计|优化|配置|部署|测试)[\u4e00-\u9fa5]+/g;
    let match;
    while ((match = patternRegex.exec(text)) !== null) {
      patterns.push(match[0]);
    }
    return patterns;
  }
  
  /**
   * 计算效果评分
   */
  private calculateEffectiveness(result: TaskResult): number {
    let score = 0.5; // 基础分
    
    // 成功加分
    if (result.success) score += 0.3;
    
    // 用户反馈加分
    if (result.userFeedback) {
      if (result.userFeedback.includes('很好') || result.userFeedback.includes('完美')) {
        score += 0.2;
      } else if (result.userFeedback.includes('不错')) {
        score += 0.1;
      }
    }
    
    // 用户评分
    if (result.userRating !== undefined) {
      score = score * 0.5 + (result.userRating / 5) * 0.5;
    }
    
    return Math.min(1, Math.max(0, score));
  }
}
```

### 3.3 错误模式存储

```typescript
// src/core/self-improving/error-pattern-store.ts

/**
 * 错误模式存储
 */
export class ErrorPatternStore {
  private config: ErrorPatternStoreConfig;
  private patterns: Map<string, ErrorPattern> = new Map();
  
  /**
   * 记录错误模式
   */
  async recordError(
    agentId: string,
    error: Error,
    context: TaskContext
  ): Promise<ErrorPattern> {
    // 检查是否已存在相同错误
    const existingPattern = this.findExistingPattern(error, context);
    
    if (existingPattern) {
      // 更新现有模式
      existingPattern.occurrenceCount++;
      existingPattern.lastOccurrence = new Date().toISOString();
      await this.persist(existingPattern);
      return existingPattern;
    }
    
    // 创建新模式
    const pattern: ErrorPattern = {
      id: generateId(),
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
    await this.persist(pattern);
    
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
    
    // 使用 LLM 分析根因
    const analysis = await this.llmAnalyze(`
分析以下错误的根本原因：

错误类型: ${pattern.errorType}
错误消息: ${pattern.errorMessage}
任务上下文: ${pattern.taskContext}
失败的方法: ${pattern.failedApproach}

请分析：
1. 根本原因是什么？
2. 为什么会发生？
3. 如何避免？
    `);
    
    pattern.rootCause = analysis.rootCause;
    pattern.solution = analysis.solution;
    await this.persist(pattern);
    
    return analysis.rootCause;
  }
  
  /**
   * 检查是否应该避免某种方法
   */
  async shouldAvoid(agentId: string, approach: string): Promise<{
    shouldAvoid: boolean;
    reason?: string;
    alternative?: string;
  }> {
    const patterns = Array.from(this.patterns.values())
      .filter(p => p.agentId === agentId && !p.resolved);
    
    for (const pattern of patterns) {
      // 检查是否匹配避免模式
      const match = pattern.avoidPatterns.some(ap => 
        approach.toLowerCase().includes(ap.toLowerCase())
      );
      
      if (match) {
        return {
          shouldAvoid: true,
          reason: `之前发生过类似错误: ${pattern.errorMessage}`,
          alternative: pattern.solution,
        };
      }
    }
    
    return { shouldAvoid: false };
  }
  
  /**
   * 获取建议的修复方案
   */
  async getSuggestedFix(agentId: string, errorType: string): Promise<string | null> {
    const pattern = Array.from(this.patterns.values())
      .filter(p => p.agentId === agentId && p.errorType === errorType && p.solution)
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount)[0];
    
    return pattern?.solution ?? null;
  }
  
  /**
   * 分类错误
   */
  private classifyError(error: Error): ErrorType {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('tool') || message.includes('execute')) return 'tool_execution';
    if (message.includes('plan')) return 'planning';
    if (message.includes('understand') || message.includes('parse')) return 'understanding';
    if (message.includes('memory') || message.includes('context')) return 'context';
    if (message.includes('cancel')) return 'user_cancel';
    if (message.includes('memory') || message.includes('disk')) return 'resource';
    
    return 'unknown';
  }
  
  /**
   * 生成避免模式
   */
  private generateAvoidPatterns(error: Error, context: TaskContext): string[] {
    const patterns: string[] = [];
    
    // 从错误消息提取
    const errorKeywords = error.message.match(/[\u4e00-\u9fa5]+|[a-zA-Z]+/g) || [];
    patterns.push(...errorKeywords.filter(w => w.length > 2));
    
    // 从失败方法提取
    if (context.approach) {
      patterns.push(context.approach);
    }
    
    return [...new Set(patterns)];
  }
  
  /**
   * 查找现有模式
   */
  private findExistingPattern(error: Error, context: TaskContext): ErrorPattern | null {
    return Array.from(this.patterns.values())
      .filter(p => 
        p.errorMessage === error.message &&
        p.taskContext === context.taskDescription
      )[0] || null;
  }
}
```

### 3.4 自我反思引擎

```typescript
// src/core/self-improving/reflection-engine.ts

/**
 * 自我反思引擎
 */
export class SelfReflectionEngine {
  private modelAdapter: ModelAdapter;
  private successStore: SuccessPatternStore;
  private errorStore: ErrorPatternStore;
  
  constructor(config: ReflectionEngineConfig) {
    this.modelAdapter = config.modelAdapter;
    this.successStore = config.successStore;
    this.errorStore = config.errorStore;
  }
  
  /**
   * 定期反思（分析最近的任务）
   */
  async reflect(
    agentId: string,
    timeWindow: number = 24 * 60 * 60 * 1000 // 默认 24 小时
  ): Promise<ReflectionResult> {
    // 获取时间范围内的数据
    const [successes, errors, feedback] = await Promise.all([
      this.successStore.getByTimeRange(agentId, timeWindow),
      this.errorStore.getByTimeRange(agentId, timeWindow),
      this.feedbackCollector.getRecentFeedback(agentId, timeWindow),
    ]);
    
    // 使用 LLM 进行反思
    const reflection = await this.performReflection(successes, errors, feedback);
    
    // 存储反思结果
    await this.persistReflection(reflection);
    
    // 生成改进建议
    const actions = await this.generateImprovementActions(reflection);
    reflection.suggestedActions = actions;
    
    return reflection;
  }
  
  /**
   * 任务后反思
   */
  async reflectOnTask(
    agentId: string,
    task: TaskExecution,
    result: TaskResult
  ): Promise<ReflectionResult> {
    const successes = result.success ? [{
      taskDescription: task.description,
      approach: task.approach,
      effectiveness: result.userRating ? result.userRating / 5 : 0.7,
    }] : [];
    
    const errors = result.success ? [] : [{
      errorMessage: result.error,
      taskContext: task.description,
      failedApproach: task.approach,
    }];
    
    const feedback = result.userFeedback ? [{
      type: 'suggestion' as const,
      content: result.userFeedback,
      rating: result.userRating,
    }] : [];
    
    return this.performReflection(successes, errors, feedback);
  }
  
  /**
   * 执行反思（使用 LLM）
   */
  private async performReflection(
    successes: SuccessPattern[],
    errors: ErrorPattern[],
    feedback: UserFeedback[]
  ): Promise<ReflectionResult> {
    const prompt = this.buildReflectionPrompt(successes, errors, feedback);
    
    const response = await this.modelAdapter.chat({
      model: this.config.reflectionModel,
      messages: [
        { role: 'system', content: REFLECTION_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    });
    
    return this.parseReflectionResponse(response.content);
  }
  
  /**
   * 构建反思提示词
   */
  private buildReflectionPrompt(
    successes: SuccessPattern[],
    errors: ErrorPattern[],
    feedback: UserFeedback[]
  ): string {
    const sections: string[] = [];
    
    // 成功案例
    if (successes.length > 0) {
      sections.push(`## 成功案例 (${successes.length} 个)
${successes.map(s => `- 任务: ${s.taskDescription}
  方法: ${s.approach}
  效果: ${s.effectiveness.toFixed(2)}
`).join('\n')}`);
    }
    
    // 失败案例
    if (errors.length > 0) {
      sections.push(`## 失败案例 (${errors.length} 个)
${errors.map(e => `- 任务: ${e.taskContext}
  错误: ${e.errorMessage}
  失败方法: ${e.failedApproach}
`).join('\n')}`);
    }
    
    // 用户反馈
    if (feedback.length > 0) {
      sections.push(`## 用户反馈 (${feedback.length} 条)
${feedback.map(f => `- 类型: ${f.type}
  内容: ${f.content}
  ${f.rating ? `评分: ${f.rating}/5` : ''}
`).join('\n')}`);
    }
    
    sections.push(`
## 请分析并回答：

1. **做得好的方面**：列出 3-5 个做得好的方面
2. **需要改进的方面**：列出 3-5 个需要改进的方面
3. **学到的教训**：列出 3-5 条学到的教训
4. **自我评估**：
   - 整体表现 (0-100)
   - 信心水平 (0-100)
   - 需要关注的领域

请以 JSON 格式输出：
{
  "whatWentWell": [...],
  "whatCouldBeImproved": [...],
  "lessonsLearned": [...],
  "selfAssessment": {
    "overallPerformance": number,
    "confidenceLevel": number,
    "areasToFocus": [...]
  }
}`);
    
    return sections.join('\n\n');
  }
  
  /**
   * 生成改进建议
   */
  private async generateImprovementActions(
    reflection: ReflectionResult
  ): Promise<SuggestedAction[]> {
    const actions: SuggestedAction[] = [];
    
    // 基于需要改进的方面生成建议
    for (const area of reflection.whatCouldBeImproved) {
      const action = await this.createAction(area, reflection);
      if (action) {
        actions.push(action);
      }
    }
    
    // 按优先级排序
    return actions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }
  
  /**
   * 创建改进建议
   */
  private async createAction(
    area: string,
    reflection: ReflectionResult
  ): Promise<SuggestedAction | null> {
    // 简单映射规则
    const actionMapping: Record<string, Partial<SuggestedAction>> = {
      '响应速度': {
        type: 'behavior_change',
        difficulty: 'easy',
        expectedOutcome: '提升响应效率',
      },
      '准确性': {
        type: 'knowledge_addition',
        difficulty: 'medium',
        expectedOutcome: '提高回答准确率',
      },
      '沟通': {
        type: 'prompt_optimization',
        difficulty: 'easy',
        expectedOutcome: '改善沟通效果',
      },
    };
    
    for (const [key, template] of Object.entries(actionMapping)) {
      if (area.includes(key)) {
        return {
          id: generateId(),
          priority: 'medium',
          ...template,
          description: `改进: ${area}`,
        } as SuggestedAction;
      }
    }
    
    return {
      id: generateId(),
      priority: 'low',
      type: 'behavior_change',
      description: area,
      expectedOutcome: '持续改进',
      difficulty: 'medium',
    };
  }
}

/**
 * 反思系统提示词
 */
const REFLECTION_SYSTEM_PROMPT = `你是一个 AI Agent 的自我反思助手。你的任务是帮助 Agent 分析其执行记录，提取经验教训，并生成改进建议。

分析时请：
1. 客观评价，不夸大不贬低
2. 关注可操作的建议
3. 从失败中学习
4. 识别模式和趋势

输出格式必须是有效的 JSON。`;
```

---

## 4. 工作流程设计

### 4.1 任务执行流程（增强版）

```
┌─────────────────────────────────────────────────────────────────────┐
│                        任务执行流程                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. 接收任务                                                         │
│     │                                                                │
│     ▼                                                                │
│  2. 检索相似成功模式                                                  │
│     ┌─────────────────────────────────────┐                         │
│     │ SuccessStore.findSimilarSuccess()   │                         │
│     │ → 获取相关经验和最佳实践             │                         │
│     └─────────────────────────────────────┘                         │
│     │                                                                │
│     ▼                                                                │
│  3. 检查避免模式                                                      │
│     ┌─────────────────────────────────────┐                         │
│     │ ErrorStore.shouldAvoid()            │                         │
│     │ → 避免已知错误方法                   │                         │
│     └─────────────────────────────────────┘                         │
│     │                                                                │
│     ▼                                                                │
│  4. 构建增强的 System Prompt                                          │
│     ┌─────────────────────────────────────┐                         │
│     │ + 成功经验摘要                       │                         │
│     │ + 避免事项                           │                         │
│     │ + 学习到的偏好                       │                         │
│     │ + 最近教训                           │                         │
│     └─────────────────────────────────────┘                         │
│     │                                                                │
│     ▼                                                                │
│  5. 执行任务                                                          │
│     │                                                                │
│     ├──── 成功 ────┐                                                  │
│     │              ▼                                                  │
│     │      记录成功模式                                                │
│     │      SuccessStore.recordSuccess()                              │
│     │              │                                                  │
│     │              ▼                                                  │
│     │      询问用户反馈                                                │
│     │      FeedbackCollector.collect()                               │
│     │                                                                 │
│     ├──── 失败 ────┐                                                  │
│     │              ▼                                                  │
│     │      记录错误模式                                                │
│     │      ErrorStore.recordError()                                  │
│     │              │                                                  │
│     │              ▼                                                  │
│     │      分析根因                                                    │
│     │      ErrorStore.analyzeRootCause()                             │
│     │                                                                 │
│     ▼                                                                │
│  6. 任务后反思                                                        │
│     ReflectionEngine.reflectOnTask()                                 │
│     │                                                                │
│     ▼                                                                │
│  7. 更新 Agent Profile                                               │
│     - 改进日志                                                        │
│     - 自我认知                                                        │
│     - 能力评分                                                        │
│     │                                                                │
│     ▼                                                                │
│  8. 返回结果                                                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 定期反思流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                        定期反思流程                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  触发条件：                                                           │
│  - 每天首次启动时                                                     │
│  - 累计 50 次任务后                                                   │
│  - 用户手动触发 /reflect                                              │
│                                                                      │
│  流程：                                                               │
│                                                                      │
│  1. 收集数据                                                         │
│     ├── 最近 24 小时的成功模式                                        │
│     ├── 最近 24 小时的错误模式                                        │
│     ├── 最近 24 小时的用户反馈                                        │
│     └── 当前 Agent Profile                                           │
│                                                                      │
│  2. 执行反思                                                         │
│     └── ReflectionEngine.reflect()                                   │
│                                                                      │
│  3. 生成报告                                                         │
│     ├── 做得好的方面                                                  │
│     ├── 需要改进的方面                                                │
│     ├── 学到的教训                                                    │
│     └── 改进建议                                                      │
│                                                                      │
│  4. 应用改进                                                         │
│     ├── 更新 learnedPreferences                                      │
│     ├── 更新 selfAwareness                                           │
│     ├── 更新 capabilityScores                                        │
│     └── 记录 improvementLog                                          │
│                                                                      │
│  5. 可选：生成新技能                                                  │
│     └── 如果发现高频成功模式，生成 Skill                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. CLI 命令设计

### 5.1 用户反馈命令

```
/feedback <rating> [comment]    # 提交反馈
  /feedback 5 完美解决           # 5分好评
  /feedback 3 还可以更快        # 3分带评论
  /feedback bad 太慢了           # 负面反馈

/rate                            # 对最近任务评分
  系统会展示：请为最近的任务评分 (1-5)
```

### 5.2 Self-Improving 管理命令

```
/improve                         # 查看 Agent 自我改进状态
  显示：
  - 最近改进记录
  - 能力评分
  - 改进建议

/improve reflect                 # 触发自我反思
  系统会：
  - 分析最近任务
  - 生成反思报告
  - 应用改进

/improve patterns                # 查看学习到的模式
  显示：
  - 成功模式列表
  - 错误模式列表
  - 避免规则

/improve reset                   # 重置学习数据
  清除：
  - 成功模式
  - 错误模式
  - 改进日志

/improve export                  # 导出学习数据
  生成 JSON 文件

/improve import <file>           # 导入学习数据
  从 JSON 文件导入
```

---

## 6. 配置设计

### 6.1 Agent 配置扩展

```json
{
  "id": "dev",
  "name": "开发助手",
  "workspace": "./workspaces/dev",
  "selfImprovement": {
    "enabled": true,
    "successPatternRetention": 100,
    "errorPatternRetention": 50,
    "reflectionInterval": 86400000,
    "autoApplyImprovements": true,
    "learningRate": 0.1
  }
}
```

### 6.2 全局配置

```typescript
interface SelfImprovementConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 成功模式最大保留数 */
  successPatternRetention: number;
  /** 错误模式最大保留数 */
  errorPatternRetention: number;
  /** 反思间隔（毫秒） */
  reflectionInterval: number;
  /** 是否自动应用改进 */
  autoApplyImprovements: boolean;
  /** 学习率 (0-1) */
  learningRate: number;
  /** 最小效果评分阈值 */
  minEffectivenessThreshold: number;
  /** 反思模型 */
  reflectionModel?: string;
}
```

---

## 7. 存储设计

### 7.1 目录结构

```
~/.securebot/
├── memory/
│   ├── profiles/
│   │   ├── agent_dev.json          # Agent 档案（含 self-improving 数据）
│   │   └── user.json
│   └── daily/
├── self-improving/
│   ├── dev/                         # Agent ID
│   │   ├── success-patterns.json    # 成功模式
│   │   ├── error-patterns.json      # 错误模式
│   │   ├── improvement-log.json     # 改进日志
│   │   └── reflections/             # 反思记录
│   │       ├── 2026-03-18.json
│   │       └── ...
│   └── feedback/
│       └── pending.json             # 待处理反馈
```

### 7.2 数据持久化

```typescript
class SelfImprovingStorage {
  private basePath: string;
  
  async saveSuccessPattern(agentId: string, pattern: SuccessPattern): Promise<void> {
    const path = join(this.basePath, agentId, 'success-patterns.json');
    await this.appendToJsonArray(path, pattern);
  }
  
  async saveErrorPattern(agentId: string, pattern: ErrorPattern): Promise<void> {
    const path = join(this.basePath, agentId, 'error-patterns.json');
    await this.appendToJsonArray(path, pattern);
  }
  
  async saveImprovementLog(agentId: string, entry: ImprovementLogEntry): Promise<void> {
    const path = join(this.basePath, agentId, 'improvement-log.json');
    await this.appendToJsonArray(path, entry);
  }
  
  async saveReflection(agentId: string, result: ReflectionResult): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    const path = join(this.basePath, agentId, 'reflections', `${date}.json`);
    await writeJson(path, result);
  }
}
```

---

## 8. 实施计划

### Phase 1: 基础能力（1-2 周）

**目标**: 建立反馈收集和基础学习机制

**任务**:
1. 扩展 AgentProfile 数据结构
2. 实现 FeedbackCollector
3. 添加 `/feedback` 命令
4. 实现基础 ImprovementLog
5. 任务完成后自动询问反馈

**验收标准**:
- 用户可以提交反馈
- 反馈被持久化存储
- Agent Profile 包含改进日志

### Phase 2: 经验积累（2-3 周）

**目标**: 建立成功/错误模式库

**任务**:
1. 实现 SuccessPatternStore
2. 实现 ErrorPatternStore
3. 实现模式匹配和检索
4. 在任务执行中集成模式查询
5. 添加 `/improve patterns` 命令

**验收标准**:
- 成功任务被记录
- 失败任务被分析
- 相似任务可以检索到历史经验

### Phase 3: 自我反思（2-3 周）

**目标**: 实现 LLM 驱动的反思能力

**任务**:
1. 实现 SelfReflectionEngine
2. 实现定期反思机制
3. 实现任务后反思
4. 生成改进建议
5. 添加 `/improve reflect` 命令

**验收标准**:
- Agent 可以自我反思
- 生成有意义的改进建议
- 反思结果被持久化

### Phase 4: 能力进化（3-4 周）

**目标**: 实现基于学习的自动改进

**任务**:
1. 实现动态 Prompt 优化
2. 实现偏好自动更新
3. 实现能力评分计算
4. 实现从成功模式生成技能
5. 添加 `/improve` 综合管理命令

**验收标准**:
- Agent Prompt 随学习动态调整
- 用户偏好被自动学习
- 高频成功模式转化为技能

---

## 9. 风险与缓解

### 9.1 风险分析

| 风险 | 影响 | 可能性 | 缓解措施 |
|------|------|--------|----------|
| 学习错误模式导致表现下降 | 高 | 中 | 设置学习率上限，人工确认关键改进 |
| 存储空间膨胀 | 中 | 高 | 设置保留上限，定期清理旧数据 |
| 反思消耗过多资源 | 中 | 中 | 限制反思频率，异步执行 |
| 用户反馈偏差 | 中 | 中 | 综合多种信号，不只依赖显式反馈 |

### 9.2 安全考虑

1. **数据隔离**: 每个 Agent 的学习数据独立存储
2. **隐私保护**: 用户敏感信息不进入学习数据
3. **回滚机制**: 支持撤销学习结果
4. **审核机制**: 关键改进需要用户确认

---

## 10. 总结

本设计文档描述了 Agent Self-Improving 功能的完整架构，包括：

- **三层架构**: 偏好学习 → 经验积累 → 能力进化
- **核心组件**: 反馈收集器、成功模式存储、错误模式存储、反思引擎
- **工作流程**: 任务执行增强、定期反思
- **实施计划**: 四阶段渐进实现

通过该系统，Agent 将能够：
1. 从用户反馈中学习
2. 积累成功经验
3. 避免重复错误
4. 持续自我改进

这将使 SecureBot 的 Agent 真正具备"越用越聪明"的能力。