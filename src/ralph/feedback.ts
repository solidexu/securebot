/**
 * Ralph 反馈循环模块
 * 
 * 在每次迭代后运行测试/Lint/构建等验证命令，
 * 确保任务质量，失败时可选择重试
 */

import { spawn } from 'node:child_process';
import chalk from 'chalk';

// ============ 类型定义 ============

/**
 * 反馈命令结果
 */
export interface FeedbackResult {
  /** 命令 */
  command: string;
  /** 是否成功 */
  passed: boolean;
  /** 退出码 */
  exitCode: number;
  /** 输出内容 */
  output: string;
  /** 错误输出 */
  error?: string;
  /** 执行时间（毫秒） */
  duration: number;
}

/**
 * 反馈循环配置
 */
export interface FeedbackConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 要运行的命令列表 */
  commands: string[];
  /** 单个命令超时时间（毫秒） */
  timeout: number;
  /** 失败时是否继续 */
  continueOnFailure: boolean;
  /** 最大重试次数 */
  maxRetries: number;
  /** 工作目录 */
  cwd?: string;
}

/**
 * 反馈循环结果
 */
export interface FeedbackLoopResult {
  /** 是否全部通过 */
  allPassed: boolean;
  /** 各命令结果 */
  results: FeedbackResult[];
  /** 总耗时（毫秒） */
  totalDuration: number;
  /** 失败的命令 */
  failedCommands: string[];
}

// ============ 默认配置 ============

const DEFAULT_FEEDBACK_CONFIG: FeedbackConfig = {
  enabled: true,
  commands: [],
  timeout: 60000, // 60 秒
  continueOnFailure: false,
  maxRetries: 0,
};

// ============ 命令执行 ============

/**
 * 执行单个命令
 */
export async function executeCommand(
  command: string,
  config: Partial<FeedbackConfig> = {}
): Promise<FeedbackResult> {
  const finalConfig = { ...DEFAULT_FEEDBACK_CONFIG, ...config };
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    let output = '';
    let errorOutput = '';
    
    const proc = spawn(command, [], {
      cwd: finalConfig.cwd,
      shell: true,
      timeout: finalConfig.timeout,
    });
    
    proc.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });
    
    proc.stderr?.on('data', (data: Buffer) => {
      errorOutput += data.toString();
    });
    
    proc.on('close', (code: number | null) => {
      resolve({
        command,
        passed: code === 0,
        exitCode: code ?? 1,
        output: output.slice(-5000), // 限制输出长度
        error: errorOutput.slice(-1000) || undefined,
        duration: Date.now() - startTime,
      });
    });
    
    proc.on('error', (err: Error) => {
      resolve({
        command,
        passed: false,
        exitCode: 1,
        output: '',
        error: err.message,
        duration: Date.now() - startTime,
      });
    });
  });
}

/**
 * 执行多个命令
 */
export async function executeCommands(
  commands: string[],
  config: Partial<FeedbackConfig> = {}
): Promise<FeedbackResult[]> {
  const results: FeedbackResult[] = [];
  
  for (const command of commands) {
    console.log(chalk.gray(`  执行: ${command}`));
    const result = await executeCommand(command, config);
    results.push(result);
    
    if (result.passed) {
      console.log(chalk.green(`  ✓ ${command} (${result.duration}ms)`));
    } else {
      console.log(chalk.red(`  ✗ ${command} (exit: ${result.exitCode})`));
      if (result.error) {
        console.log(chalk.gray(`    错误: ${result.error.slice(0, 200)}`));
      }
      
      // 如果配置为失败时停止，则中断
      if (!config.continueOnFailure) {
        break;
      }
    }
  }
  
  return results;
}

// ============ 反馈循环 ============

/**
 * 运行反馈循环
 */
