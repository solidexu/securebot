/**
 * 任务规划与执行控制器
 * 
 * 实现基于 TODO list 的任务管理
 * 支持检查点保存与断点续执行
 */

import { homedir } from 'node:os';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// ============ 类型定义 ============

export interface TodoItem {
  /** 任务ID */
  id: string;
  /** 任务描述 */
  task: string;
  /** 状态 */
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  /** 依赖项 */
  dependencies?: string[];
  /** 执行结果 */
  result?: string;
  /** 错误信息 */
  error?: string;
  /** 开始时间 */
  startedAt?: number;
  /** 完成时间 */
  completedAt?: number;
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
  /** 失败数 */
  failed: number;
  /** 跳过数 */
  skipped: number;
}

export interface TaskControlConfig {
  /** 最大执行时间（毫秒） */
  maxTimeoutMs: number;
  /** 连续失败次数上限 */
  maxConsecutiveFailures: number;
  /** 是否启用检查点 */
  enableCheckpoint: boolean;
  /** 检查点保存间隔（毫秒） */
  checkpointIntervalMs: number;
  /** 检查点保留数量 */
  maxCheckpoints: number;
}

/**
 * 检查点数据结构
 */
export interface TaskCheckpoint {
  /** 检查点ID */
  id: string;
  /** 创建时间 */
  createdAt: number;
  /** 会话ID */
  sessionId: string;
  /** Agent ID */
  agentId: string;
  /** 原始用户请求 */
  userRequest: string;
  /** TODO 列表 */
  todos: TodoItem[];
  /** 当前执行上下文 */
  context: {
    startTime: number;
    failureCount: number;
    recentCalls: Array<{ tool: string; params: Record<string, unknown> }>;
    currentStepId: string | null;
  };
  /** 执行日志 */
  executionLog: ExecutionLogEntry[];
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 执行日志条目
 */
export interface ExecutionLogEntry {
  timestamp: number;
  type: 'tool_call' | 'step_start' | 'step_complete' | 'step_failed' | 'checkpoint' | 'resume';
  data: Record<string, unknown>;
}

/**
 * 恢复选项
 */
export interface ResumeOptions {
  /** 从检查点恢复 */
  checkpointId?: string;
  /** 从最近的检查点恢复 */
  fromLatest?: boolean;
  /** 清除失败状态重试 */
  retryFailed?: boolean;
  /** 跳过已完成的步骤 */
  skipCompleted?: boolean;
}

/**
 * 恢复结果
 */
export interface ResumeResult {
  success: boolean;
  checkpoint?: TaskCheckpoint;
  message: string;
  remainingTasks: TodoItem[];
  progress: TaskStatus;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: TaskControlConfig = {
  maxTimeoutMs: 10 * 60 * 1000, // 10 分钟
  maxConsecutiveFailures: 3,
  enableCheckpoint: true,
  checkpointIntervalMs: 30 * 1000, // 30 秒
  maxCheckpoints: 10,
};

// ============ 任务管理器 ============

export class TaskManager {
  private todos: Map<string, TodoItem> = new Map();
  private config: TaskControlConfig;
  private startTime: number = 0;
  private failureCount: number = 0;
  private recentCalls: Array<{ tool: string; params: Record<string, unknown> }> = [];
  private currentStepId: string | null = null;
  private sessionId: string = '';
  private agentId: string = '';
  private userRequest: string = '';
  private executionLog: ExecutionLogEntry[] = [];
  private lastCheckpointTime: number = 0;
  private checkpointDir: string;

  constructor(config: Partial<TaskControlConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.checkpointDir = join(homedir(), '.securebot', 'checkpoints');
    this.ensureCheckpointDir();
  }

  // ============ 初始化与配置 ============

  /**
   * 确保检查点目录存在
   */
  private ensureCheckpointDir(): void {
    if (!existsSync(this.checkpointDir)) {
      mkdirSync(this.checkpointDir, { recursive: true });
    }
  }

  /**
   * 初始化任务（开始计时）
   */
  start(sessionId?: string, agentId?: string, userRequest?: string): void {
    this.sessionId = sessionId ?? `session-${Date.now()}`;
    this.agentId = agentId ?? 'default';
    this.userRequest = userRequest ?? '';
    this.startTime = Date.now();
    this.failureCount = 0;
    this.recentCalls = [];
    this.currentStepId = null;
    this.executionLog = [];
    this.lastCheckpointTime = Date.now();

    this.logExecution('step_start', { action: 'task_initialized' });
  }

  // ============ TODO 管理 ============

