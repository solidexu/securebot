/**
 * 错误分级处理器
 * 
 * 实现错误分类、自动重试、降级策略、用户介入点
 */

import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ============ 类型定义 ============

/**
 * 错误类型
 */
export type ErrorType = 
  | 'network'      // 网络错误
  | 'timeout'      // 超时错误
  | 'permission'   // 权限错误
  | 'resource'     // 资源错误（文件不存在等）
  | 'validation'   // 验证错误
  | 'logic'        // 逻辑错误
  | 'rate_limit'   // 速率限制
  | 'service'      // 服务错误
  | 'unknown';     // 未知错误

/**
 * 错误严重程度
 */
export type ErrorSeverity = 
  | 'low'      // 可忽略或自动处理
  | 'medium'   // 需要重试或降级
  | 'high'     // 需要用户介入
  | 'critical'; // 致命错误，需停止

/**
 * 处理策略
 */
export type HandlingStrategy = 
  | 'retry'        // 重试
  | 'fallback'     // 降级
  | 'skip'         // 跳过
  | 'abort'        // 中止
  | 'ask_user';    // 询问用户

/**
 * 错误信息
 */
export interface ErrorInfo {
  /** 错误ID */
  id: string;
  /** 错误类型 */
  type: ErrorType;
  /** 严重程度 */
  severity: ErrorSeverity;
  /** 原始错误 */
  originalError: Error;
  /** 错误消息 */
  message: string;
  /** 上下文信息 */
  context?: Record<string, unknown>;
  /** 工具名称 */
  tool?: string;
  /** 参数 */
  params?: Record<string, unknown>;
  /** 时间戳 */
  timestamp: number;
  /** 重试次数 */
  retryCount: number;
}

/**
 * 处理结果
 */
export interface HandlingResult {
  /** 策略 */
  strategy: HandlingStrategy;
  /** 是否成功处理 */
  success: boolean;
  /** 结果数据 */
  data?: unknown;
  /** 错误消息 */
  errorMessage?: string;
  /** 是否需要用户介入 */
  needUserInput: boolean;
  /** 用户提示 */
  userPrompt?: string;
  /** 用户选项 */
  userOptions?: string[];
}

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number;
  /** 初始延迟（毫秒） */
  initialDelayMs: number;
  /** 最大延迟（毫秒） */
  maxDelayMs: number;
  /** 延迟倍数 */
  backoffMultiplier: number;
  /** 可重试的错误类型 */
  retryableTypes: ErrorType[];
}

/**
 * 降级配置
 */
export interface FallbackConfig {
  /** 工具降级映射 */
  toolFallbacks: Map<string, string[]>;
  /** 默认降级响应 */
  defaultResponses: Map<string, unknown>;
}

/**
 * 错误处理器配置
 */
export interface ErrorHandlerConfig {
  /** 重试配置 */
  retry: RetryConfig;
  /** 降级配置 */
  fallback: FallbackConfig;
  /** 是否启用日志 */
  enableLogging: boolean;
  /** 日志路径 */
  logPath?: string;
  /** 用户介入处理器 */
  userInterventionHandler?: (prompt: string, options: string[]) => Promise<string>;
}

// ============ 默认配置 ============

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableTypes: ['network', 'timeout', 'rate_limit', 'service'],
};

const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  toolFallbacks: new Map([
    ['web_fetch', ['web_search', 'cached_content']],
    ['exec', ['read', 'write']],
    ['browser', ['web_fetch', 'web_search']],
  ]),
  defaultResponses: new Map([
    ['web_fetch', { error: '无法访问网页，请稍后重试' }],
    ['web_search', { error: '搜索服务暂时不可用' }],
  ]),
};

const DEFAULT_CONFIG: ErrorHandlerConfig = {
  retry: DEFAULT_RETRY_CONFIG,
  fallback: DEFAULT_FALLBACK_CONFIG,
  enableLogging: true,
};

// ============ 错误分类器 ============

/**
 * 错误分类器
 */
