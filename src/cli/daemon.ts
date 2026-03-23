/**
 * Ralph 后台任务管理
 * 
 * 管理后台运行的 Ralph 任务
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';

// ============ 目录配置 ============

const SECUREBOT_DIR = join(homedir(), '.securebot');
const DAEMON_DIR = join(SECUREBOT_DIR, '.daemon');
const LOG_DIR = join(DAEMON_DIR, 'logs');

// 确保目录存在
function ensureDir(): void {
  if (!existsSync(DAEMON_DIR)) {
    mkdirSync(DAEMON_DIR, { recursive: true });
  }
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

// ============ 类型定义 ============

export interface DaemonTask {
  /** 任务 ID */
  id: string;
  /** 进程 ID */
  pid?: number;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 任务描述 */
  task: string;
  /** Agent ID */
  agent: string;
  /** 最大迭代次数 */
  maxIterations: number;
  /** 状态 */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** 进度 */
  progress?: {
    current: number;
    total: number;
    currentStory?: string;
  };
  /** 结果 */
  result?: {
    success: boolean;
    iterations: number;
    completedStories: number;
    totalStories: number;
    reason?: string;
  };
  /** 错误信息 */
  error?: string;
  /** 日志文件 */
  logFile?: string;
  /** 会话密钥（用于通知） */
  sessionKey?: string;
}

export interface TaskListOptions {
  /** 只显示运行中的任务 */
  runningOnly?: boolean;
  /** 限制数量 */
  limit?: number;
}

// ============ 任务管理 ============

/**
 * 启动后台任务
 */
export async function startDaemonTask(options: {
  task: string;
  iterations: number;
  agent: string;
  sessionKey?: string;
  notify?: boolean;
}): Promise<DaemonTask> {
  ensureDir();
  
  const taskId = `ralph-${Date.now()}`;
  const logFile = join(LOG_DIR, `${taskId}.log`);
  
  // 创建任务信息
  const taskInfo: DaemonTask = {
    id: taskId,
    startTime: Date.now(),
    task: options.task,
    agent: options.agent,
    maxIterations: options.iterations,
    status: 'running',
    logFile,
    sessionKey: options.sessionKey,
  };
  
  // 保存初始状态
  saveTask(taskInfo);
  
  // 构建命令参数
  const args = [
    'dist/cli/ralph-runner.js',
    '--task', options.task,
    '--iterations', String(options.iterations),
    '--agent', options.agent,
  ];
  
  if (options.notify && options.sessionKey) {
    args.push('--notify', '--session', options.sessionKey);
  }
  
  // 启动子进程
  const child = spawn('node', args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
    },
  });
  
  // 记录 PID
  taskInfo.pid = child.pid;
  saveTask(taskInfo);
  
  // 记录日志
  const logStream = {
    write: (data: string) => {
      appendFileSync(logFile, data);
    }
  };
  
  child.stdout?.on('data', (data: Buffer) => {
    logStream.write(data.toString());
  });
  
  child.stderr?.on('data', (data: Buffer) => {
    logStream.write(data.toString());
  });
  
  child.on('close', (code) => {
    // 更新任务状态
    const task = loadTask(taskId);
    if (task) {
      task.endTime = Date.now();
      task.status = code === 0 ? 'completed' : 'failed';
      saveTask(task);
    }
  });
  
  // 让子进程独立运行
  child.unref();
  
  return taskInfo;
}

/**
 * 保存任务信息
 */
function saveTask(task: DaemonTask): void {
  ensureDir();
  const taskFile = join(DAEMON_DIR, `${task.id}.json`);
  writeFileSync(taskFile, JSON.stringify(task, null, 2));
}

/**
 * 加载任务信息
 */
export function loadTask(taskId: string): DaemonTask | null {
  const taskFile = join(DAEMON_DIR, `${taskId}.json`);
  
  if (!existsSync(taskFile)) {
    return null;
  }
  
  try {
    return JSON.parse(readFileSync(taskFile, 'utf-8')) as DaemonTask;
  } catch {
    return null;
  }
}

/**
 * 更新任务进度
 */
export function updateTaskProgress(
  taskId: string, 
  progress: DaemonTask['progress']
): void {
  const task = loadTask(taskId);
  if (task) {
    task.progress = progress;
    saveTask(task);
  }
}

/**
 * 完成任务
 */
