/**
 * Self-Improving 模块
 * 
 * Agent 自我改进功能
 */

// 类型导出
export type {
  ImprovementLogEntry,
  ImprovementTrigger,
  ImprovementType,
  UserFeedback,
  FeedbackType,
  FeedbackTrendAnalysis,
  AgentSelfAwareness,
  CapabilityScores,
  AgentStats,
  SelfImprovementConfig,
} from './types.js';

export { DEFAULT_SELF_IMPROVEMENT_CONFIG } from './types.js';

// 反馈收集器
export { 
  FeedbackCollector, 
  getFeedbackCollector, 
  resetFeedbackCollector,
  type FeedbackCollectorConfig 
} from './feedback-collector.js';

// 改进日志
export { 
  ImprovementLogManager, 
  getImprovementLogManager, 
  resetImprovementLogManager,
  type ImprovementLogConfig 
} from './improvement-log.js';