export class ErrorClassifier {
  private patterns: Map<ErrorType, RegExp[]>;

  constructor() {
    this.patterns = new Map([
      ['network', [
        /ECONNREFUSED/i,
        /ENOTFOUND/i,
        /ECONNRESET/i,
        /ETIMEDOUT/i,
        /network/i,
        /socket hang up/i,
        /fetch failed/i,
      ]],
      ['timeout', [
        /timeout/i,
        /timed out/i,
        /ETIMEDOUT/i,
      ]],
      ['permission', [
        /EACCES/i,
        /EPERM/i,
        /permission denied/i,
        /not authorized/i,
        /forbidden/i,
      ]],
      ['resource', [
        /ENOENT/i,
        /ENOSPC/i,
        /not found/i,
        /does not exist/i,
        /no such file/i,
      ]],
      ['validation', [
        /invalid/i,
        /validation/i,
        /bad request/i,
        /malformed/i,
      ]],
      ['rate_limit', [
        /rate limit/i,
        /too many requests/i,
        /429/,
        /quota/i,
        /throttl/i,
      ]],
      ['service', [
        /503/i,
        /502/i,
        /500/i,
        /service unavailable/i,
        /internal server error/i,
      ]],
      ['logic', [
        /syntax/i,
        /type error/i,
        /reference error/i,
        /cannot read/i,
        /undefined/i,
        /null/i,
      ]],
    ]);
  }

  /**
   * 分类错误
   */
  classify(error: Error): ErrorType {
    const message = error.message;
    const stack = error.stack ?? '';

    for (const [type, patterns] of this.patterns) {
      for (const pattern of patterns) {
        if (pattern.test(message) || pattern.test(stack)) {
          return type;
        }
      }
    }

    return 'unknown';
  }

  /**
   * 判断严重程度
   */
  assessSeverity(type: ErrorType, context?: Record<string, unknown>): ErrorSeverity {
    switch (type) {
      case 'network':
      case 'timeout':
      case 'rate_limit':
        return 'low';
      
      case 'service':
        return 'medium';
      
      case 'permission':
      case 'resource':
        return context?.critical ? 'high' : 'medium';
      
      case 'validation':
        return 'medium';
      
      case 'logic':
        return 'high';
      
      case 'unknown':
      default:
        return 'high';
    }
  }

  /**
   * 判断是否可重试
   */
  isRetryable(type: ErrorType, config: RetryConfig): boolean {
    return config.retryableTypes.includes(type);
  }
}

// ============ 错误处理器 ============

/**
 * 错误处理器
 */
export class ErrorHandler {
  private config: ErrorHandlerConfig;
  private classifier: ErrorClassifier;
  private errorLog: ErrorInfo[] = [];
  private logPath: string;

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.classifier = new ErrorClassifier();
    this.logPath = this.config.logPath ?? join(homedir(), '.securebot', 'logs', 'errors.log');
    
