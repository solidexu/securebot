/**
 * Ralph Loop 类型定义
 * 
 * Ralph Loop 是一种持续迭代的 Agent 模式，
 * 通过外部控制强制 Agent 持续工作直到任务完成
 */

/**
 * Ralph 模式用户故事（任务项）
 */
export interface RalphStory {
  /** 故事 ID */
  id: string;
  /** 标题 */
  title: string;
  /** 验收标准 */
  acceptanceCriteria: string[];
  /** 优先级（数字越小越优先） */
  priority: number;
  /** 是否已完成 */
  passes: boolean;
  /** 备注 */
  notes?: string;
}

/**
 * Ralph PRD 文件结构
 */
export interface RalphPRD {
  /** 分支名称 */
  branchName: string;
  /** 用户故事列表 */
  userStories: RalphStory[];
  /** 创建时间 */
  createdAt?: string;
  /** 最后更新时间 */
  updatedAt?: string;
}

/**
 * Ralph 进度记录
 */
export interface RalphProgress {
  /** 时间戳 */
  timestamp: string;
  /** 故事 ID */
  storyId: string;
  /** 故事标题 */
  storyTitle: string;
  /** 完成内容 */
  completed: string;
  /** 变更文件 */
  filesChanged?: string[];
  /** 学到的模式 */
  patterns?: string[];
  /** 遇到的问题 */
  issues?: string[];
}

/**
 * Ralph 配置
 */
export interface RalphConfig {
  /** 最大迭代次数 */
  maxIterations: number;
  /** 完成承诺字符串 */
  completionPromise: string;
  /** 是否自动提交 */
  autoCommit: boolean;
  /** 反馈循环命令 */
  feedbackCommands: string[];
  /** PRD 文件路径 */
  prdFile: string;
  /** 进度文件路径 */
  progressFile: string;
  /** 审查者配置 */
  reviewer?: ReviewerConfig;
  /** 反压配置 */
  backpressure?: BackpressureConfig;
}

/**
 * 审查者配置
 * 
 * 实现者与审查者分离，避免同一模型的偏见
 */
export interface ReviewerConfig {
  /** 是否启用审查者 */
  enabled: boolean;
  /** 审查者模型（与实现者不同） */
  model?: string;
  /** 审查失败时的处理方式 */
  failAction: 'block' | 'warn' | 'auto-fix';
}

/**
 * 反压配置
 * 
 * 自动化的反馈机制，让智能体在没有人类干预的情况下检测和纠正错误
 */
export interface BackpressureConfig {
  /** 类型检查 */
  typecheck?: BackpressureCheck;
  /** 测试 */
  test?: BackpressureCheck;
  /** Lint */
  lint?: BackpressureCheck;
  /** 失败时的行为 */
  onFail: 'block' | 'warn' | 'auto-retry';
  /** 最大自动重试次数 */
  maxAutoRetry?: number;
}

/**
 * 单个反压检查配置
 */
export interface BackpressureCheck {
  /** 是否启用 */
  enabled: boolean;
  /** 执行命令 */
  command?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 是否自动修复 */
  autoFix?: boolean;
}

/**
 * 反压检查结果
 */
export interface BackpressureResult {
  /** 是否全部通过 */
  allPassed: boolean;
  /** 各检查结果 */
  results: BackpressureCheckResult[];
  /** 总耗时 */
  duration: number;
}

/**
 * 单个反压检查结果
 */
export interface BackpressureCheckResult {
  /** 检查类型 */
  type: 'typecheck' | 'test' | 'lint';
  /** 是否通过 */
  passed: boolean;
  /** 输出 */
  output?: string;
  /** 错误 */
  error?: string;
  /** 耗时 */
  duration: number;
}

/**
 * Ralph 循环结果
 */
export interface RalphResult {
  /** 是否成功完成 */
  success: boolean;
  /** 迭代次数 */
  iterations: number;
  /** 完成的故事数 */
  completedStories: number;
  /** 总故事数 */
  totalStories: number;
  /** 退出原因 */
  reason?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * Ralph 迭代状态
 */
export interface RalphIteration {
  /** 迭代编号 */
  iteration: number;
  /** 当前故事 */
  currentStory: RalphStory | null;
  /** 执行结果 */
  output?: string;
  /** 是否成功 */
  passed?: boolean;
  /** 错误信息 */
  error?: string;
  /** 耗时（毫秒） */
  duration?: number;
}

/**
 * Ralph 模式选项
 */
export interface RalphModeOptions {
  /** 任务描述 */
  taskDescription: string;
  /** 最大迭代次数 */
  maxIterations?: number;
  /** 是否使用默认反馈循环 */
  useDefaultFeedback?: boolean;
}