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