    if (this.config.enableLogging) {
      this.ensureLogDir();
    }
  }

  private ensureLogDir(): void {
    const dir = this.logPath.substring(0, this.logPath.lastIndexOf('/'));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 处理错误
   */
  async handle(
    error: Error,
    context?: {
      tool?: string;
      params?: Record<string, unknown>;
      retryCount?: number;
    }
  ): Promise<HandlingResult> {
    // 分类错误
    const type = this.classifier.classify(error);
    const severity = this.classifier.assessSeverity(type, context);
    
    // 创建错误信息
    const errorInfo: ErrorInfo = {
      id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      severity,
      originalError: error,
      message: error.message,
      context,
      tool: context?.tool,
      params: context?.params,
      timestamp: Date.now(),
      retryCount: context?.retryCount ?? 0,
    };

    // 记录错误
    this.logError(errorInfo);

    // 根据严重程度决定策略
    const strategy = this.determineStrategy(errorInfo);
    
    // 执行策略
    switch (strategy) {
      case 'retry':
        return this.handleRetry(errorInfo);
      case 'fallback':
        return this.handleFallback(errorInfo);
      case 'skip':
        return this.handleSkip(errorInfo);
      case 'ask_user':
        return this.handleUserIntervention(errorInfo);
      case 'abort':
      default:
        return this.handleAbort(errorInfo);
    }
  }

  /**
   * 确定处理策略
   */
  private determineStrategy(errorInfo: ErrorInfo): HandlingStrategy {
    const { type, severity, retryCount } = errorInfo;

    // 检查是否可重试
    if (this.classifier.isRetryable(type, this.config.retry)) {
      if (retryCount < this.config.retry.maxRetries) {
        return 'retry';
      }
    }

    // 检查是否有降级方案
    if (errorInfo.tool && this.config.fallback.toolFallbacks.has(errorInfo.tool)) {
      return 'fallback';
    }

    // 根据严重程度
    switch (severity) {
      case 'low':
        return 'skip';
      case 'medium':
        return this.config.fallback.toolFallbacks.has(errorInfo.tool ?? '') ? 'fallback' : 'ask_user';
      case 'high':
        return 'ask_user';
      case 'critical':
      default:
        return 'abort';
    }
  }

  /**
   * 处理重试
   */
  private async handleRetry(errorInfo: ErrorInfo): Promise<HandlingResult> {
    const delay = this.calculateDelay(errorInfo.retryCount);
    
    return {
      strategy: 'retry',
      success: false,
      needUserInput: false,
      errorMessage: `将在 ${delay}ms 后重试 (${errorInfo.retryCount + 1}/${this.config.retry.maxRetries})`,
      data: {
        delay,
        retryCount: errorInfo.retryCount + 1,
      },
    };
  }

  /**
   * 计算重试延迟
   */
  private calculateDelay(retryCount: number): number {
    const { initialDelayMs, maxDelayMs, backoffMultiplier } = this.config.retry;
    const delay = initialDelayMs * Math.pow(backoffMultiplier, retryCount);
    return Math.min(delay, maxDelayMs);
  }

  /**
   * 处理降级
   */
  private async handleFallback(errorInfo: ErrorInfo): Promise<HandlingResult> {
    const tool = errorInfo.tool;
    if (!tool) {
      return this.handleAbort(errorInfo);
    }

    const fallbacks = this.config.fallback.toolFallbacks.get(tool) ?? [];
    
    if (fallbacks.length > 0) {
      return {
        strategy: 'fallback',
        success: true,
        needUserInput: false,
        data: {
          fallbackTool: fallbacks[0],
          fallbackOptions: fallbacks,
        },
        errorMessage: `${tool} 失败，将尝试降级方案: ${fallbacks[0]}`,
      };
    }

    // 使用默认响应
    const defaultResponse = this.config.fallback.defaultResponses.get(tool);
    if (defaultResponse) {
      return {
        strategy: 'fallback',
        success: true,
        needUserInput: false,
        data: defaultResponse,
        errorMessage: `使用默认响应`,
      };
    }

    return this.handleAskUser(errorInfo, `工具 ${tool} 执行失败，是否尝试其他方案？`);
  }

  /**
   * 处理跳过
   */
  private async handleSkip(errorInfo: ErrorInfo): Promise<HandlingResult> {
    return {
      strategy: 'skip',
      success: true,
      needUserInput: false,
      errorMessage: `已跳过错误: ${errorInfo.message}`,
    };
  }

  /**
   * 处理用户介入
   */
  private async handleUserIntervention(errorInfo: ErrorInfo): Promise<HandlingResult> {
    const options = ['重试', '跳过', '中止'];
    
    if (errorInfo.tool && this.config.fallback.toolFallbacks.has(errorInfo.tool)) {
      options.push('尝试降级方案');
    }

    return this.handleAskUser(errorInfo, `错误: ${errorInfo.message}，请选择处理方式`, options);
  }

  /**
   * 询问用户
   */
  private async handleAskUser(errorInfo: ErrorInfo, prompt: string, options?: string[]): Promise<HandlingResult> {
    if (this.config.userInterventionHandler) {
      return {
        strategy: 'ask_user',
        success: false,
        needUserInput: true,
        userPrompt: prompt,
        userOptions: options,
        data: { errorInfo },
      };
    }

    // 没有用户介入处理器，默认中止
    return this.handleAbort(errorInfo);
  }

  /**
   * 处理中止
   */
  private async handleAbort(errorInfo: ErrorInfo): Promise<HandlingResult> {
    return {
      strategy: 'abort',
      success: false,
      needUserInput: false,
      errorMessage: `任务已中止: ${errorInfo.message}`,
      data: { errorInfo },
    };
  }

  /**
   * 记录错误
   */
  private logError(errorInfo: ErrorInfo): void {
    this.errorLog.push(errorInfo);

    if (this.config.enableLogging) {
      const logLine = JSON.stringify({
        id: errorInfo.id,
        type: errorInfo.type,
        severity: errorInfo.severity,
        message: errorInfo.message,
        tool: errorInfo.tool,
        timestamp: errorInfo.timestamp,
        retryCount: errorInfo.retryCount,
      }) + '\n';

      appendFileSync(this.logPath, logLine, 'utf-8');
    }
  }

  /**
   * 设置用户介入处理器
   */
  setUserInterventionHandler(handler: (prompt: string, options: string[]) => Promise<string>): void {
    this.config.userInterventionHandler = handler;
  }

  /**
   * 获取错误日志
   */
  getErrorLog(limit?: number): ErrorInfo[] {
    const log = [...this.errorLog].reverse();
    return limit ? log.slice(0, limit) : log;
  }

  /**
   * 获取错误统计
   */
  getStats(): {
    totalErrors: number;
    byType: Record<ErrorType, number>;
    bySeverity: Record<ErrorSeverity, number>;
  } {
    const byType: Record<ErrorType, number> = {
      network: 0, timeout: 0, permission: 0, resource: 0,
      validation: 0, logic: 0, rate_limit: 0, service: 0, unknown: 0,
    };
    const bySeverity: Record<ErrorSeverity, number> = {
      low: 0, medium: 0, high: 0, critical: 0,
    };

    for (const error of this.errorLog) {
      byType[error.type]++;
      bySeverity[error.severity]++;
    }

    return {
      totalErrors: this.errorLog.length,
      byType,
      bySeverity,
    };
  }

  /**
   * 清除错误日志
   */
  clearLog(): void {
    this.errorLog = [];
  }
}