  /**
   * 设置 TODO 列表
   */
  setTodos(todos: TodoItem[]): void {
    this.todos.clear();
    for (const item of todos) {
      this.todos.set(item.id, { ...item });
    }
  }

  /**
   * 从模型输出解析 TODO 列表
   */
  parseTodoList(content: string): TodoItem[] {
    const lines = content.split('\n');
    const todoRegex = /^[-*]\s*\[([ x→!])\]\s*(.+)/i;
    const todos: TodoItem[] = [];

    for (const line of lines) {
      const match = line.match(todoRegex);
      if (match && match[1] && match[2]) {
        const statusChar = match[1].trim();
        let status: TodoItem['status'] = 'pending';
        if (statusChar === 'x') status = 'completed';
        else if (statusChar === '→') status = 'in_progress';
        else if (statusChar === '!') status = 'failed';

        todos.push({
          id: `todo-${todos.length + 1}`,
          task: match[2].trim(),
          status,
        });
      }
    }

    // 也尝试匹配数字列表
    const numberedRegex = /^\d+[.)、]\s*(.+)/;
    if (todos.length === 0) {
      for (const line of lines) {
        const match = line.match(numberedRegex);
        if (match && match[1]) {
          todos.push({
            id: `todo-${todos.length + 1}`,
            task: match[1].trim(),
            status: 'pending',
          });
        }
      }
    }

    this.setTodos(todos);
    return todos;
  }

  /**
   * 获取所有 TODO 项
   */
  getTodos(): TodoItem[] {
    return Array.from(this.todos.values());
  }

  /**
   * 获取单个 TODO 项
   */
  getTodo(id: string): TodoItem | undefined {
    return this.todos.get(id);
  }

  /**
   * 更新任务状态
   */
  updateStatus(itemId: string, status: TodoItem['status'], result?: string, error?: string): void {
    const item = this.todos.get(itemId);
    if (item) {
      const now = Date.now();
      
      if (status === 'in_progress' && item.status !== 'in_progress') {
        item.startedAt = now;
        this.currentStepId = itemId;
        this.logExecution('step_start', { stepId: itemId, task: item.task });
      }
      
      if (status === 'completed' || status === 'failed' || status === 'skipped') {
        item.completedAt = now;
        this.currentStepId = null;
        
        if (status === 'completed') {
          this.logExecution('step_complete', { stepId: itemId, task: item.task, result });
          this.failureCount = 0; // 重置失败计数
        } else if (status === 'failed') {
          this.logExecution('step_failed', { stepId: itemId, task: item.task, error });
        }
      }
      
      item.status = status;
      if (result) item.result = result;
      if (error) item.error = error;
      
      // 自动保存检查点
      this.maybeSaveCheckpoint();
    }
  }

  /**
   * 标记任务完成
   */
  markCompleted(itemId: string, result?: string): void {
    this.updateStatus(itemId, 'completed', result);
  }

  /**
   * 标记任务失败
   */
  markFailed(itemId: string, error?: string): void {
    this.updateStatus(itemId, 'failed', undefined, error);
    this.failureCount++;
  }

  /**
   * 跳过任务
   */
  skipTask(itemId: string, reason?: string): void {
    this.updateStatus(itemId, 'skipped', reason);
  }

  // ============ 检查点管理 ============

  /**
   * 生成检查点ID
   */
  private generateCheckpointId(): string {
    return `cp_${this.sessionId}_${Date.now()}`;
  }

  /**
   * 获取检查点文件路径
   */
  private getCheckpointPath(checkpointId: string): string {
    return join(this.checkpointDir, `${checkpointId}.json`);
  }

  /**
   * 保存检查点
   */
  saveCheckpoint(): string {
    const checkpointId = this.generateCheckpointId();
    
    const checkpoint: TaskCheckpoint = {
      id: checkpointId,
      createdAt: Date.now(),
      sessionId: this.sessionId,
      agentId: this.agentId,
      userRequest: this.userRequest,
      todos: this.getTodos(),
      context: {
        startTime: this.startTime,
        failureCount: this.failureCount,
        recentCalls: [...this.recentCalls],
        currentStepId: this.currentStepId,
      },
      executionLog: [...this.executionLog],
    };

    const filePath = this.getCheckpointPath(checkpointId);
    writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');

    this.lastCheckpointTime = Date.now();
    this.logExecution('checkpoint', { checkpointId });

    // 清理旧检查点
    this.cleanupOldCheckpoints();

    return checkpointId;
  }