export async function runFeedbackLoop(
  config: Partial<FeedbackConfig> = {}
): Promise<FeedbackLoopResult> {
  const finalConfig = { ...DEFAULT_FEEDBACK_CONFIG, ...config };
  
  if (!finalConfig.enabled) {
    return {
      allPassed: true,
      results: [],
      totalDuration: 0,
      failedCommands: [],
    };
  }
  
  if (finalConfig.commands.length === 0) {
    return {
      allPassed: true,
      results: [],
      totalDuration: 0,
      failedCommands: [],
    };
  }
  
  console.log(chalk.gray('  开始执行反馈命令...'));
  
  const startTime = Date.now();
  const results = await executeCommands(finalConfig.commands, config);
  
  const failedCommands = results
    .filter(r => !r.passed)
    .map(r => r.command);
  
  const allPassed = failedCommands.length === 0;
  const totalDuration = Date.now() - startTime;
  
  if (allPassed) {
    console.log(chalk.green.bold('\n✓ 所有检查通过'));
  } else {
    console.log(chalk.red.bold(`\n✗ ${failedCommands.length} 个检查失败`));
  }
  
  return {
    allPassed,
    results,
    totalDuration,
    failedCommands,
  };
}

/**
 * 带重试的反馈循环
 */
export async function runFeedbackLoopWithRetry(
  config: Partial<FeedbackConfig> = {},
  onRetry?: (attempt: number, failedCommands: string[]) => Promise<void>
): Promise<FeedbackLoopResult> {
  let attempt = 0;
  const maxRetries = config.maxRetries ?? 0;
  
  while (true) {
    const result = await runFeedbackLoop(config);
    
    if (result.allPassed) {
      return result;
    }
    
    attempt++;
    
    if (attempt > maxRetries) {
      console.log(chalk.yellow(`\n达到最大重试次数 (${maxRetries})`));
      return result;
    }
    
    console.log(chalk.yellow(`\n第 ${attempt} 次重试...`));
    
    if (onRetry) {
      await onRetry(attempt, result.failedCommands);
    }
  }
}

// ============ 预设配置 ============

/**
 * 常用反馈配置预设
 */
export const FEEDBACK_PRESETS = {
  /** Node.js 项目 */
  nodejs: {
    commands: ['npm test', 'npm run lint'],
    timeout: 60000,
  },
  
  /** TypeScript 项目 */
  typescript: {
    commands: ['npm run typecheck', 'npm test', 'npm run lint'],
    timeout: 120000,
  },
  
  /** Python 项目 */
  python: {
    commands: ['pytest', 'ruff check .'],
    timeout: 60000,
  },
  
  /** Go 项目 */
  go: {
    commands: ['go test ./...', 'go vet ./...'],
    timeout: 120000,
  },
  
  /** 仅测试 */
  testOnly: {
    commands: ['npm test'],
    timeout: 60000,
  },
  
  /** 仅 Lint */
  lintOnly: {
    commands: ['npm run lint'],
    timeout: 30000,
  },
};

/**
 * 根据项目类型自动检测反馈配置
 */
export function detectFeedbackConfig(cwd?: string): FeedbackConfig {
  const fs = require('node:fs');
  const path = require('node:path');
  const workDir = cwd ?? process.cwd();
  
  try {
    // TypeScript 项目
    if (fs.existsSync(path.join(workDir, 'tsconfig.json'))) {
      return { ...DEFAULT_FEEDBACK_CONFIG, ...FEEDBACK_PRESETS.typescript };
    }
    
    // Node.js 项目
    if (fs.existsSync(path.join(workDir, 'package.json'))) {
      return { ...DEFAULT_FEEDBACK_CONFIG, ...FEEDBACK_PRESETS.nodejs };
    }
    
    // Go 项目
    if (fs.existsSync(path.join(workDir, 'go.mod'))) {
      return { ...DEFAULT_FEEDBACK_CONFIG, ...FEEDBACK_PRESETS.go };
    }
    
    // Python 项目
    if (fs.existsSync(path.join(workDir, 'pyproject.toml')) || 
        fs.existsSync(path.join(workDir, 'requirements.txt'))) {
      return { ...DEFAULT_FEEDBACK_CONFIG, ...FEEDBACK_PRESETS.python };
    }
  } catch {
    // 忽略错误
  }
  
  // 默认：无反馈命令
  return { ...DEFAULT_FEEDBACK_CONFIG, commands: [] };
}

// ============ 导出 ============

export { DEFAULT_FEEDBACK_CONFIG };