// ============ 重试执行器 ============

/**
 * 带重试的执行器
 */
export class RetryExecutor {
  private errorHandler: ErrorHandler;

  constructor(errorHandler: ErrorHandler) {
    this.errorHandler = errorHandler;
  }

  /**
   * 执行带重试的操作
   */
  async execute<T>(
    operation: () => Promise<T>,
    context?: {
      tool?: string;
      params?: Record<string, unknown>;
      onRetry?: (attempt: number, delay: number) => void;
    }
  ): Promise<T> {
    let lastError: Error | null = null;
    let retryCount = 0;

    while (true) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        const result = await this.errorHandler.handle(lastError, {
          ...context,
          retryCount,
        });

        if (result.strategy !== 'retry' || !result.data) {
          throw lastError;
        }

        const { delay, retryCount: newRetryCount } = result.data as { delay: number; retryCount: number };
        retryCount = newRetryCount;

        // 通知重试
        if (context?.onRetry) {
          context.onRetry(retryCount, delay);
        }

        // 等待
        await this.sleep(delay);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============ 全局实例 ============

let globalErrorHandler: ErrorHandler | null = null;

export function getErrorHandler(config?: Partial<ErrorHandlerConfig>): ErrorHandler {
  if (!globalErrorHandler) {
    globalErrorHandler = new ErrorHandler(config);
  }
  return globalErrorHandler;
}

export function resetErrorHandler(): void {
  globalErrorHandler = null;
}