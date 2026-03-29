/**
 * 沙箱管理命令
 */

import chalk from 'chalk';
import {
  DockerSandbox,
  initDockerSandboxEnvironment,
  listRunningContainers,
  stopAllContainers,
  getSandbox,
} from '../../core/sandbox/index.js';

/**
 * 显示沙箱状态
 */
export async function showSandboxStatus(agentId?: string): Promise<void> {
  console.log();
  console.log(chalk.cyan('📦 沙箱状态'));
  console.log();
  
  // 检查 Docker 是否可用
  const dockerAvailable = await DockerSandbox.isDockerAvailable();
  
  if (dockerAvailable) {
    console.log(chalk.green('✓ Docker 可用'));
    
    // 检查增强版镜像是否存在
    const { execSync } = await import('node:child_process');
    try {
      execSync('docker image inspect securebot-sandbox:latest', { stdio: 'ignore' });
      console.log(chalk.green('✓ 增强版沙箱镜像: securebot-sandbox:latest'));
    } catch {
      console.log(chalk.gray('  默认镜像: python:3.11-slim (公开镜像，自动拉取)'));
      console.log(chalk.gray('  增强版镜像未构建，运行 `securebot sandbox init` 构建增强版'));
    }
  } else {
    console.log(chalk.yellow('✗ Docker 不可用'));
    console.log(chalk.gray('  当前使用路径过滤沙箱'));
  }
  
  console.log();
  
  // 列出运行中的容器
  if (dockerAvailable) {
    const containers = await listRunningContainers();
    
    if (containers.length === 0) {
      console.log(chalk.gray('没有运行中的沙箱容器'));
      console.log();
      console.log(chalk.gray('启动沙箱容器:'));
      console.log(chalk.gray('  securebot sandbox start <agent-id>'));
      console.log(chalk.gray('  或者在 chat 中自动启动'));
    } else {
      console.log(chalk.cyan('运行中的沙箱容器:'));
      console.log();
      
      for (const container of containers) {
        if (agentId && container.agentId !== agentId) continue;
        
        console.log(`  ${chalk.green('●')} ${container.agentId}`);
        console.log(chalk.gray(`    容器 ID: ${container.containerId}`));
        console.log(chalk.gray(`    状态: ${container.status}`));
        console.log();
      }
    }
  }
}

/**
 * 初始化沙箱环境
 */
export async function initSandbox(force: boolean = false): Promise<void> {
  console.log();
  console.log(chalk.cyan('🔧 初始化沙箱环境'));
  console.log();
  
  // 检查 Docker
  const dockerAvailable = await DockerSandbox.isDockerAvailable();
  
  if (!dockerAvailable) {
    console.log(chalk.yellow('Docker 未安装或未运行'));
    console.log();
    console.log(chalk.gray('请安装 Docker:'));
    console.log(chalk.gray('  macOS: https://docs.docker.com/desktop/install/mac-install/'));
    console.log(chalk.gray('  Linux: https://docs.docker.com/engine/install/'));
    console.log(chalk.gray('  Windows: https://docs.docker.com/desktop/install/windows-install/'));
    return;
  }
  
  console.log(chalk.green('✓ Docker 已安装'));
  console.log();
  
  // 构建沙箱镜像
  const success = await initDockerSandboxEnvironment(force);
  
  if (success) {
    console.log();
    console.log(chalk.green('✓ 沙箱环境初始化完成'));
    console.log();
    console.log(chalk.gray('现在可以在配置中启用 Docker 沙箱:'));
    console.log(chalk.gray('  { "sandbox": { "type": "docker", "enabled": true } }'));
  }
}

/**
 * 列出允许的目录
 */
export async function listAllowedDirs(agentId: string): Promise<void> {
  const sandbox = getSandbox(agentId, '');
  
  const dirs = sandbox.getAllowedDirs();
  
  console.log();
  console.log(chalk.cyan(`📁 Agent "${agentId}" 允许访问的目录:`));
  console.log();
  
  if (dirs.length === 0) {
    console.log(chalk.gray('  (无)'));
  } else {
    for (const dir of dirs) {
      const mode = dir.mode === 'readonly' 
        ? chalk.yellow('[只读]') 
        : chalk.green('[读写]');
      console.log(`  ${mode} ${dir.path}`);
      if (dir.reason) {
        console.log(chalk.gray(`         原因: ${dir.reason}`));
      }
    }
  }
  
  console.log();
}

