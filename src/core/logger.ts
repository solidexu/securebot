/**
 * 结构化日志模块
 * 
 * 提供统一的 JSON 格式日志输出
 */

// ============ 类型定义 ============

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 日志上下文
 */
export interface LogContext {
  [key: string]: unknown;
}

/**
 * 日志条目
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  traceId?: string;
  spanId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  [key: string]: unknown;
}

/**
 * 日志配置
 */
export interface LoggerConfig {
  /** 最小日志级别 */
  minLevel: LogLevel;
  /** 是否包含时间戳 */
  includeTimestamp: boolean;
  /** 是否包含错误堆栈 */
  includeStackTrace: boolean;
  /** 自定义输出函数 */
  output: (entry: LogEntry) => void;
  /** 默认上下文 */
  defaultContext?: LogContext;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: 'info',
  includeTimestamp: true,
  includeStackTrace: true,
  output: (entry) => {
    const levelPriority: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };

    // 根据级别选择输出流
    if (levelPriority[entry.level] >= 2) {
      console.error(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  },
};

// ============ 日志器 ============

/**
 * 结构化日志器
 * 
 * 输出 JSON 格式的日志，便于解析和分析
 */
export class Logger {
  private context: string;
  private config: LoggerConfig;
  private traceId?: string;
  private spanId?: string;

  constructor(context: string, config: Partial<LoggerConfig> = {}) {
    this.context = context;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 设置追踪 ID
   */
  setTraceId(traceId: string, spanId?: string): void {
    this.traceId = traceId;
    this.spanId = spanId;
  }

  /**
   * 清除追踪 ID
   */
  clearTraceId(): void {
    this.traceId = undefined;
    this.spanId = undefined;
  }

  /**
   * 创建子日志器
   */
  child(subContext: string, additionalContext?: LogContext): Logger {
    const childLogger = new Logger(`${this.context}:${subContext}`, this.config);
    if (this.traceId) {
      childLogger.setTraceId(this.traceId, this.spanId);
    }
    return childLogger;
  }

  /**
   * 记录日志
   */
  private log(level: LogLevel, message: string, data?: LogContext): void {
    // 检查日志级别
    const levelPriority: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };

    if (levelPriority[level] < levelPriority[this.config.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...this.config.defaultContext,
      ...data,
    };

    if (this.traceId) {
      entry.traceId = this.traceId;
      if (this.spanId) {
        entry.spanId = this.spanId;
      }
    }

    this.config.output(entry);
  }

  /**
   * 调试日志
   */
  debug(message: string, data?: LogContext): void {
    this.log('debug', message, data);
  }

  /**
   * 信息日志
   */
  info(message: string, data?: LogContext): void {
    this.log('info', message, data);
  }

  /**
   * 警告日志
   */
  warn(message: string, data?: LogContext): void {
    this.log('warn', message, data);
  }

  /**
   * 错误日志
   */
  error(message: string, error?: Error, data?: LogContext): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      context: this.context,
      message,
      ...this.config.defaultContext,
      ...data,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
      };
      if (this.config.includeStackTrace && error.stack) {
        entry.error.stack = error.stack;
      }
    }

    if (this.traceId) {
      entry.traceId = this.traceId;
      if (this.spanId) {
        entry.spanId = this.spanId;
      }
    }

    this.config.output(entry);
  }

  /**
   * 计时日志
   */
  time<T>(label: string, fn: () => Promise<T>): Promise<T>;
  time<T>(label: string, fn: () => T): T;
  time<T>(label: string, fn: () => T | Promise<T>): T | Promise<T> {
    const start = Date.now();

    const logTime = () => {
      const elapsed = Date.now() - start;
      this.debug(`${label} completed`, { elapsedMs: elapsed });
    };

    try {
      const result = fn();
      if (result instanceof Promise) {
        return result
          .then((value) => {
            logTime();
            return value;
          })
          .catch((error) => {
            const elapsed = Date.now() - start;
            this.error(`${label} failed`, error, { elapsedMs: elapsed });
            throw error;
          });
      }
      logTime();
      return result;
    } catch (error) {
      const elapsed = Date.now() - start;
      this.error(`${label} failed`, error instanceof Error ? error : new Error(String(error)), {
        elapsedMs: elapsed,
      });
      throw error;
    }
  }
}

// ============ 日志管理器 ============

/**
 * 日志管理器
 * 
 * 管理多个日志器实例
 */
export class LogManager {
  private static instance: LogManager;
  private loggers: Map<string, Logger> = new Map();
  private config: LoggerConfig;

  private constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 获取单例
   */
  static getInstance(config?: Partial<LoggerConfig>): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager(config);
    }
    return LogManager.instance;
  }

  /**
   * 获取日志器
   */
  getLogger(context: string): Logger {
    let logger = this.loggers.get(context);
    if (!logger) {
      logger = new Logger(context, this.config);
      this.loggers.set(context, logger);
    }
    return logger;
  }

  /**
   * 设置全局配置
   */
  setConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
    // 更新所有日志器的配置
    for (const logger of this.loggers.values()) {
      (logger as any).config = this.config;
    }
  }

  /**
   * 设置全局追踪 ID
   */
  setGlobalTraceId(traceId: string, spanId?: string): void {
    for (const logger of this.loggers.values()) {
      logger.setTraceId(traceId, spanId);
    }
  }

  /**
   * 清除全局追踪 ID
   */
  clearGlobalTraceId(): void {
    for (const logger of this.loggers.values()) {
      logger.clearTraceId();
    }
  }
}

// ============ 全局函数 ============

/**
 * 获取日志器
 */
export function getLogger(context: string): Logger {
  return LogManager.getInstance().getLogger(context);
}

/**
 * 设置全局日志配置
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  LogManager.getInstance().setConfig(config);
}

/**
 * 设置全局追踪 ID
 */
export function setGlobalTraceId(traceId: string, spanId?: string): void {
  LogManager.getInstance().setGlobalTraceId(traceId, spanId);
}

/**
 * 清除全局追踪 ID
 */
export function clearGlobalTraceId(): void {
  LogManager.getInstance().clearGlobalTraceId();
}