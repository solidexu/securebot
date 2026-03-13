/**
 * 命令执行工具
 * 
 * exec - 执行命令
 */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { Tool, ToolContext, ToolResult, ExecPolicy } from '../core/types.js';
import { isCommandAllowed } from '../core/agent.js';

// ============ 类型定义 ============

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
}

// ============ 命令执行 ============

/**
 * 执行命令
 */
function runCommand(
  command: string,
  cwd: string,
  timeout: number = 30000
): Promise<ExecResult> {
  return new Promise((resolvePromise) => {
    const proc = spawn('sh', ['-c', command], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // 超时处理
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolvePromise({
        stdout,
        stderr: stderr + '\n命令执行超时',
        exitCode: null,
        signal: 'SIGKILL',
      });
    }, timeout);

    proc.on('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({
        stdout,
        stderr,
        exitCode: code,
        signal,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolvePromise({
        stdout,
        stderr: err.message,
        exitCode: 1,
        signal: null,
      });
    });
  });
}

// ============ exec 工具 ============

export const execTool: Tool = {
  name: 'exec',
  description: '在 workspace 中执行 shell 命令。命令必须在白名单内。',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '要执行的命令',
      },
      timeout: {
        type: 'number',
        description: '超时时间（毫秒），默认 30000',
      },
      cwd: {
        type: 'string',
        description: '工作目录（相对于 workspace），默认为 workspace 根目录',
      },
    },
    required: ['command'],
  },

  async execute(params, context: ToolContext): Promise<ToolResult> {
    const args = params as Record<string, unknown>;
    const command = args['command'] as string;
    const timeout = (args['timeout'] as number | undefined) ?? 30000;
    const cwd = args['cwd'] as string | undefined;
    
    // 获取执行策略
    const policy = context.agent.tools?.exec as ExecPolicy | undefined;
    const execPolicy: ExecPolicy = {
      security: policy?.security ?? 'allowlist',
      ask: policy?.ask ?? 'always',
      allowlist: policy?.allowlist ?? [],
    };
    
    // 安全检查
    if (execPolicy.security === 'deny') {
      return { success: false, error: '命令执行已禁用' };
    }
    
    if (execPolicy.security === 'allowlist') {
      if (!isCommandAllowed(command, execPolicy.allowlist ?? [])) {
        return { 
          success: false, 
          error: `命令不在白名单中: ${command}\n白名单: ${execPolicy.allowlist?.join(', ') ?? '(空)'}` 
        };
      }
    }
    
    // 确定工作目录
    const workDir = cwd 
      ? resolve(context.workspace, cwd)
      : context.workspace;
    
    // 执行命令
    context.logger.info(`执行命令: ${command}`);
    
    const result = await runCommand(command, workDir, timeout);
    
    // 构建输出
    let output = '';
    if (result.stdout) {
      output += `STDOUT:\n${result.stdout}`;
    }
    if (result.stderr) {
      output += `${output ? '\n' : ''}STDERR:\n${result.stderr}`;
    }
    if (result.exitCode !== null) {
      output += `\n退出码: ${result.exitCode}`;
    }
    if (result.signal) {
      output += `\n信号: ${result.signal}`;
    }
    
    return {
      success: result.exitCode === 0,
      content: output || '(无输出)',
      metadata: {
        command,
        exitCode: result.exitCode,
        signal: result.signal,
      },
    };
  },
};