/**
 * 添加允许目录
 */
export async function allowDir(
  agentId: string, 
  path: string, 
  readonly: boolean = false
): Promise<void> {
  const sandbox = getSandbox(agentId, '');
  
  const mode = readonly ? 'readonly' : 'readwrite';
  sandbox.allowDir(path, mode, 'CLI 命令添加');
  
  console.log();
  console.log(chalk.green(`✓ 已授权 Agent "${agentId}" 访问: ${path}`));
  console.log(chalk.gray(`  模式: ${readonly ? '只读' : '读写'}`));
  console.log();
}

/**
 * 移除允许目录
 */
export async function denyDir(agentId: string, path: string): Promise<void> {
  const sandbox = getSandbox(agentId, '');
  
  const removed = sandbox.denyDir(path);
  
  if (removed) {
    console.log();
    console.log(chalk.green(`✓ 已移除 Agent "${agentId}" 对 ${path} 的访问权限`));
    console.log();
  } else {
    console.log();
    console.log(chalk.yellow(`路径 ${path} 不在允许列表中`));
    console.log();
  }
}

/**
 * 重置沙箱
 */
export async function resetSandboxCmd(agentId: string): Promise<void> {
  const { resetSandbox } = await import('../../core/sandbox/index.js');
  resetSandbox(agentId);
  
  console.log();
  console.log(chalk.green(`✓ 已重置 Agent "${agentId}" 的沙箱配置`));
  console.log();
}

/**
 * 停止所有沙箱容器
 */
export async function stopAllSandoxContainers(): Promise<void> {
  console.log();
  console.log(chalk.cyan('停止所有沙箱容器...'));
  console.log();
  
  await stopAllContainers();
}

/**
 * 启动沙箱容器
 */
export async function startSandboxContainer(
  agentId: string, 
  workspace: string
): Promise<void> {
  console.log();
  console.log(chalk.cyan(`🚀 启动 Agent "${agentId}" 的沙箱容器`));
  console.log();
  
  // 检查 Docker
  const dockerAvailable = await DockerSandbox.isDockerAvailable();
  
  if (!dockerAvailable) {
    console.log(chalk.red('Docker 不可用，无法启动容器'));
    return;
  }
  
  const { getDockerSandbox } = await import('../../core/sandbox/index.js');
  const sandbox = await getDockerSandbox(agentId, workspace);
  
  if (!sandbox) {
    console.log(chalk.red('无法创建 Docker 沙箱'));
    return;
  }
  
  const started = await sandbox.start();
  
  if (started) {
    console.log(chalk.green(`✓ 沙箱容器已启动`));
    console.log(chalk.gray(`  Agent: ${agentId}`));
    console.log(chalk.gray(`  工作区: ${workspace}`));
    console.log(chalk.gray(`  容器内路径: /workspace`));
    console.log();
    console.log(chalk.gray('提示: 运行 `securebot sandbox shell <agent-id>` 进入容器'));
  } else {
    console.log(chalk.red('✗ 沙箱容器启动失败'));
  }
}

/**
 * 进入沙箱 shell
 */
export async function enterSandboxShell(agentId: string): Promise<void> {
  // 检查 Docker
  const dockerAvailable = await DockerSandbox.isDockerAvailable();
  
  if (!dockerAvailable) {
    console.log(chalk.red('Docker 不可用，无法进入容器'));
    return;
  }
  
  const { getDockerSandbox } = await import('../../core/sandbox/index.js');
  const sandbox = await getDockerSandbox(agentId, '');
  
  if (!sandbox) {
    console.log(chalk.red('无法创建 Docker 沙箱'));
    return;
  }
  
  await sandbox.shell();
}