/**
 * Ralph Loop 错误处理工具
 */

/**
 * 安全执行异步操作，捕获错误并返回默认值
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  defaultValue: T,
  errorHandler?: (error: Error) => void
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    errorHandler?.(err);
    return defaultValue;
  }
}

/**
 * 安全执行同步操作，捕获错误并返回默认值
 */
export function safeSync<T>(fn: () => T, defaultValue: T, errorHandler?: (error: Error) => void): T {
  try {
    return fn();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    errorHandler?.(err);
    return defaultValue;
  }
}

/**
 * 格式化错误消息
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return JSON.stringify(error);
}

/**
 * 判断是否为可恢复错误
 */
export function isRecoverableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  const message = error.message.toLowerCase();
  
  // 网络错误通常可恢复
  if (message.includes('network') || message.includes('timeout') || message.includes('econnrefused')) {
    return true;
  }
  
  // 速率限制可恢复
  if (message.includes('rate limit') || message.includes('429')) {
    return true;
  }
  
  // 资源临时不可用可恢复
  if (message.includes('temporarily') || message.includes('retry')) {
    return true;
  }
  
  return false;
}

/**
 * 错误类型枚举
 */
export enum RalphErrorType {
  PRD_INVALID = 'PRD_INVALID',
  TASK_FAILED = 'TASK_FAILED',
  FEEDBACK_FAILED = 'FEEDBACK_FAILED',
  REVIEW_FAILED = 'REVIEW_FAILED',
  INTERRUPTED = 'INTERRUPTED',
  TIMEOUT = 'TIMEOUT',
  NETWORK = 'NETWORK',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Ralph 错误类
 */
export class RalphError extends Error {
  constructor(
    message: string,
    public readonly type: RalphErrorType,
    public readonly recoverable: boolean = false,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RalphError';
  }
  
  static fromError(error: unknown, type: RalphErrorType = RalphErrorType.UNKNOWN): RalphError {
    if (error instanceof RalphError) return error;
    
    const message = formatError(error);
    const recoverable = isRecoverableError(error);
    
    return new RalphError(message, type, recoverable);
  }
}