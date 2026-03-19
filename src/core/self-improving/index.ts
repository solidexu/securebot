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
  // Phase 2 类型
  SuccessPattern,
  SuccessPatternStoreConfig,
  ErrorPattern,
  ErrorPatternStoreConfig,
  ErrorType,
  TaskType,
  TaskExecution,
  TaskStep,
  AvoidCheckResult,
  // Phase 3 类型
  ReflectionResult,
  SuggestedAction,
  ReflectionEngineConfig,
  // Phase 4 类型
  DynamicPromptConfig,
  PromptOptimizerConfig,
  PromptPersonalization,
  GeneratedSkill,
  SkillGeneratorConfig,
  // Phase 5 类型（反馈处理）
  FeedbackAnalysis,
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

// 成功模式存储
export { 
  SuccessPatternStore, 
  getSuccessPatternStore, 
  resetSuccessPatternStore,
} from './success-pattern-store.js';

// 错误模式存储
export { 
  ErrorPatternStore, 
  getErrorPatternStore, 
  resetErrorPatternStore,
} from './error-pattern-store.js';

// 自我反思引擎
export { 
  SelfReflectionEngine, 
  getSelfReflectionEngine, 
  resetSelfReflectionEngine,
} from './reflection-engine.js';

// Prompt 优化器
export { 
  PromptOptimizer, 
  getPromptOptimizer, 
  resetPromptOptimizer,
} from './prompt-optimizer.js';

// 技能生成器
export { 
  SkillGenerator, 
  getSkillGenerator, 
  resetSkillGenerator,
} from './skill-generator.js';

// 反馈处理器
export { 
  FeedbackProcessor, 
  getFeedbackProcessor, 
  initFeedbackProcessor,
  resetFeedbackProcessor,
  type FeedbackAnalysis,
} from './feedback-processor.js';