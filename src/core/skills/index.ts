/**
 * Skills 模块导出
 * 
 * 渐进式加载的 Markdown 技能系统
 * 遵循 Deer-Flow 标准
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
  type EnhancedMatchResult,
} from './matcher.js';

// 意图识别器
export {
  IntentRecognizer,
  getIntentRecognizer,
  resetIntentRecognizer,
  type UserIntent,
  type IntentResult,
} from './intent-recognizer.js';

// RAG 增强器
export {
  SkillRAGEnhancer,
  getSkillRAGEnhancer,
  resetSkillRAGEnhancer,
  type SkillEnhancedContext,
  type KnowledgeItem,
  type SkillKnowledgeConfig,
} from './skill-rag-enhancer.js';

// 验证器
export {
  validateSkillDir,
  validateSkillFile,
  validateName,
  validateDescription,
  validateTools,
  validateKeywords,
  validateAndGetSkillId,
  ALLOWED_FRONTMATTER_PROPERTIES,
  NAME_RULES,
  DESCRIPTION_RULES,
  type ValidationResult,
} from './validation.js';

// 迁移工具
export {
  migrateSkill,
  migrateSkills,
  convertToMarkdown,
  migrateAllSkills,
  runMigration,
  type MigrationOptions,
  type MigrationResult,
} from './migrate.js';

// 版本管理
export {
  SkillVersionManager,
  getSkillVersionManager,
  resetSkillVersionManager,
  type SkillVersion,
  type VersionDiff,
} from './version.js';

// 打包器
export {
  SkillPackager,
  getSkillPackager,
  resetSkillPackager,
  type SkillPackageManifest,
  type PackOptions,
  type InstallOptions,
  type InstallResult,
} from './packager.js';

// 技能发现
export {
  SkillRegistry,
  getSkillRegistry,
  resetSkillRegistry,
  type RemoteSkill,
  type SearchResult,
  type SkillRegistryConfig,
} from './registry.js';