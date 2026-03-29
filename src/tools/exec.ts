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

// ============ 危险命令检测 ============

/**
 * 危险命令模式
 */
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//,           // rm -rf /
  /rm\s+-rf\s+~/,           // rm -rf ~
  /:\(\)\s*\{\s*:\|:&\s*\}/, // fork bomb
  /mkfs/,                    // 格式化
  /dd\s+if=.*of=\/dev/,      // dd 写设备
  />\s*\/dev\/sd/,           // 写磁盘
  /chmod\s+000/,             // 私有化
  /chown\s+.*:.*\//,         // 修改所有者
];

/**
 * 检查是否是危险命令
 */
function isDangerousCommand(command: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(command));
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
    
    // ★ 危险命令检测
    if (isDangerousCommand(command)) {
      return { 
        success: false, 
        error: `🚨 检测到危险命令，已被沙箱拒绝:\n${command}\n\n此命令可能对系统造成不可逆的损害。` 
      };
    }
    
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
    
    // ★ 沙箱检查工作目录
    if (context.sandbox) {
      const sandboxResult = context.sandbox.checkAccess({ 
        path: workDir, 
        operation: 'execute' 
      });
      
      if (!sandboxResult.allowed && !sandboxResult.requiresConfirmation) {
        return {
          success: false,
          error: `沙箱拒绝访问工作目录: ${workDir}\n原因: ${sandboxResult.reason}`,
        };
      }
      
      if (sandboxResult.requiresConfirmation && context.requestSandboxAuth) {
        const granted = await context.requestSandboxAuth(workDir, 'write');
        if (!granted) {
          return {
            success: false,
            error: `沙箱拒绝访问: 用户拒绝授权 ${workDir}`,
          };
        }
        context.sandbox.allowDir(workDir, 'readwrite', '用户授权');
      }
    }
    
    // 执行命令
    context.logger.info(`执行命令: ${command}`);
    
    // ★ 检查是否使用 Docker 沙箱
    const sandboxStatus = context.sandbox?.getStatus();
    if (sandboxStatus?.type === 'docker') {
      // ★ Docker 沙箱：在容器内执行
      const { DockerSandbox } = await import('../core/sandbox/docker.js');
      const dockerSandbox = context.sandbox as unknown as DockerSandbox;
      
      // ★ 转换命令中的路径
      const translatedCommand = dockerSandbox.translateCommand(command);
      
      // ★ 转换工作目录
      let containerWorkDir = '/workspace';
      if (cwd) {
        containerWorkDir = dockerSandbox.mapToContainer(resolve(context.workspace, cwd));
      }
      
      // 在容器内执行命令
      const result = await dockerSandbox.exec(`cd ${containerWorkDir} && ${translatedCommand}`, timeout);
      
      let output = '';
      if (result.stdout) {
        output += `STDOUT:\n${result.stdout}`;
      }
      if (result.stderr) {
        output += `${output ? '\n' : ''}STDERR:\n${result.stderr}`;
      }
      
      if (result.exitCode !== 0) {
        const errorMsg = result.stderr || result.stdout || '命令执行失败';
        return {
          success: false,
          error: errorMsg,
          content: output,
          metadata: {
            command,
            translatedCommand,
            exitCode: result.exitCode,
            sandbox: 'docker',
          },
        };
      }
      
      if (result.exitCode !== null) {
        output += `\n退出码: ${result.exitCode}`;
      }
      
      return {
        success: true,
        content: output || '(无输出)',
        metadata: {
          command,
          translatedCommand,
          exitCode: result.exitCode,
          sandbox: 'docker',
        },
      };
    }
    
    // ★ 主机执行命令
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