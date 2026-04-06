/**
 * Shell 快速命令模块
 *
 * 从 repl-message.ts 提取的共享逻辑：
 * - 检测简单命令（ls, pwd 等）和带参数命令（cat, head 等）
 * - 直接执行 shell 命令，不调用 LLM
 * - 支持 Docker 沙箱和主机执行
 */

import { execSync } from 'node:child_process';

// ============ 类型定义 ============

export interface SimpleCommand {
  cmd: string;
  desc: string;
  showOutput: boolean;
}

export interface QuickCommandPattern {
  pattern: RegExp;
  desc: string;
  dangerous: boolean;
}

export interface ShellCommandResult {
  success: boolean;
  output?: string;
  error?: string;
  command: string;
  description: string;
  workspace: string;
}

interface ExecuteOptions {
  workspace: string;
  timeout?: number;
}

// ============ 简单命令表 ============

/** 简单命令（精确匹配，无参数） */
export const SIMPLE_COMMANDS: Record<string, SimpleCommand> = {
  // 文件系统导航
  'ls':   { cmd: 'ls -la', desc: '列出当前目录内容', showOutput: true },
  'll':   { cmd: 'ls -la', desc: '列出当前目录内容', showOutput: true },
  'la':   { cmd: 'ls -la', desc: '列出当前目录内容', showOutput: true },
  'l':    { cmd: 'ls -la', desc: '列出当前目录内容', showOutput: true },
  'pwd':  { cmd: 'pwd', desc: '显示当前工作目录', showOutput: true },
  'cd':   { cmd: 'pwd', desc: '显示当前工作目录', showOutput: true },

  // 系统信息
  'whoami':   { cmd: 'whoami', desc: '显示当前用户', showOutput: true },
  'date':     { cmd: 'date', desc: '显示当前日期时间', showOutput: true },
  'hostname': { cmd: 'hostname', desc: '显示主机名', showOutput: true },
  'uname':    { cmd: 'uname -a', desc: '显示系统信息', showOutput: true },
  'df':       { cmd: 'df -h', desc: '显示磁盘使用情况', showOutput: true },
  'free':     { cmd: 'free -h', desc: '显示内存使用情况', showOutput: true },
  'uptime':   { cmd: 'uptime', desc: '显示系统运行时间', showOutput: true },

  // Git 快捷命令
  'gs':          { cmd: 'git status', desc: 'Git 状态', showOutput: true },
  'git status':  { cmd: 'git status', desc: 'Git 状态', showOutput: true },
  'gl':          { cmd: 'git log --oneline -10', desc: 'Git 日志（最近10条）', showOutput: true },
  'gb':          { cmd: 'git branch', desc: 'Git 分支列表', showOutput: true },
  'gd':          { cmd: 'git diff --stat', desc: 'Git 差异统计', showOutput: true },

  // Python/Node 环境
  'python --version':  { cmd: 'python --version', desc: 'Python 版本', showOutput: true },
  'python3 --version': { cmd: 'python3 --version', desc: 'Python3 版本', showOutput: true },
  'node --version':    { cmd: 'node --version', desc: 'Node 版本', showOutput: true },
  'npm --version':     { cmd: 'npm --version', desc: 'NPM 版本', showOutput: true },
  'uv --version':       { cmd: 'uv --version', desc: 'UV 版本', showOutput: true },

  // 终端控制
  'clear': { cmd: 'clear', desc: '清屏', showOutput: false },
  'cls':   { cmd: 'clear', desc: '清屏', showOutput: false },
};

/** 带参数的快速命令模式 */
export const QUICK_CMD_PATTERNS: QuickCommandPattern[] = [
  { pattern: /^cat\s+(.+)$/,        desc: '显示文件内容', dangerous: false },
  { pattern: /^head\s+(-n\s+\d+\s+)?(.+)$/, desc: '显示文件开头', dangerous: false },
  { pattern: /^tail\s+(-n\s+\d+\s+)?(.+)$/, desc: '显示文件结尾', dangerous: false },
  { pattern: /^less\s+(.+)$/,        desc: '分页查看文件', dangerous: false },
  { pattern: /^wc\s+(.+)$/,          desc: '统计文件行数/字数', dangerous: false },
  { pattern: /^find\s+(.+)$/,        desc: '查找文件', dangerous: false },
  { pattern: /^tree\s*(.*)$/,        desc: '显示目录树', dangerous: false },
  { pattern: /^du\s+(.+)$/,          desc: '显示目录大小', dangerous: false },
];

// ============ 检测函数 ============

/**
 * 检测消息是否匹配简单命令
 * @returns 匹配到的命令配置，未匹配返回 null
 */
export function matchSimpleCommand(message: string): SimpleCommand | null {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();
  return SIMPLE_COMMANDS[lower] || SIMPLE_COMMANDS[trimmed] || null;
}

/**
 * 检测消息是否匹配带参数的快速命令
 * @returns 匹配结果，未匹配返回 null
 */
export function matchQuickCommand(message: string): { pattern: QuickCommandPattern; match: RegExpMatchArray } | null {
  const trimmed = message.trim();
  for (const p of QUICK_CMD_PATTERNS) {
    const m = trimmed.match(p.pattern);
    if (m) return { pattern: p, match: m };
  }
  return null;
}

/**
 * 统一检测：先检查简单命令，再检查带参数命令
 * @returns 命令描述字符串（用于 UI 显示），null 表示不是快速命令
 */
export function detectQuickCommand(message: string): string | null {
  if (matchSimpleCommand(message)) {
    return matchSimpleCommand(message)!.desc;
  }
  const quick = matchQuickCommand(message);
  if (quick) {
    return quick.pattern.desc;
  }
  return null;
}

// ============ 执行函数 ============

/**
 * 在指定工作目录执行 shell 命令（同步）
 */
export function executeShellCommand(command: string, options: ExecuteOptions): ShellCommandResult {
  const { workspace, timeout = 10000 } = options;

  try {
    const output = execSync(command, {
      cwd: workspace,
      encoding: 'utf-8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return {
      success: true,
      output: output || undefined,
      command,
      description: command,
      workspace,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || String(error),
      command,
      description: command,
      workspace,
    };
  }
}

/**
 * 执行快速命令（自动判断类型）
 * @param message 用户输入的消息
 * @param options 执行选项
 * @returns 执行结果，如果不是快速命令返回 null
 */
export function executeQuickCommand(
  message: string,
  options: ExecuteOptions
): ShellCommandResult | null {
  // 1. 尝试匹配简单命令
  const simpleCmd = matchSimpleCommand(message);
  if (simpleCmd) {
    const result = executeShellCommand(simpleCmd.cmd, {
      ...options,
      timeout: simpleCmd.showOutput ? 10000 : 5000,
    });
    return {
      ...result,
      description: simpleCmd.desc,
    };
  }

  // 2. 尝试匹配带参数命令
  const quickCmd = matchQuickCommand(message);
  if (quickCmd) {
    return executeShellCommand(message.trim(), {
      ...options,
      timeout: 30000,
    });
  }

  // 3. 不是快速命令
  return null;
}
