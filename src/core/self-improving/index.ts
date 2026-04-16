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
} from './feedback-processor.js';

// 统一偏好管理器
export { 
  UnifiedPreferenceManager, 
  getUnifiedPreferenceManager, 
  resetUnifiedPreferenceManager,
  type GlobalPreferences,
  type AgentPreferences,
  type PreferenceSource,
  type PreferenceEntry,
  type UnifiedPreferencesStore,
} from './unified-preferences.js';

// 统一数据存储
export { 
  UnifiedStore, 
  getUnifiedStore, 
  resetUnifiedStore,
  type UnifiedEntry,
  type UnifiedEntryType,
  type UnifiedSearchOptions,
  type UnifiedSearchResult,
  type UnifiedStoreConfig,
} from './unified-store.js';

// 经验有效性评估
export {
  ExperienceEvaluator,
  ExperienceMerger,
  getExperienceEvaluator,
  getExperienceMerger,
  type DimensionScores,
  type ExperienceScore,
  type EvaluatorConfig,
  type SimilarGroup,
  type MergedExperience,
} from './experience-evaluator.js';

// 技能版本管理
export {
  SkillVersionManager,
  getSkillVersionManager,
  resetSkillVersionManager,
  type SkillVersion,
  type SkillDiff,
  type VersionHistory,
  type VersionManagerConfig,
} from './skill-version.js';

// 用户确认管理
export {
  UserConfirmationManager,
  getUserConfirmationManager,
  resetUserConfirmationManager,
  buildSkillGenerationRequest,
  buildSkillMergeRequest,
  buildSkillRetireRequest,
  type ConfirmationType,
  type ConfirmationRequest,
  type ConfirmationResult,
  type ConfirmationManagerConfig,
} from './user-confirmation.js';

// 经验分类体系
export {
  ExperienceTaxonomy,
  getExperienceTaxonomy,
  resetExperienceTaxonomy,
  type ExperienceCategory,
  type ClassificationDimension,
  type ClassificationResult,
  type CategoryTreeNode,
  type TaxonomyConfig,
} from './experience-taxonomy.js';
// 技能创建提醒（周期性 Nudge）
export {
  SkillNudgeManager,
  getSkillNudgeManager,
  resetSkillNudgeManager,
  DEFAULT_NUDGE_CONFIG,
  DEFAULT_NUDGE_TEMPLATE,
  ERROR_FIX_NUDGE_TEMPLATE,
  isSkillCreationTool,
  checkAndGenerateNudge,
  type SkillNudgeConfig,
} from './skill-nudge.js';

// Nudge 集成工具
export {
  setupNudgeIntegration,
  generateNudgeAfterResponse,
  injectNudgeToPrompt,
  injectNudgeToUserMessage,
  manualTriggerNudge,
  updateNudgeConfigFromSettings,
} from './nudge-integration.js';
