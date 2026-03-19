/**
 * 统一日志系统
 * 
 * 提供分级日志、格式化输出、日志文件支持
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';

// ============ 日志级别 ============

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 100,
};

// ============ 日志配置 ============

export interface LoggerConfig {
  /** 最小日志级别 */
  level: LogLevel;
  /** 是否输出到控制台 */
  console: boolean;
  /** 是否输出到文件 */
  file: boolean;
  /** 日志文件目录 */
  logDir: string;
  /** 日志前缀 */
  prefix: string;
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  console: true,
  file: true,
  logDir: join(homedir(), '.securebot', 'logs'),
  prefix: '',
};

// ============ Logger 类 ============

export class Logger {
  private config: LoggerConfig;
  private logFile: string;
  
  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logFile = join(this.config.logDir, `${new Date().toISOString().split('T')[0]}.log`);
    
    if (this.config.file && !existsSync(this.config.logDir)) {
      mkdirSync(this.config.logDir, { recursive: true });
    }
  }
  
  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }
  
  /**
   * Debug 日志
   */
  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }
  
  /**
   * Info 日志
   */
  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }
  
  /**
   * Warn 日志
   */
  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }
  
  /**
   * Error 日志
   */
  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }
  
  /**
   * 内部日志方法
   */
  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.level]) {
      return;
    }
    
    const timestamp = new Date().toISOString();
    const prefix = this.config.prefix ? `[${this.config.prefix}] ` : '';
    const formattedMessage = `${timestamp} [${level.toUpperCase()}] ${prefix}${message}`;
    
    // 控制台输出
    if (this.config.console) {
      const consoleMethod = level === 'debug' ? 'log' : level;
      console[consoleMethod](formattedMessage, ...args);
    }
    
    // 文件输出
    if (this.config.file) {
      try {
        const logLine = `${formattedMessage} ${args.map(a => JSON.stringify(a)).join(' ')}\n`;
        appendFileSync(this.logFile, logLine, 'utf-8');
      } catch {
        // 写入失败时忽略
      }
    }
  }
  
  /**
   * 创建子 Logger
   */
  child(prefix: string): Logger {
    return new Logger({
      ...this.config,
      prefix: this.config.prefix ? `${this.config.prefix}:${prefix}` : prefix,
    });
  }
}

// ============ 全局 Logger ============

let globalLogger: Logger | null = null;

/**
 * 获取全局 Logger
 */
export function getLogger(config?: Partial<LoggerConfig>): Logger {
  if (!globalLogger) {
    globalLogger = new Logger(config);
  }
  return globalLogger;
}

/**
 * 创建模块 Logger
 */
export function createLogger(module: string, config?: Partial<LoggerConfig>): Logger {
  return getLogger(config).child(module);
}