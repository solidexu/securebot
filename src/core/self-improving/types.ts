/**
 * Self-Improving 类型定义
 * 
 * Agent 自我改进功能的核心类型
 */

// ============ 改进日志 ============

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

// ============ 用户反馈 ============

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
 * 反馈趋势分析
 */
export interface FeedbackTrendAnalysis {
  /** 总反馈数 */
  totalFeedback: number;
  /** 平均评分 */
  averageRating: number;
  /** 按类型分组 */
  feedbackByType: Record<FeedbackType, number>;
  /** 常见问题 */
  commonIssues: string[];
  /** 改进领域 */
  improvementAreas: string[];
}

// ============ Agent 自我认知 ============

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

/**
 * Agent 使用统计（扩展）
 */
export interface AgentStats {
  totalSessions: number;
  totalMessages: number;
  lastUsed: string;
  /** 总任务数 */
  totalTasks?: number;
  /** 成功任务数 */
  successfulTasks?: number;
  /** 失败任务数 */
  failedTasks?: number;
  /** 平均用户评分 */
  averageUserRating?: number;
}

// ============ 成功模式 ============

/**
 * 任务类型
 */
export type TaskType = 
  | 'coding'      // 代码开发
  | 'analysis'    // 分析研究
  | 'writing'     // 写作
  | 'planning'    // 规划设计
  | 'execution'   // 执行部署
  | 'debugging'   // 调试修复
  | 'learning'    // 学习教学
  | 'general';    // 通用任务

/**
 * 成功模式
 */
export interface SuccessPattern {
  /** 模式 ID */
  id: string;
  /** Agent ID */
  agentId: string;
  /** 任务类型 */
  taskType: TaskType;
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

// ============ 错误模式 ============

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
 * 错误模式存储配置
 */
export interface ErrorPatternStoreConfig {
  /** 存储目录 */
  storageDir: string;
  /** 最大存储数量 */
  maxPatterns: number;
  /** 自动清理天数 */
  cleanupDays: number;
}

/**
 * 避免检查结果
 */
export interface AvoidCheckResult {
  /** 是否应该避免 */
  shouldAvoid: boolean;
  /** 原因 */
  reason?: string;
  /** 替代方案 */
  alternative?: string;
  /** 匹配的错误模式 ID */
  matchedPatternId?: string;
}

// ============ 任务执行记录 ============

/**
 * 任务执行记录（用于模式提取）
 */
export interface TaskExecution {
  /** 任务 ID */
  id: string;
  /** Agent ID */
  agentId: string;
  /** 任务描述 */
  description: string;
  /** 任务类型 */
  taskType: TaskType;
  /** 使用的方法 */
  approach: string;
  /** 使用的工具 */
  toolsUsed: string[];
  /** 执行步骤 */
  steps: TaskStep[];
  /** 是否成功 */
  success: boolean;
  /** 结果摘要 */
  resultSummary?: string;
  /** 错误信息 */
  error?: string;
  /** 用户评分 */
  userRating?: number;
  /** 用户反馈 */
  userFeedback?: string;
  /** 执行时间 */
  duration?: number;
  /** 时间戳 */
  timestamp: string;
}

/**
 * 任务步骤
 */
export interface TaskStep {
  /** 步骤 ID */
  id: string;
  /** 步骤描述 */
  description: string;
  /** 使用的工具 */
  tool?: string;
  /** 是否成功 */
  success: boolean;
}

// ============ 反思结果 ============

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
    overallPerformance: number;  // 0-100
    confidenceLevel: number;      // 0-100
    areasToFocus: string[];
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

/**
 * 反思引擎配置
 */
export interface ReflectionEngineConfig {
  /** 反思模型 */
  model: string;
  /** 默认分析时间窗口（毫秒） */
  defaultTimeWindow: number;
  /** 最大分析任务数 */
  maxTasksToAnalyze: number;
  /** 存储目录 */
  storageDir: string;
}

// ============ 配置 ============

/**
 * Self-Improving 配置
 */
export interface SelfImprovementConfig {
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
  /** 反馈收集目录 */
  feedbackDir: string;
}

/**
 * 默认配置
 */
export const DEFAULT_SELF_IMPROVEMENT_CONFIG: SelfImprovementConfig = {
  enabled: true,
  successPatternRetention: 100,
  errorPatternRetention: 50,
  reflectionInterval: 24 * 60 * 60 * 1000, // 24 小时
  autoApplyImprovements: true,
  learningRate: 0.1,
  minEffectivenessThreshold: 0.6,
  feedbackDir: '',
};