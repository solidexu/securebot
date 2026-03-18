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