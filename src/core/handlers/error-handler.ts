/**
 * 错误追踪事件处理器
 * 
 * 订阅 ERROR 事件，记录错误日志
 */

import { eventBus, type EventHandler } from '../event-bus.js';
import { EventTypes, type ErrorEvent } from '../events.js';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

interface ErrorRecord {
  timestamp: string;
  agentId: string;
  sessionId: string;
  error: string;
  stack?: string;
  context?: Record<string, unknown>;
}

/**
 * 错误追踪器
 */
class ErrorTracker {
  private errors: ErrorRecord[] = [];
  private maxErrors: number = 100;
  private logFile: string;
  private enabled: boolean = true;

  constructor() {
    const logDir = join(homedir(), '.securebot', 'logs');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    this.logFile = join(logDir, 'errors.log');
  }

  /**
   * 记录错误
   */
  recordError(event: ErrorEvent): void {
    if (!this.enabled) return;

    const record: ErrorRecord = {
      timestamp: event.timestamp.toISOString(),
      agentId: event.agentId,
      sessionId: event.sessionId,
      error: event.payload.error,
      stack: event.payload.stack,
      context: event.payload.context,
    };

    // 内存记录
    this.errors.push(record);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // 文件记录
    try {
      const logLine = JSON.stringify(record) + '\n';
      appendFileSync(this.logFile, logLine, 'utf-8');
    } catch (e) {
      console.error('[ErrorTracker] Failed to write log:', e);
    }
  }

  /**
   * 获取错误列表
   */
  getErrors(limit: number = 20): ErrorRecord[] {
    return this.errors.slice(-limit);
  }

  /**
   * 获取错误统计
   */
  getStats(): {
    totalErrors: number;
    recentErrors: number;
    errorsByAgent: Record<string, number>;
  } {
    const errorsByAgent: Record<string, number> = {};
    for (const error of this.errors) {
      errorsByAgent[error.agentId] = (errorsByAgent[error.agentId] || 0) + 1;
    }

    return {
      totalErrors: this.errors.length,
      recentErrors: this.errors.filter(e => {
        const age = Date.now() - new Date(e.timestamp).getTime();
        return age < 3600000; // 1小时内
      }).length,
      errorsByAgent,
    };
  }

  /**
   * 清除错误
   */
  clear(): void {
    this.errors = [];
  }

  /**
   * 启用/禁用
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// 单例
const errorTracker = new ErrorTracker();

/**
 * 设置错误追踪事件处理器
 */
export function setupErrorHandlers(): () => void {
  const unsubscribers: Array<() => void> = [];

  // 错误事件处理器
  const handleError: EventHandler<ErrorEvent['payload']> = (event) => {
    errorTracker.recordError(event as ErrorEvent);
    console.error(`[ErrorTracker] ${event.payload.error}`);
  };

  // 订阅错误事件
  unsubscribers.push(eventBus.subscribe(EventTypes.ERROR, handleError));

  // 全局错误处理
  process.on('uncaughtException', (error) => {
    errorTracker.recordError({
      type: 'error',
      timestamp: new Date(),
      agentId: 'system',
      sessionId: 'system',
      payload: {
        error: error.message,
        stack: error.stack,
      },
    });
  });

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    errorTracker.recordError({
      type: 'error',
      timestamp: new Date(),
      agentId: 'system',
      sessionId: 'system',
      payload: {
        error: `Unhandled Rejection: ${message}`,
        stack,
      },
    });
  });

  // 返回取消所有订阅的函数
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
}

/**
 * 获取错误追踪器
 */
export function getErrorTracker(): ErrorTracker {
  return errorTracker;
}

/**
 * 打印错误报告
 */
export function printErrorReport(): void {
  const stats = errorTracker.getStats();
  const recentErrors = errorTracker.getErrors(10);

  console.log('\n❌ 错误追踪报告');
  console.log('─'.repeat(50));
  console.log(`总错误数: ${stats.totalErrors}`);
  console.log(`最近1小时: ${stats.recentErrors}`);
  console.log('\n按 Agent 统计:');
  for (const [agent, count] of Object.entries(stats.errorsByAgent)) {
    console.log(`  ${agent}: ${count} 次`);
  }
  if (recentErrors.length > 0) {
    console.log('\n最近错误:');
    for (const error of recentErrors.slice(-5)) {
      console.log(`  [${error.timestamp}] ${error.error.slice(0, 80)}`);
    }
  }
  console.log('─'.repeat(50));
}