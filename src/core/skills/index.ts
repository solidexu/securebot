/**
 * Skills 模块导出
 * 
 * 渐进式加载的 Markdown 技能系统
 */

// 类型定义
export type {
  MarkdownSkill,
  SkillTrigger,
  WorkflowStep,
  SkillExample,
  ResourceReference,
  SkillMetadata,
  MatchedSkill,
  SkillLoaderConfig,
  WorkflowContext,
  WorkflowResult,
  StepResult,
  ResourceType,
  ResourceLoadResult,
  ScriptExecutionResult,
  LegacySkill,
  SkillMatchResult,
} from './types.js';

// 解析器
export {
  parseSkillFile,
  extractOverview,
} from './parser.js';

// 加载器
export {
  SkillLoader,
  getSkillLoader,
  resetSkillLoader,
} from './loader.js';

// 匹配器
export {
  SkillMatcher,
  getSkillMatcher,
  resetSkillMatcher,
  type EmbeddingService,
  type SkillMatcherConfig,
} from './matcher.js';