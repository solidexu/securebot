/**
 * Ralph 错误恢复模块
 * 
 * 提供错误分类、恢复建议和自动重试机制
 */

import chalk from 'chalk';

// ============ 错误类型 ============

/**
 * 错误分类
 */
export enum ErrorType {
  /** 网络错误 */
  NETWORK = 'network',
  /** 模型错误 */
  MODEL = 'model',
  /** 工具执行错误 */
  TOOL = 'tool',
  /** 资源错误（文件不存在等） */
  RESOURCE = 'resource',
  /** 超时错误 */
  TIMEOUT = 'timeout',
  /** 配置错误 */
  CONFIG = 'config',
  /** 未知错误 */
  UNKNOWN = 'unknown',
}

/**
 * 错误信息
 */
export interface ClassifiedError {
  /** 错误类型 */
  type: ErrorType;
  /** 是否可恢复 */
  recoverable: boolean;
  /** 用户友好的错误消息 */
  userMessage: string;
  /** 恢复建议 */
  suggestions: string[];
  /** 推荐的重试延迟（毫秒） */
  retryDelay: number;
}

// ============ 错误分类器 ============

/**
 * 错误关键词映射
 */
const ERROR_PATTERNS: Array<{
  patterns: RegExp[];
  type: ErrorType;
  recoverable: boolean;
  userMessage: string;
  suggestions: string[];
  retryDelay: number;
}> = [
  {
    patterns: [/ECONNREFUSED/, /ENOTFOUND/, /network/i, /fetch failed/i],
    type: ErrorType.NETWORK,
    recoverable: true,
    userMessage: '网络连接失败',
    suggestions: [
      '检查网络连接是否正常',
      '确认 Ollama 服务是否正在运行',
      '尝试重启 Ollama: ollama serve',
    ],
    retryDelay: 5000,
  },
  {
    patterns: [/model.*not found/i, /model.*loading/i, /Ollama error/i],
    type: ErrorType.MODEL,
    recoverable: true,
    userMessage: '模型错误',
    suggestions: [
      '检查模型是否已下载: ollama list',
      '尝试拉取模型: ollama pull <model-name>',
      '检查模型名称是否正确',
    ],
    retryDelay: 10000,
  },
  {
    patterns: [/permission denied/i, /EACCES/, /ENOENT/],
    type: ErrorType.RESOURCE,
    recoverable: false,
    userMessage: '资源访问错误',
    suggestions: [
      '检查文件/目录是否存在',
      '确认是否有读写权限',
      '检查磁盘空间是否充足',
    ],
    retryDelay: 0,
  },
  {
    patterns: [/timeout/i, /ETIMEDOUT/, /timed out/i],
    type: ErrorType.TIMEOUT,
    recoverable: true,
    userMessage: '操作超时',
    suggestions: [
      '增加超时时间配置',
      '检查网络延迟',
      '尝试简化任务',
    ],
    retryDelay: 3000,
  },
  {
    patterns: [/config/i, /invalid.*option/i, /missing.*config/i],
    type: ErrorType.CONFIG,
    recoverable: false,
    userMessage: '配置错误',
    suggestions: [
      '检查配置文件格式',
      '运行 securebot init 重新配置',
      '查看文档确认配置项',
    ],
    retryDelay: 0,
  },
];

/**
 * 分类错误
 */
export function classifyError(error: Error | string): ClassifiedError {
  const errorMsg = error instanceof Error ? error.message : error;
  
  // 匹配已知错误模式
  for (const pattern of ERROR_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(errorMsg)) {
        return {
          type: pattern.type,
          recoverable: pattern.recoverable,
          userMessage: pattern.userMessage,
          suggestions: pattern.suggestions,
          retryDelay: pattern.retryDelay,
        };
      }
    }
  }
  
  // 未知错误
  return {
    type: ErrorType.UNKNOWN,
    recoverable: false,
    userMessage: '未知错误',
    suggestions: [
      '查看日志获取详细信息',
      '尝试重新运行任务',
      '如问题持续，请提交反馈',
    ],
    retryDelay: 0,
  };
}

// ============ 错误显示 ============

/**
 * 显示友好的错误信息
 */
export function displayError(error: Error | string, context?: string): void {
  const classified = classifyError(error);
  const errorMsg = error instanceof Error ? error.message : error;
  
  console.log();
  console.log(chalk.red.bold(`❌ ${classified.userMessage}`));
  
  if (context) {
    console.log(chalk.gray(`   上下文: ${context}`));
  }
  
  console.log(chalk.gray(`   详情: ${errorMsg.slice(0, 200)}`));
  
  if (classified.suggestions.length > 0) {
    console.log();
    console.log(chalk.cyan('   💡 建议:'));
    for (const suggestion of classified.suggestions) {
      console.log(chalk.gray(`      • ${suggestion}`));
    }
  }
  
  if (classified.recoverable) {
    console.log();
    console.log(chalk.green(`   ✓ 此错误可自动恢复，将重试...`));
  }
  
  console.log();
}

/**
 * 显示恢复状态
 */
export function displayRecoveryStatus(
  attempt: number,
  maxAttempts: number,
  delayMs: number
): void {
  console.log(chalk.yellow(`   🔄 重试 ${attempt}/${maxAttempts} (${delayMs / 1000}秒后)...`));
}

// ============ 自动重试 ============

/**
 * 重试选项
 */
export interface RetryOptions {
  /** 最大重试次数 */
  maxAttempts: number;
  /** 初始延迟（毫秒） */
  initialDelay: number;
  /** 最大延迟（毫秒） */
  maxDelay: number;
  /** 是否使用指数退避 */
  exponentialBackoff: boolean;
  /** 仅对可恢复错误重试 */
  onlyRecoverable: boolean;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  exponentialBackoff: true,
  onlyRecoverable: true,
};

/**
 * 带重试的执行函数
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  context?: string
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelay;
  
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const classified = classifyError(lastError);
      
      // 如果错误不可恢复，或仅对可恢复错误重试
      if (!classified.recoverable && opts.onlyRecoverable) {
        displayError(lastError, context);
        throw lastError;
      }
      
      // 如果还有重试机会
      if (attempt < opts.maxAttempts) {
        displayError(lastError, context);
        displayRecoveryStatus(attempt, opts.maxAttempts, delay);
        
        // 等待
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // 指数退避
        if (opts.exponentialBackoff) {
          delay = Math.min(delay * 2, opts.maxDelay);
        }
      }
    }
  }
  
  // 所有重试都失败
  if (lastError) {
    displayError(lastError, context);
    throw lastError;
  }
  
  throw new Error('Unknown error in retry logic');
}

// ============ 导出类型 ============

export type { ClassifiedError as ClassifiedErrorType };