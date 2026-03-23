/**
 * Ralph Loop 模块入口
 * 
 * 导出 Ralph Loop 相关的类型和功能
 */

// 类型定义
export type {
  RalphStory,
  RalphPRD,
  RalphProgress,
  RalphConfig,
  RalphResult,
  RalphIteration,
  RalphModeOptions,
} from './types.js';

// 执行器
export {
  RalphExecutor,
  createPRDFromDescription,
  loadPRD,
  savePRD,
  getNextTask,
  updateStoryStatus,
  allTasksComplete,
  initProgressFile,
  appendProgress,
  buildIterationPrompt,
  DEFAULT_RALPH_CONFIG,
} from './executor.js';

// 状态桥接
export {
  prdToTaskPlan,
  taskPlanToPRD,
  storyToTaskStep,
  taskStepToStory,
  syncPRDToPlan,
  syncPlanToPRD,
  diffPRD,
  getPRDStats,
  formatPRDStats,
  type PRDDiff,
  type PRDStats,
} from './state-bridge.js';

// 进度同步
export {
  parseProgressFile,
  progressToMemoryEntry,
  syncProgressToMemory,
  extractPatterns,
  generatePatternSummary,
  type ParsedProgressEntry,
  type ProgressSyncConfig,
  DEFAULT_SYNC_CONFIG,
} from './progress-sync.js';

// 反馈循环
export {
  executeCommand,
  executeCommands,
  runFeedbackLoop,
  runFeedbackLoopWithRetry,
  detectFeedbackConfig,
  type FeedbackResult,
  type FeedbackConfig,
  type FeedbackLoopResult,
  FEEDBACK_PRESETS,
  DEFAULT_FEEDBACK_CONFIG,
} from './feedback.js';