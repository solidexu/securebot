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
    const profile = context.agent.tools?.profile;
    const execPolicy: ExecPolicy = {
      security: policy?.security ?? 'allowlist',
      ask: policy?.ask ?? 'always',
      allowlist: policy?.allowlist ?? [],
    };
    
    // 安全检查
    if (execPolicy.security === 'deny') {
      return { success: false, error: '命令执行已禁用' };
    }
    
    // 检查 deny 列表
    const denyList = context.agent.tools?.deny ?? [];
    for (const pattern of denyList) {
      if (command.includes(pattern) || command.startsWith(pattern)) {
        return { success: false, error: `命令被禁止: ${pattern}` };
      }
    }
    
    // 对于 coding/full 权限的 Agent，允许执行任何命令（外层确认管理器已处理确认）
    if (profile !== 'coding' && profile !== 'full') {
      // 非开发权限，检查白名单
      if (execPolicy.security === 'allowlist') {
        if (!isCommandAllowed(command, execPolicy.allowlist ?? [])) {
          return { 
            success: false, 
            error: `命令不在白名单中: ${command}\n白名单: ${execPolicy.allowlist?.join(', ') ?? '(空)'}\n提示: 使用 coding 权限的 Agent 可以执行更多命令` 
          };
        }
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
    
    // 错误情况下的详细信息
    if (result.exitCode !== 0) {
      const errorMsg = result.stderr || result.stdout || '命令执行失败';
      return {
        success: false,
        error: errorMsg,
        content: output,
        metadata: {
          command,
          exitCode: result.exitCode,
          signal: result.signal,
        },
      };
    }
    
    // 成功情况
    if (result.exitCode !== null) {
      output += `\n退出码: ${result.exitCode}`;
    }
    
    return {
      success: true,
      content: output || '(无输出)',
      metadata: {
        command,
        exitCode: result.exitCode,
        signal: result.signal,
      },
    };
  },
};