export function completeTask(
  taskId: string, 
  result: DaemonTask['result']
): void {
  const task = loadTask(taskId);
  if (task) {
    task.endTime = Date.now();
    task.status = result?.success ? 'completed' : 'failed';
    task.result = result;
    saveTask(task);
  }
}

/**
 * 取消任务
 */
export function cancelTask(taskId: string): boolean {
  const task = loadTask(taskId);
  if (!task) return false;
  
  if (task.pid) {
    try {
      process.kill(task.pid, 'SIGTERM');
    } catch {
      // 进程可能已经结束
    }
  }
  
  task.endTime = Date.now();
  task.status = 'cancelled';
  saveTask(task);
  
  return true;
}

/**
 * 列出所有任务
 */
export function listTasks(options: TaskListOptions = {}): DaemonTask[] {
  ensureDir();
  
  const files = readdirSync(DAEMON_DIR)
    .filter(f => f.startsWith('ralph-') && f.endsWith('.json'));
  
  let tasks = files.map(f => {
    try {
      return JSON.parse(readFileSync(join(DAEMON_DIR, f), 'utf-8')) as DaemonTask;
    } catch {
      return null;
    }
  }).filter((t): t is DaemonTask => t !== null);
  
  // 按时间排序（最新的在前）
  tasks.sort((a, b) => b.startTime - a.startTime);
  
  // 过滤
  if (options.runningOnly) {
    tasks = tasks.filter(t => t.status === 'running');
  }
  
  // 限制数量
  if (options.limit) {
    tasks = tasks.slice(0, options.limit);
  }
  
  return tasks;
}

/**
 * 获取运行中的任务
 */
export function getRunningTasks(): DaemonTask[] {
  return listTasks({ runningOnly: true });
}

/**
 * 清理旧任务
 */
export function cleanupOldTasks(maxAge: number = 7 * 24 * 60 * 60 * 1000): number {
  ensureDir();
  
  const now = Date.now();
  const tasks = listTasks();
  let cleaned = 0;
  
  for (const task of tasks) {
    // 只清理已完成/失败/取消的任务
    if (task.status === 'running') continue;
    
    const age = now - (task.endTime || task.startTime);
    if (age > maxAge) {
      const taskFile = join(DAEMON_DIR, `${task.id}.json`);
      try {
        unlinkSync(taskFile);
        if (task.logFile && existsSync(task.logFile)) {
          unlinkSync(task.logFile);
        }
        cleaned++;
      } catch {
        // 忽略错误
      }
    }
  }
  
  return cleaned;
}

/**
 * 获取任务日志
 */
export function getTaskLog(taskId: string): string | null {
  const task = loadTask(taskId);
  if (!task?.logFile || !existsSync(task.logFile)) {
    return null;
  }
  
  return readFileSync(task.logFile, 'utf-8');
}

/**
 * 格式化任务状态
 */
export function formatTaskStatus(task: DaemonTask): string {
  const statusEmoji = {
    pending: '⏳',
    running: '🔄',
    completed: '✅',
    failed: '❌',
    cancelled: '🚫',
  };
  
  const lines: string[] = [];
  
  lines.push(chalk.cyan.bold(`任务 ${task.id}`));
  lines.push(chalk.gray(`状态: ${statusEmoji[task.status]} ${task.status}`));
  lines.push(chalk.gray(`描述: ${task.task}`));
  lines.push(chalk.gray(`Agent: ${task.agent}`));
  lines.push(chalk.gray(`开始: ${new Date(task.startTime).toLocaleString()}`));
  
  if (task.endTime) {
    const duration = Math.round((task.endTime - task.startTime) / 1000);
    lines.push(chalk.gray(`结束: ${new Date(task.endTime).toLocaleString()}`));
    lines.push(chalk.gray(`耗时: ${duration}秒`));
  }
  
  if (task.progress) {
    lines.push(chalk.gray(`进度: ${task.progress.current}/${task.progress.total}`));
  }
  
  if (task.result) {
    lines.push(chalk.gray(`迭代: ${task.result.iterations}`));
    lines.push(chalk.gray(`完成: ${task.result.completedStories}/${task.result.totalStories}`));
  }
  
  if (task.error) {
    lines.push(chalk.red(`错误: ${task.error}`));
  }
  
  return lines.join('\n');
}