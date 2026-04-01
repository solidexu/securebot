/**
 * Agent 协作系统错误定义
 */

/**
 * 基础错误类
 */
export class AgentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AgentError';
    
    // 保持正确的原型链
    Object.setPrototypeOf(this, AgentError.prototype);
  }

  /**
   * 转换为 JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * 节点执行错误
 */
export class NodeExecutionError extends AgentError {
  constructor(
    public readonly nodeId: string,
    public readonly nodeName: string,
    cause: Error
  ) {
    super(
      `Node "${nodeName}" (${nodeId}) failed: ${cause.message}`,
      'NODE_EXECUTION_ERROR',
      { nodeId, nodeName, cause: cause.message }
    );
    this.name = 'NodeExecutionError';
    Object.setPrototypeOf(this, NodeExecutionError.prototype);
  }
}

/**
 * 图中断错误
 */
export class GraphBubbleUp extends AgentError {
  constructor(public readonly reason: 'interrupt' | 'cancel' | 'timeout') {
    super(`Graph execution bubbled up: ${reason}`, 'GRAPH_BUBBLE_UP', { reason });
    this.name = 'GraphBubbleUp';
    Object.setPrototypeOf(this, GraphBubbleUp.prototype);
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends AgentError {
  constructor(
    public readonly nodeId: string,
    public readonly timeoutMs: number
  ) {
    super(
      `Node "${nodeId}" timed out after ${timeoutMs}ms`,
      'TIMEOUT_ERROR',
      { nodeId, timeoutMs }
    );
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * 重试耗尽错误
 */
export class RetryExhaustedError extends AgentError {
  constructor(
    public readonly nodeId: string,
    public readonly attempts: number,
    public readonly lastError: Error
  ) {
    super(
      `Node "${nodeId}" failed after ${attempts} attempts: ${lastError.message}`,
      'RETRY_EXHAUSTED',
      { nodeId, attempts, lastError: lastError.message }
    );
    this.name = 'RetryExhaustedError';
    Object.setPrototypeOf(this, RetryExhaustedError.prototype);
  }
}

/**
 * 配置错误
 */
export class ConfigurationError extends AgentError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'CONFIGURATION_ERROR', { field });
    this.name = 'ConfigurationError';
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * 验证错误
 */
export class ValidationError extends AgentError {
  constructor(message: string, public readonly errors: string[]) {
    super(message, 'VALIDATION_ERROR', { errors });
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * 判断是否为可重试错误
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof TimeoutError) return true;
  if (error instanceof RetryExhaustedError) return false;
  if (error instanceof GraphBubbleUp) return false;
  if (error instanceof ConfigurationError) return false;
  if (error instanceof ValidationError) return false;

  // 网络错误可重试
  const retryableMessages = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'socket hang up',
    'network',
    'timeout',
  ];

  return retryableMessages.some(msg => 
    error.message.toLowerCase().includes(msg.toLowerCase())
  );
}