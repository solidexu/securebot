/**
 * Ralph Git 集成模块
 * 
 * 在每次迭代完成后自动提交代码，
 * 提供清晰的 Git 历史追踪
 */

import { spawn } from 'node:child_process';
import chalk from 'chalk';
import type { RalphStory } from './types.js';

// ============ 类型定义 ============

/**
 * Git 操作结果
 */
export interface GitResult {
  /** 是否成功 */
  success: boolean;
  /** 输出内容 */
  output: string;
  /** 错误信息 */
  error?: string;
}

/**
 * Git 配置
 */
export interface GitConfig {
  /** 是否启用自动提交 */
  autoCommit: boolean;
  /** 是否自动推送 */
  autoPush: boolean;
  /** 提交消息前缀 */
  commitPrefix: string;
  /** 工作目录 */
  cwd?: string;
}

// ============ 默认配置 ============

const DEFAULT_GIT_CONFIG: GitConfig = {
  autoCommit: true,
  autoPush: false,
  commitPrefix: 'feat',
};

// ============ Git 命令执行 ============

/**
 * 执行 Git 命令
 */
async function execGit(args: string[], cwd?: string): Promise<GitResult> {
  return new Promise((resolve) => {
    let output = '';
    let errorOutput = '';
    
    const proc = spawn('git', args, {
      cwd: cwd ?? process.cwd(),
    });
    
    proc.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });
    
    proc.stderr?.on('data', (data: Buffer) => {
      errorOutput += data.toString();
    });
    
    proc.on('close', (code: number | null) => {
      resolve({
        success: code === 0,
        output: output.trim(),
        error: errorOutput.trim() || undefined,
      });
    });
    
    proc.on('error', (err: Error) => {
      resolve({
        success: false,
        output: '',
        error: err.message,
      });
    });
  });
}

// ============ Git 状态检查 ============

/**
 * 检查是否在 Git 仓库中
 */
export async function isGitRepo(cwd?: string): Promise<boolean> {
  const result = await execGit(['rev-parse', '--is-inside-work-tree'], cwd);
  return result.success && result.output === 'true';
}

/**
 * 检查是否有未提交的更改
 */
export async function hasChanges(cwd?: string): Promise<boolean> {
  const result = await execGit(['status', '--porcelain'], cwd);
  return result.success && result.output.length > 0;
}

/**
 * 获取当前分支名
 */
export async function getCurrentBranch(cwd?: string): Promise<string | null> {
  const result = await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  return result.success ? result.output : null;
}

// ============ Git 操作 ============

/**
 * 暂存所有更改
 */
export async function stageAll(cwd?: string): Promise<GitResult> {
  return execGit(['add', '-A'], cwd);
}

/**
 * 创建提交
 */
export async function commit(message: string, cwd?: string): Promise<GitResult> {
  return execGit(['commit', '-m', message], cwd);
}

/**
 * 推送到远程
 */
export async function push(branch?: string, remote: string = 'origin', cwd?: string): Promise<GitResult> {
  const args = branch ? ['push', remote, branch] : ['push'];
  return execGit(args, cwd);
}

/**
 * 创建并切换到新分支
 */
export async function createBranch(branchName: string, cwd?: string): Promise<GitResult> {
  return execGit(['checkout', '-b', branchName], cwd);
}

// ============ Ralph 集成 ============

/**
 * 生成 Ralph 任务提交消息
 */
export function generateCommitMessage(
  task: RalphStory, 
  prefix: string = 'feat'
): string {
  // 格式: feat(US-001): 实现用户登录功能
  return `${prefix}(${task.id}): ${task.title}`;
}

/**
 * 为 Ralph 任务创建提交
 */
export async function commitForTask(
  task: RalphStory,
  config: Partial<GitConfig> = {}
): Promise<GitResult> {
  const finalConfig = { ...DEFAULT_GIT_CONFIG, ...config };
  
  if (!finalConfig.autoCommit) {
    return { success: true, output: '自动提交已禁用' };
  }
  
  // 检查是否在 Git 仓库中
  const isRepo = await isGitRepo(finalConfig.cwd);
  if (!isRepo) {
    return { success: false, output: '', error: '不在 Git 仓库中' };
  }
  
  // 检查是否有更改
  const hasUncommitted = await hasChanges(finalConfig.cwd);
  if (!hasUncommitted) {
    return { success: true, output: '没有需要提交的更改' };
  }
  
  console.log(chalk.gray('\n📦 提交代码...'));
  
  // 暂存所有更改
  const stageResult = await stageAll(finalConfig.cwd);
  if (!stageResult.success) {
    return { success: false, output: '', error: `暂存失败: ${stageResult.error}` };
  }
  
  // 生成提交消息
  const message = generateCommitMessage(task, finalConfig.commitPrefix);
  
  // 提交
  const commitResult = await commit(message, finalConfig.cwd);
  if (!commitResult.success) {
    return { success: false, output: '', error: `提交失败: ${commitResult.error}` };
  }
  
  console.log(chalk.green(`✓ 已提交: ${message}`));
  
  // 可选：推送
  if (finalConfig.autoPush) {
    const branch = await getCurrentBranch(finalConfig.cwd);
    const pushResult = await push(branch ?? undefined, 'origin', finalConfig.cwd);
    
    if (pushResult.success) {
      console.log(chalk.green(`✓ 已推送到 origin/${branch}`));
    } else {
      console.log(chalk.yellow(`⚠ 推送失败: ${pushResult.error}`));
    }
  }
  
  return { success: true, output: message };
}

/**
 * 为 Ralph 创建功能分支
 */
export async function createRalphBranch(
  branchName: string,
  cwd?: string
): Promise<GitResult> {
  console.log(chalk.gray(`\n🌿 创建分支: ${branchName}`));
  
  const result = await createBranch(branchName, cwd);
  
  if (result.success) {
    console.log(chalk.green(`✓ 已切换到分支: ${branchName}`));
  } else {
    console.log(chalk.yellow(`⚠ 创建分支失败: ${result.error}`));
  }
  
  return result;
}

/**
 * 获取 Ralph 工作摘要
 */
export async function getRalphWorkSummary(cwd?: string): Promise<{
  branch: string | null;
  lastCommits: string[];
  changedFiles: string[];
}> {
  const branch = await getCurrentBranch(cwd);
  
  // 获取最近 5 个提交
  const logResult = await execGit(['log', '--oneline', '-5'], cwd);
  const lastCommits = logResult.success 
    ? logResult.output.split('\n').filter(Boolean)
    : [];
  
  // 获取修改的文件
  const statusResult = await execGit(['status', '--short'], cwd);
  const changedFiles = statusResult.success
    ? statusResult.output.split('\n').filter(Boolean)
    : [];
  
  return {
    branch,
    lastCommits,
    changedFiles,
  };
}

// ============ 导出 ============

export { DEFAULT_GIT_CONFIG };