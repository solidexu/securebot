/**
 * 自定义错误类
 * 
 * 统一错误类型，便于错误处理和调试
 */

/**
 * 基础错误类
 */
export class SecureBotError extends Error {
  public readonly code: string;
  public readonly timestamp: string;
  public readonly context?: Record<string, unknown>;
  
  constructor(
    message: string,
    code: string,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SecureBotError';
    this.code = code;
    this.timestamp = new Date().toISOString();
    this.context = context;
  }
  
  /**
   * 获取用户友好的错误消息
   */
  getUserMessage(): string {
    return this.message;
  }
  
  /**
   * 转换为 JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * 模型调用错误
 */
export class ModelError extends SecureBotError {
  constructor(
    message: string,
    public readonly model?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'MODEL_ERROR', { model, ...context });
    this.name = 'ModelError';
  }
  
  getUserMessage(): string {
    return `模型调用失败: ${this.message}`;
  }
}

/**
 * 工具执行错误
 */
export class ToolError extends SecureBotError {
  constructor(
    message: string,
    public readonly tool: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'TOOL_ERROR', { tool, ...context });
    this.name = 'ToolError';
  }
  
  getUserMessage(): string {
    return `工具 ${this.tool} 执行失败: ${this.message}`;
  }
}

/**
 * 配置错误
 */
export class ConfigError extends SecureBotError {
  constructor(
    message: string,
    public readonly configKey?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'CONFIG_ERROR', { configKey, ...context });
    this.name = 'ConfigError';
  }
  
  getUserMessage(): string {
    return `配置错误: ${this.message}`;
  }
}

/**
 * 权限错误
 */
export class PermissionError extends SecureBotError {
  constructor(
    message: string,
    public readonly action: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'PERMISSION_ERROR', { action, ...context });
    this.name = 'PermissionError';
  }
  
  getUserMessage(): string {
    return `权限不足: ${this.message}`;
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends SecureBotError {
  constructor(
    message: string,
    public readonly timeoutMs: number,
    context?: Record<string, unknown>
  ) {
    super(message, 'TIMEOUT_ERROR', { timeoutMs, ...context });
    this.name = 'TimeoutError';
  }
  
  getUserMessage(): string {
    return `操作超时 (${this.timeoutMs}ms): ${this.message}`;
  }
}

/**
 * 验证错误
 */
export class ValidationError extends SecureBotError {
  constructor(
    message: string,
    public readonly field?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'VALIDATION_ERROR', { field, ...context });
    this.name = 'ValidationError';
  }
  
  getUserMessage(): string {
    return this.field 
      ? `验证失败 (${this.field}): ${this.message}`
      : `验证失败: ${this.message}`;
  }
}

/**
 * 存储错误
 */
export class StorageError extends SecureBotError {
  constructor(
    message: string,
    public readonly operation: 'read' | 'write' | 'delete',
    context?: Record<string, unknown>
  ) {
    super(message, 'STORAGE_ERROR', { operation, ...context });
    this.name = 'StorageError';
  }
  
  getUserMessage(): string {
    return `存储操作失败 (${this.operation}): ${this.message}`;
  }
}

/**
 * 判断是否为 SecureBotError
 */
export function isSecureBotError(error: unknown): error is SecureBotError {
  return error instanceof SecureBotError;
}

/**
 * 将任意错误转换为 SecureBotError
 */
export function toSecureBotError(error: unknown, context?: Record<string, unknown>): SecureBotError {
  if (error instanceof SecureBotError) {
    return error;
  }
  
  const message = error instanceof Error ? error.message : String(error);
  return new SecureBotError(message, 'UNKNOWN_ERROR', context);
}