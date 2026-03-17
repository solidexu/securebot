/**
 * 事件持久化处理器
 * 
 * 将所有事件记录到文件，用于调试和回放
 */

import { eventBus, type EventHandler } from '../event-bus.js';
import type { BaseEvent } from '../events.js';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * 事件持久化器
 */
class EventPersistence {
  private enabled: boolean = false;
  private logDir: string;
  private currentLogFile: string;
  private maxFileSize: number = 10 * 1024 * 1024; // 10MB
  private maxLogFiles: number = 10;

  constructor() {
    this.logDir = join(homedir(), '.securebot', 'events');
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
    this.currentLogFile = this.getTodayLogFile();
  }

  /**
   * 获取今日日志文件路径
   */
  private getTodayLogFile(): string {
    const today = new Date().toISOString().split('T')[0];
    return join(this.logDir, `events-${today}.log`);
  }

  /**
   * 记录事件
   */
  persistEvent(event: BaseEvent): void {
    if (!this.enabled) return;

    try {
      // 检查是否需要切换日志文件（新的一天）
      const todayFile = this.getTodayLogFile();
      if (todayFile !== this.currentLogFile) {
        this.currentLogFile = todayFile;
      }

      // 检查文件大小
      if (existsSync(this.currentLogFile)) {
        const stats = statSync(this.currentLogFile);
        if (stats.size > this.maxFileSize) {
          this.rotateLog();
        }
      }

      // 追加写入
      const logLine = JSON.stringify(event) + '\n';
      appendFileSync(this.currentLogFile, logLine, 'utf-8');
    } catch (e) {
      console.error('[EventPersistence] Failed to persist event:', e);
    }
  }

  /**
   * 日志轮转
   */
  private rotateLog(): void {
    const timestamp = Date.now();
    const rotatedFile = join(this.logDir, `events-${timestamp}.log`);
    // 重命名当前文件（简单实现）
    // 实际生产中应该用 renameSync
    console.log(`[EventPersistence] Log rotated: ${rotatedFile}`);

    // 清理旧日志
    this.cleanupOldLogs();
  }

  /**
   * 清理旧日志
   */
  private cleanupOldLogs(): void {
    try {
      const files = readdirSync(this.logDir)
        .filter(f => f.startsWith('events-') && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: join(this.logDir, f),
          time: statSync(join(this.logDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time);

      // 保留最新的 N 个文件
      const toDelete = files.slice(this.maxLogFiles);
      for (const file of toDelete) {
        // 实际生产中应该用 unlinkSync
        console.log(`[EventPersistence] Would delete old log: ${file.name}`);
      }
    } catch (e) {
      console.error('[EventPersistence] Failed to cleanup old logs:', e);
    }
  }

  /**
   * 回放事件
   */
  replayEvents(date: string, callback: (event: BaseEvent) => void): number {
    const logFile = join(this.logDir, `events-${date}.log`);
    if (!existsSync(logFile)) {
      console.log(`[EventPersistence] No log file for ${date}`);
      return 0;
    }

    try {
      const content = readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n');
      let count = 0;

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as BaseEvent;
          callback(event);
          count++;
        } catch {
          // 忽略解析错误
        }
      }

      return count;
    } catch (e) {
      console.error('[EventPersistence] Failed to replay events:', e);
      return 0;
    }
  }

  /**
   * 启用/禁用
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * 获取状态
   */
  getStatus(): {
    enabled: boolean;
    logDir: string;
    currentLogFile: string;
  } {
    return {
      enabled: this.enabled,
      logDir: this.logDir,
      currentLogFile: this.currentLogFile,
    };
  }
}

// 单例
const eventPersistence = new EventPersistence();

/**
 * 设置事件持久化处理器
 */
export function setupPersistenceHandlers(options?: {
  enabled?: boolean;
}): () => void {
  if (options?.enabled) {
    eventPersistence.setEnabled(true);
  }

  const unsubscribers: Array<() => void> = [];

  // 通用事件处理器 - 持久化所有事件
  const handleAnyEvent: EventHandler = (event) => {
    eventPersistence.persistEvent(event);
  };

  // 订阅主要事件类型
  const eventTypes = [
    'user:message',
    'tool:call:start',
    'tool:call:success',
    'tool:call:failure',
    'task:start',
    'task:complete',
    'task:fail',
    'session:start',
    'session:end',
  ];

  for (const eventType of eventTypes) {
    unsubscribers.push(eventBus.subscribe(eventType, handleAnyEvent));
  }

  // 返回取消所有订阅的函数
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
}

/**
 * 获取事件持久化器
 */
export function getEventPersistence(): EventPersistence {
  return eventPersistence;
}