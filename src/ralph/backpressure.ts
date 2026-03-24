/**
 * Ralph 反压系统
 * 
 * 反压是自动化的反馈机制，让智能体在没有人类干预的情况下检测和纠正错误
 * 
 * 核心原则：
 * - 类型系统
 * - 测试
 * - Linter
 * - 预提交钩子
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import type { BackpressureConfig, BackpressureResult, BackpressureCheckResult } from './types.js';

/**
 * 反压系统默认配置
 */
const DEFAULT_BACKPRESSURE_CONFIG: BackpressureConfig = {
  typecheck: {
    enabled: true,
    command: 'npm run typecheck',
    timeout: 60000,
  },
  test: {
    enabled: true,
    command: 'npm test',
    timeout: 120000,
  },
  lint: {
    enabled: true,
    command: 'npm run lint',
    timeout: 60000,
    autoFix: true,
  },
  onFail: 'block',
  maxAutoRetry: 3,
};

/**
 * 允许的命令前缀（防止命令注入）
 */
const ALLOWED_COMMAND_PREFIXES = [
  'npm ',
  'npx ',
  'node ',
  'python ',
  'python3 ',
  'pip ',
  'pytest',
  'ruff ',
  'go ',
  'cargo ',
  'make ',
  'gradle',
  'mvn ',
];

/**
 * 验证命令是否安全
 */