  /**
   * 自动保存检查点（根据间隔）
   */
  private maybeSaveCheckpoint(): void {
    if (!this.config.enableCheckpoint) return;
    
    const elapsed = Date.now() - this.lastCheckpointTime;
    if (elapsed >= this.config.checkpointIntervalMs) {
      this.saveCheckpoint();
    }
  }

  /**
   * 加载检查点
   */
  loadCheckpoint(checkpointId: string): TaskCheckpoint | null {
    const filePath = this.getCheckpointPath(checkpointId);
    if (!existsSync(filePath)) return null;

    try {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as TaskCheckpoint;
    } catch {
      return null;
    }
  }

  /**
   * 获取最近的检查点
   */
  getLatestCheckpoint(sessionId?: string): TaskCheckpoint | null {
    const checkpoints = this.listCheckpoints(sessionId);
    if (checkpoints.length === 0) return null;
    
    // 返回最新的
    return this.loadCheckpoint(checkpoints[0]!.id);
  }

  /**
   * 列出所有检查点
   */
  listCheckpoints(sessionId?: string): Array<{ id: string; createdAt: number; sessionId: string; progress: TaskStatus }> {
    if (!existsSync(this.checkpointDir)) return [];

    const files = readdirSync(this.checkpointDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const content = readFileSync(join(this.checkpointDir, f), 'utf-8');
          const cp = JSON.parse(content) as TaskCheckpoint;
          const todos = cp.todos || [];
          const done = todos.filter(t => t.status === 'completed').length;
          return {
            id: cp.id,
            createdAt: cp.createdAt,
            sessionId: cp.sessionId,
            progress: {
              completed: done === todos.length,
              total: todos.length,
              done,
              inProgress: todos.filter(t => t.status === 'in_progress').length,
              failed: todos.filter(t => t.status === 'failed').length,
              skipped: todos.filter(t => t.status === 'skipped').length,
            },
          };
        } catch {
          return null;
        }
      })
      .filter((cp): cp is NonNullable<typeof cp> => cp !== null)
      .filter(cp => !sessionId || cp.sessionId === sessionId)
      .sort((a, b) => b.createdAt - a.createdAt);

