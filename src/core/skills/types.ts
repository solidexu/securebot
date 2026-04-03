/**
 * Skills Markdown 类型定义
 * 
 * 支持渐进式加载的技能系统
 */

// ============ Markdown 技能格式 ============

/**
 * Markdown 技能定义
 */
export interface MarkdownSkill {
  // 元数据（从 YAML front matter 解析）
  id: string;
  name: string;
  version?: string;
  author?: string;
  description?: string; // 添加description字段
  keywords: string[];
  tools?: string[];
  trigger?: SkillTrigger;
  
  // 内容（从 Markdown body 解析）
  overview?: string;
  whenToUse?: string[];
  workflow?: WorkflowStep[];
  bestPractices?: string[];
  examples?: SkillExample[];
  resources?: ResourceReference[];
  
  // 文件路径信息
  skillDir: string;
  skillFile: string;
  category: 'public' | 'private';
  agentId?: string;
  isPublic?: boolean; // 添加isPublic字段
}

/**
 * 技能触发条件
 */
export interface SkillTrigger {
  type: 'auto' | 'manual';
  confidence: number;
}

/**
 * 工作流步骤
 */
export interface WorkflowStep {
  name: string;
  description: string;
  tools?: string[];
  details?: string;
}

/**
 * 技能示例
 */
export interface SkillExample {
  title: string;
  user: string;
  assistant: string;
}

/**
 * 资源引用
 */
export interface ResourceReference {
  type: 'template' | 'script' | 'document';
  path: string;
  description?: string;
}

// ============ 渐进式加载 ============

/**
 * 技能元数据（轻量级，用于匹配）
 */
export interface SkillMetadata {
  id: string;
  name: string;
  keywords: string[];
  description?: string;
  category: 'public' | 'private';
  skillFile: string;  // 文件路径，用于按需加载
  agentId?: string;
  
  // 可选的触发条件
  trigger?: SkillTrigger;
}

/**
 * 匹配结果
 */
export interface MatchedSkill {
  skill: MarkdownSkill | null;
  score: number;
  method: 'intent' | 'keyword' | 'semantic';
  metadata: SkillMetadata;
}

/**
 * 加载器配置
 */
export interface SkillLoaderConfig {
  /** 最大缓存数量 */
  maxCacheSize?: number;
  /** 技能根目录 */
  skillsRoot?: string;
  /** 是否启用语义匹配 */
  enableSemanticMatch?: boolean;
}

// ============ 工作流执行 ============

/**
 * 工作流上下文
 */
export interface WorkflowContext {
  agentId: string;
  workspace: string;
  stepResults: Record<string, any>;
}

/**
 * 工作流结果
 */
export interface WorkflowResult {
  success: boolean;
  error?: string;
  results?: StepResult[];
}

/**
 * 步骤结果
 */
export interface StepResult {
  stepName: string;
  success: boolean;
  output?: any;
  error?: string;
}

// ============ 资源管理 ============

/**
 * 资源类型
 */
export type ResourceType = 'template' | 'script' | 'document';

/**
 * 资源加载结果
 */
export interface ResourceLoadResult {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * 脚本执行结果
 */
export interface ScriptExecutionResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

// ============ 兼容性 ============

/**
 * 旧版 JSON 技能格式（用于迁移）
 */
export interface LegacySkill {
  id: string;
  name: string;
  description: string;
  keywords?: string[];
  systemPrompt: string;
  tools?: string[];
  examples?: Array<{
    user: string;
    assistant: string;
  }>;
  isPublic: boolean;
  agentId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 技能匹配结果（旧版兼容）
 */
export interface SkillMatchResult {
  skill: LegacySkill | MarkdownSkill;
  score: number;
  method: 'keyword' | 'semantic';
}