export function isCommandSafe(command: string): boolean {
  const normalizedCmd = command.trim().toLowerCase();
  
  // 检查是否以允许的前缀开头
  const isAllowed = ALLOWED_COMMAND_PREFIXES.some(prefix => 
    normalizedCmd.startsWith(prefix.toLowerCase())
  );
  
  if (!isAllowed) {
    return false;
  }
  
  // 检查危险字符
  const dangerousPatterns = [
    /[;&|`$]/,           // 命令连接符
    /\$\(/,              // 命令替换
    />\s*\//,            // 重定向到根目录
    /rm\s+-rf/,          // 危险删除
    /sudo/,              // 提权
    /chmod\s+777/,       // 危险权限
  ];
  
  return !dangerousPatterns.some(pattern => pattern.test(command));
}

/**
 * 执行单个命令
 */
async function executeCommand(
  command: string,
  cwd: string,
  timeout: number = 60000
): Promise<{ exitCode: number; output: string; duration: number }> {
  const startTime = Date.now();
  
  // 验证命令安全性
  if (!isCommandSafe(command)) {
    return {
      exitCode: 1,
      output: `安全错误: 命令被拒绝 - "${command}"`,
      duration: 0,
    };
  }
  
  return new Promise((resolve) => {
    const proc = spawn(command, [], {
      cwd,
      shell: true,
      timeout,
    });
    
    let output = '';
    
    proc.stdout?.on('data', (data) => {
      output += data.toString();
    });
    
    proc.stderr?.on('data', (data) => {
      output += data.toString();
    });
    
    proc.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        output: output.slice(-2000), // 只保留最后 2000 字符
        duration: Date.now() - startTime,
      });
    });
    
    proc.on('error', (err) => {
      resolve({
        exitCode: 1,
        output: err.message,
        duration: Date.now() - startTime,
      });
    });
  });
}

/**
 * 检测项目类型并返回合适的反压命令
 */
function detectBackpressureCommands(cwd: string): Partial<BackpressureConfig> {
  // Python 项目
  if (
    existsSync(join(cwd, 'pyproject.toml')) ||
    existsSync(join(cwd, 'setup.py')) ||
    existsSync(join(cwd, 'requirements.txt'))
  ) {
    return {
      typecheck: {
        enabled: true,
        command: 'python -m py_compile .',
        timeout: 60000,
      },
      test: {
        enabled: true,
        command: 'python -m pytest -x --tb=short',
        timeout: 120000,
      },
      lint: {
        enabled: existsSync(join(cwd, 'ruff.toml')) || existsSync(join(cwd, '.ruff.toml')),
        command: 'ruff check .',
        timeout: 60000,
      },
    };
  }
  
  // Node.js/TypeScript 项目
  if (existsSync(join(cwd, 'package.json'))) {
    return DEFAULT_BACKPRESSURE_CONFIG;
  }
  
  // Go 项目
  if (existsSync(join(cwd, 'go.mod'))) {
    return {
      typecheck: {
        enabled: true,
        command: 'go vet ./...',
        timeout: 60000,
      },
      test: {
        enabled: true,
        command: 'go test ./...',
        timeout: 120000,
      },
      lint: {
        enabled: false,
      },
    };
  }
  
  // 未知项目，禁用反压
  return {
    typecheck: { enabled: false },
    test: { enabled: false },
    lint: { enabled: false },
  };
}

/**
 * 运行反压检查
 */
export async function runBackpressure(
  config: Partial<BackpressureConfig>,
  cwd: string
): Promise<BackpressureResult> {
  const startTime = Date.now();
  const results: BackpressureCheckResult[] = [];
  
  // 自动检测命令
  const detected = detectBackpressureCommands(cwd);
  const finalConfig = { ...detected, ...config };
  
  console.log(chalk.cyan('\n🔒 运行反压检查...'));
  
  // 1. 类型检查
  if (finalConfig.typecheck?.enabled) {
    console.log(chalk.gray('  检查类型...'));
    const result = await executeCommand(
      finalConfig.typecheck.command || 'npm run typecheck',
      cwd,
      finalConfig.typecheck.timeout
    );
    
    results.push({
      type: 'typecheck',
      passed: result.exitCode === 0,
      output: result.output,
      duration: result.duration,
    });
    
    if (result.exitCode === 0) {
      console.log(chalk.green('  ✓ 类型检查通过'));
    } else {
      console.log(chalk.red('  ✗ 类型检查失败'));
    }
  }
  
  // 2. 测试
  if (finalConfig.test?.enabled) {
    console.log(chalk.gray('  运行测试...'));
    const result = await executeCommand(
      finalConfig.test.command || 'npm test',
      cwd,
      finalConfig.test.timeout
    );
    
    results.push({
      type: 'test',
      passed: result.exitCode === 0,
      output: result.output,
      duration: result.duration,
    });
    
    if (result.exitCode === 0) {
      console.log(chalk.green('  ✓ 测试通过'));
    } else {
      console.log(chalk.red('  ✗ 测试失败'));
    }
  }
  
  // 3. Lint
  if (finalConfig.lint?.enabled) {
    console.log(chalk.gray('  运行 Lint...'));
    const result = await executeCommand(
      finalConfig.lint.command || 'npm run lint',
      cwd,
      finalConfig.lint.timeout
    );
    
    results.push({
      type: 'lint',
      passed: result.exitCode === 0,
      output: result.output,
      duration: result.duration,
    });
    
    if (result.exitCode === 0) {
      console.log(chalk.green('  ✓ Lint 通过'));
    } else {
      console.log(chalk.yellow('  ⚠ Lint 警告'));
    }
  }
  
  const allPassed = results.every(r => r.passed);
  const duration = Date.now() - startTime;
  
  if (allPassed) {
    console.log(chalk.green.bold('\n✓ 所有反压检查通过'));
  } else {
    const failed = results.filter(r => !r.passed).map(r => r.type);
    console.log(chalk.red.bold(`\n✗ 反压检查失败: ${failed.join(', ')}`));
  }
  
  return {
    allPassed,
    results,
    duration,
  };
}

/**
 * 从反压结果生成错误提示
 */
export function generateBackpressureError(result: BackpressureResult): string {
  const failed = result.results.filter(r => !r.passed);
  
  if (failed.length === 0) {
    return '';
  }
  
  const lines: string[] = ['## 反压检查失败'];
  lines.push('');
  
  for (const check of failed) {
    lines.push(`### ${check.type} 失败`);
    lines.push('');
    if (check.output) {
      lines.push('```');
      lines.push(check.output);
      lines.push('```');
    }
    lines.push('');
  }
  
  return lines.join('\n');
}