    return files;
  }

  /**
   * 删除检查点
   */
  deleteCheckpoint(checkpointId: string): boolean {
    const filePath = this.getCheckpointPath(checkpointId);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      return true;
    }
    return false;
  }

  /**
   * 清理旧检查点
   */
  private cleanupOldCheckpoints(): void {
    const checkpoints = this.listCheckpoints();
    
    // 保留最新的 maxCheckpoints 个
    if (checkpoints.length > this.config.maxCheckpoints) {
      const toDelete = checkpoints.slice(this.config.maxCheckpoints);
      for (const cp of toDelete) {
        this.deleteCheckpoint(cp.id);
      }
    }
  }

  /**
   * 从检查点恢复
   */
  resumeFromCheckpoint(options: ResumeOptions = {}): ResumeResult {
    let checkpoint: TaskCheckpoint | null = null;

    // 确定要恢复的检查点
    if (options.checkpointId) {
      checkpoint = this.loadCheckpoint(options.checkpointId);
    } else if (options.fromLatest) {
      checkpoint = this.getLatestCheckpoint();
    } else {
      checkpoint = this.getLatestCheckpoint(this.sessionId);
    }

    if (!checkpoint) {
      return {
        success: false,
        message: '未找到可恢复的检查点',
        remainingTasks: [],
        progress: { completed: false, total: 0, done: 0, inProgress: 0, failed: 0, skipped: 0 },
      };
    }

    // 恢复状态
    this.sessionId = checkpoint.sessionId;
    this.agentId = checkpoint.agentId;
    this.userRequest = checkpoint.userRequest;
    this.startTime = checkpoint.context.startTime;
    this.failureCount = options.retryFailed ? 0 : checkpoint.context.failureCount;
    this.recentCalls = [...checkpoint.context.recentCalls];
    this.currentStepId = checkpoint.context.currentStepId;
    this.executionLog = [...checkpoint.executionLog];
    
    // 恢复 TODO 列表
    const todos = checkpoint.todos.map(item => {
      let status = item.status;
      
      // 可选：重试失败的任务
      if (options.retryFailed && status === 'failed') {
        status = 'pending';
      }
      
      return { ...item, status };
    });
    
    this.setTodos(todos);

    this.logExecution('resume', { checkpointId: checkpoint.id, options });

    // 计算剩余任务
    const remainingTasks = todos.filter(item => 
      item.status === 'pending' || item.status === 'in_progress' || 
      (options.retryFailed && item.status === 'failed')
    );

    const progress = this.getStatus();

    return {
      success: true,
      checkpoint,
      message: `已从检查点恢复，剩余 ${remainingTasks.length} 个任务`,
      remainingTasks,
      progress,
    };
  }

  // ============ 执行控制 ============

  /**
   * 记录工具调用
   */
  recordToolCall(tool: string, params: Record<string, unknown>): void {
    this.recentCalls.push({ tool, params: { ...params } });
    // 保持最近 20 条
    if (this.recentCalls.length > 20) {
      this.recentCalls.shift();
    }
    
    this.logExecution('tool_call', { tool, params });
  }

  /**
   * 记录执行日志
   */
  private logExecution(type: ExecutionLogEntry['type'], data: Record<string, unknown>): void {
    this.executionLog.push({
      timestamp: Date.now(),
      type,
      data,
    });
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
        // 超时前保存检查点
        this.saveCheckpoint();
        return { terminate: true, reason: `任务超时 (${Math.floor(elapsed / 60000)} 分钟)，已保存检查点` };
      }
    }

    // 2. 检查连续失败
    if (this.failureCount >= this.config.maxConsecutiveFailures) {
      // 失败前保存检查点
      this.saveCheckpoint();
      return {
        terminate: true,
        reason: `连续失败 ${this.failureCount} 次，已保存检查点，可使用 /resume 恢复`,
      };
    }

    // 3. 检查循环
    if (this.detectLoop()) {
      this.saveCheckpoint();
      return { terminate: true, reason: '检测到循环，连续相同的工具调用，已保存检查点' };
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
    const todos = Array.from(this.todos.values());
    const done = todos.filter(t => t.status === 'completed').length;
    const inProgress = todos.filter(t => t.status === 'in_progress').length;
    const failed = todos.filter(t => t.status === 'failed').length;
    const skipped = todos.filter(t => t.status === 'skipped').length;

    return {
      completed: total === done + skipped && failed === 0,
      total,
      done,
      inProgress,
      failed,
      skipped,
    };
  }

  /**
   * 获取下一个待处理任务
   */
  getNextTask(): TodoItem | null {
    // 优先返回进行中的任务
    for (const item of this.todos.values()) {
      if (item.status === 'in_progress') {
        return item;
      }
    }
    
    // 然后返回待处理的任务
    for (const item of this.todos.values()) {
      if (item.status === 'pending') {
        item.status = 'in_progress';
        item.startedAt = Date.now();
        this.currentStepId = item.id;
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
    
    const parts = [
      `任务进度: ${status.done}/${status.total}`,
    ];
    
    if (status.inProgress > 0) parts.push(`进行中: ${status.inProgress}`);
    if (status.failed > 0) parts.push(`失败: ${status.failed}`);
    if (status.skipped > 0) parts.push(`跳过: ${status.skipped}`);
    
    parts.push(`耗时: ${Math.floor(elapsed / 60)}分${elapsed % 60}秒`);
    
    return parts.join(' | ');
  }

  /**
   * 获取执行日志
   */
  getExecutionLog(): ExecutionLogEntry[] {
    return [...this.executionLog];
  }

  /**
   * 导出执行报告
   */
  exportReport(): string {
    const status = this.getStatus();
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    
    let report = `# 任务执行报告\n\n`;
    report += `**会话ID**: ${this.sessionId}\n`;
    report += `**Agent**: ${this.agentId}\n`;
    report += `**用户请求**: ${this.userRequest}\n`;
    report += `**执行时间**: ${Math.floor(elapsed / 60)}分${elapsed % 60}秒\n\n`;
    
    report += `## 状态摘要\n\n`;
    report += `- 总任务: ${status.total}\n`;
    report += `- 已完成: ${status.done}\n`;
    report += `- 进行中: ${status.inProgress}\n`;
    report += `- 失败: ${status.failed}\n`;
    report += `- 跳过: ${status.skipped}\n\n`;
    
    report += `## 任务列表\n\n`;
    for (const item of this.getTodos()) {
      const icon = {
        pending: '⬜',
        in_progress: '🔄',
        completed: '✅',
        failed: '❌',
        skipped: '⏭️',
      }[item.status];
      
      report += `- ${icon} ${item.task}\n`;
      if (item.result) report += `  - 结果: ${item.result}\n`;
      if (item.error) report += `  - 错误: ${item.error}\n`;
    }
    
    return report;
  }
}

// ============ 导出单例 ============

let globalManager: TaskManager | null = null;

export function getTaskManager(config?: Partial<TaskControlConfig>): TaskManager {
  if (!globalManager) {
    globalManager = new TaskManager(config);
  }
  return globalManager;
}

export function resetTaskManager(): void {
  globalManager = null;
}