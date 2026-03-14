/**
 * 任务规划与执行控制器
 * 
 * 实现基于 TODO list 的任务管理
 */

import { homedir } from 'node:os';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ============ 类型定义 ============

export interface TodoItem {
  /** 任务ID */
  id: string;
  /** 任务描述 */
  task: string;
  /** 状态 */
  status: 'pending' | 'in_progress' | 'completed';
  /** 依赖项 */
  dependencies?: string[];
}

export interface TaskStatus {
  /** 是否完成 */
  completed: boolean;
  /** 总任务数 */
  total: number;
  /** 已完成数 */
  done: number;
  /** 进行中 */
  inProgress: number;
}

export interface TaskControlConfig {
  /** 最大执行时间（毫秒） */
  maxTimeoutMs: number;
  /** 连续失败次数上限 */
  maxConsecutiveFailures: number;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: TaskControlConfig = {
  maxTimeoutMs: 10 * 60 * 1000, // 10 分钟
  maxConsecutiveFailures: 3,
};

// ============ 任务管理器 ============

export class TaskManager {
  private todos: Map<string, TodoItem> = new Map();
  private config: TaskControlConfig;
  private startTime: number = 0;
  private failureCount: number = 0;
  private recentCalls: Array<{ tool: string; params: Record<string, unknown> }> = [];

  constructor(config: Partial<TaskControlConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化任务（开始计时）
   */
  start(): void {
    this.startTime = Date.now();
    this.failureCount = 0;
    this.recentCalls = [];
  }

  /**
   * 设置 TODO 列表
   */
  setTodos(todos: TodoItem[]): void {
    this.todos.clear();
    for (const item of todos) {
      this.todos.set(item.id, { ...item, status: 'pending' });
    }
  }

  /**
   * 从模型输出解析 TODO 列表
   */
  parseTodoList(content: string): void {
    const lines = content.split('\n');
    const todoRegex = /^[-*]\s*\[([ x]\)\s*(.+)/i;
    const todos: TodoItem[] = [];

    for (const line of lines) {
      const match = line.match(todoRegex);
      if (match) {
        const status = match[1].trim() === 'x' ? 'completed' : 'pending';
        todos.push({
          id: `todo-${todos.length + 1}`,
          task: match[2].trim(),
          status,
        });
      }
    }

    this.setTodos(todos);
  }

  /**
   * 更新任务状态
   */
  updateStatus(itemId: string, status: TodoItem['status']): void {
    const item = this.todos.get(itemId);
    if (item) {
      item.status = status;
    }
  }

  /**
   * 标记任务完成
   */
  markCompleted(itemId: string): void {
    this.updateStatus(itemId, 'completed');
    this.failureCount = 0; // 重置失败计数
  }

  /**
   * 记录工具调用
   */
  recordToolCall(tool: string, params: Record<string, unknown>): void {
    this.recentCalls.push({ tool, params: { ...params } });
    // 保持最近 20 条
    if (this.recentCalls.length > 20) {
      this.recentCalls.shift();
    }
  }

  /**
   * 检测循环
   */
  detectLoop(): boolean {
    if (this.recentCalls.length < 3) return false;

    const recent = this.recentCalls.slice(-3);
    const first = JSON.stringify(recent[0]);
    const isLoop = recent.every(call => JSON.stringify(call) === first);
    return isLoop;
  }

  /**
   * 记录失败
   */
  recordFailure(): void {
    this.failureCount++;
  }

  /**
   * 检查终止条件
   */
  shouldTerminate(): { terminate: boolean; reason: string } {
    // 1. 检查超时
    if (this.config.maxTimeoutMs > 0) {
      const elapsed = Date.now() - this.startTime;
      if (elapsed > this.config.maxTimeoutMs) {
        return { terminate: true, reason: `任务超时 (${Math.floor(elapsed / 60000)} 分钟)` };
      }
    }

    // 2. 检查连续失败
    if (this.failureCount >= this.config.maxConsecutiveFailures) {
      return {
        terminate: true,
        reason: `连续失败 ${this.failureCount} 次`,
      };
    }

    // 3. 检查循环
    if (this.detectLoop()) {
      return { terminate: true, reason: '检测到循环，连续相同的工具调用' };
    }

    // 4. 检查任务完成
    const status = this.getStatus();
    if (status.completed) {
      return { terminate: true, reason: '所有任务已完成' };
    }

    return { terminate: false, reason: '' };
  }

  /**
   * 获取任务状态
   */
  getStatus(): TaskStatus {
    const total = this.todos.size;
    const done = Array.from(this.todos.values()).filter(t => t.status === 'completed').length;
    const inProgress = Array.from(this.todos.values()).filter(t => t.status === 'in_progress').length;

    return {
      completed: total === done,
      total,
      done,
      inProgress,
    };
  }

  /**
   * 获取下一个待处理任务
   */
  getNextTask(): TodoItem | null {
    for (const item of this.todos.values()) {
      if (item.status === 'in_progress') {
        return item;
      }
    }
    for (const item of this.todos.values()) {
      if (item.status === 'pending') {
        item.status = 'in_progress';
        return item;
      }
    }
    return null;
  }

  /**
   * 生成摘要
   */
  getSummary(): string {
    const status = this.getStatus();
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    
    return `任务进度: ${status.done}/${status.total} (${Math.floor(elapsed / 60)}分${elapsed % 60}秒)`;
  }
}

// ============ 导出单例 ============

let globalManager: TaskManager | null = null;

export function getTaskManager(): TaskManager {
  if (!globalManager) {
    globalManager = new TaskManager();
  }
  return globalManager;
}

export function resetTaskManager(): void {
  globalManager = null;
}