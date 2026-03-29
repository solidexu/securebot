/**
 * Docker 容器沙箱
 * 
 * 提供强隔离的执行环境
 */

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import type { 
  SandboxConfig, 
  SandboxStatus, 
  ResourceLimits 
} from './types.js';
import { PathFilterSandbox } from './path-filter.js';

// ============ Docker 镜像配置 ============

/**
 * 默认沙箱镜像（使用公开镜像，无需构建）
 */
const SANDBOX_IMAGE = 'python:3.11-slim';

/**
 * 增强版沙箱镜像（需要用户构建，包含更多工具）
 */
const ENHANCED_SANDBOX_IMAGE = 'securebot-sandbox:latest';

/**
 * 基础镜像（用于构建增强版沙箱镜像）
 */
const BASE_IMAGE = 'python:3.11-slim';

/**
 * Dockerfile 模板
 */
const DOCKERFILE_TEMPLATE = `FROM ${BASE_IMAGE}

# 安装常用工具和开发环境
RUN apt-get update && apt-get install -y --no-install-recommends \\
    # 基础工具
    git \\
    curl \\
    wget \\
    vim \\
    jq \\
    tree \\
    htop \\
    netcat-openbsd \\
    openssh-client \\
    openssl \\
    # C/C++ 开发
    build-essential \\
    g++ \\
    gcc \\
    make \\
    cmake \\
    # Java 开发
    default-jdk \\
    maven \\
    # Go 开发
    golang-go \\
    # Rust 开发
    rustc \\
    cargo \\
    # 数据库客户端
    sqlite3 \\
    postgresql-client \\
    mariadb-client \\
    redis-tools \\
    && rm -rf /var/lib/apt/lists/*

# 安装 Node.js 20 (用于前端项目)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \\
    && apt-get install -y nodejs \\
    && rm -rf /var/lib/apt/lists/*

# 安装 pnpm 和 yarn
RUN npm install -g pnpm yarn

# 安装 uv (Python 包管理器)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# 设置 PATH 包含 uv
ENV PATH="/root/.local/bin:$PATH"

# 创建非 root 用户
RUN useradd -m -s /bin/bash securebot

# 设置工作目录
WORKDIR /workspace

# 设置环境变量
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 默认使用非 root 用户
USER securebot

CMD ["/bin/bash"]
`;

// ============ Docker 沙箱实现 ============

/**
 * Docker 容器沙箱
 */
export class DockerSandbox extends PathFilterSandbox {
  private containerId: string | null = null;
  private containerName: string;
  protected imageName: string;
  private resources: ResourceLimits;
  private networkEnabled: boolean;
  private envVars: Record<string, string>;
  private startedAt: string | null = null;

  constructor(agentId: string, config: Partial<SandboxConfig> = {}) {
    super(agentId, config);
    
    this.containerName = `securebot-${agentId}`;
    this.imageName = SANDBOX_IMAGE;  // 默认使用公开镜像
    this.resources = config.resources || {};
    this.networkEnabled = config.network?.enabled ?? true;
    this.envVars = config.env || {};
  }
  
  /**
   * 设置镜像名称
   */
  setImageName(name: string): void {
    this.imageName = name;
  }

  /**
   * ★ Override checkAccess：容器内路径先转换为外部路径再检查
   */
  checkAccess(request: import('./types.js').AccessRequest): import('./types.js').AccessResult {
    const { path, operation } = request;
    
    // ★ 如果路径是容器内路径，先转换为外部路径
    let hostPath = path;
    if (path.startsWith('/workspace')) {
      hostPath = this.mapFromContainer(path);
    }
    
    // 使用外部路径进行权限检查
    return super.checkAccess({ path: hostPath, operation });
  }

  /**
   * ★ 路径映射：将外部路径映射到容器内路径
   * 
   * 工作区 /disk0/.../py/ -> /workspace/
   */
  mapToContainer(hostPath: string): string {
    const workspace = this.getWorkspace();
    
    // 如果路径在工作区内，映射到 /workspace
    if (hostPath.startsWith(workspace)) {
      const relativePath = hostPath.slice(workspace.length);
      return `/workspace${relativePath}`;
    }
    
    // 检查允许的目录挂载
    for (const dir of this.getAllowedDirs()) {
      if (hostPath.startsWith(dir.path)) {
        const relativePath = hostPath.slice(dir.path.length);
        const mountPoint = dir.path.startsWith('/') ? dir.path : `/mnt${dir.path}`;
        return `${mountPoint}${relativePath}`;
      }
    }
    
    // 其他路径保持不变（会被拒绝）
    return hostPath;
  }

  /**
   * ★ 路径映射：将容器内路径映射回外部路径
   */
  mapFromContainer(containerPath: string): string {
    // /workspace/... -> 工作区路径
    if (containerPath.startsWith('/workspace')) {
      const relativePath = containerPath.slice('/workspace'.length);
      return `${this.getWorkspace()}${relativePath}`;
    }
    
    // 检查挂载点
    for (const dir of this.getAllowedDirs()) {
      const mountPoint = dir.path.startsWith('/') ? dir.path : `/mnt${dir.path}`;
      if (containerPath.startsWith(mountPoint)) {
        const relativePath = containerPath.slice(mountPoint.length);
        return `${dir.path}${relativePath}`;
      }
    }
    
    return containerPath;
  }

  /**
   * ★ 命令路径转换：将命令中的路径转换为容器内路径
   */
  translateCommand(command: string): string {
    const workspace = this.getWorkspace();
    
    // 替换工作区路径
    let translated = command.replace(
      new RegExp(workspace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      '/workspace'
    );
    
    // 替换允许的目录路径
    for (const dir of this.getAllowedDirs()) {
      const mountPoint = dir.path.startsWith('/') ? dir.path : `/mnt${dir.path}`;
      translated = translated.replace(
        new RegExp(dir.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        mountPoint
      );
    }
    
    return translated;
  }

  /**
   * 检查 Docker 是否可用
   */
  static async isDockerAvailable(): Promise<boolean> {
    try {
      execSync('docker --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 构建沙箱镜像（增强版）
   */
  static async buildImage(force: boolean = false): Promise<boolean> {
    try {
      // 检查镜像是否已存在
      if (!force) {
        try {
          execSync(`docker image inspect ${ENHANCED_SANDBOX_IMAGE}`, { stdio: 'ignore' });
          console.log(chalk.gray(`增强版沙箱镜像已存在: ${ENHANCED_SANDBOX_IMAGE}`));
          return true;
        } catch {
          // 镜像不存在，需要构建
        }
      }

      console.log(chalk.cyan('构建增强版沙箱镜像...'));
      console.log(chalk.gray('包含: Python 3.11, Node.js 20, uv, git, curl, wget, vim'));
      
      // 创建临时目录
      const tmpDir = join(homedir(), '.securebot', 'sandbox-image');
      if (!existsSync(tmpDir)) {
        mkdirSync(tmpDir, { recursive: true });
      }
      
      // 写入 Dockerfile
      const dockerfilePath = join(tmpDir, 'Dockerfile');
      writeFileSync(dockerfilePath, DOCKERFILE_TEMPLATE, 'utf-8');
      
      // 构建镜像
      execSync(`docker build -t ${ENHANCED_SANDBOX_IMAGE} ${tmpDir}`, {
        stdio: 'inherit',
      });
      
      console.log(chalk.green(`✓ 增强版沙箱镜像构建成功: ${ENHANCED_SANDBOX_IMAGE}`));
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`构建沙箱镜像失败: ${msg}`));
      return false;
    }
  }

  /**
   * 启动容器
   */
  async start(): Promise<boolean> {
    // ★ 如果 containerId 为空，先尝试通过容器名获取已存在的容器
    if (!this.containerId) {
      try {
        const existingId = execSync(
          `docker ps -aq --filter "name=^${this.containerName}$" --no-trunc`,
          { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
        ).trim();
        
        if (existingId) {
          this.containerId = existingId;
          console.log(chalk.gray(`发现已存在的容器: ${this.containerName}`));
        }
      } catch {
        // 忽略错误
      }
    }
    
    if (this.containerId) {
      // 容器已存在，检查是否运行中
      try {
        const status = execSync(`docker inspect --format='{{.State.Status}}' ${this.containerId}`, {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        
        if (status === 'running') {
          return true;
        }
        
        // 启动已停止的容器
        execSync(`docker start ${this.containerId}`, { stdio: 'ignore' });
        this.startedAt = new Date().toISOString();
        return true;
      } catch {
        // 容器不存在，重新创建
        this.containerId = null;
      }
    }

    try {
      // ★ 先检查镜像是否存在，不存在则拉取
      try {
        execSync(`docker image inspect ${this.imageName}`, { stdio: 'ignore' });
      } catch {
        // 镜像不存在，拉取
        console.log(chalk.gray(`拉取镜像: ${this.imageName}`));
        execSync(`docker pull ${this.imageName}`, { stdio: 'inherit' });
      }
      
      // 构建启动命令
      const args = ['run', '-d', '--name', this.containerName];
      
      // 挂载工作区
      args.push('-v', `${this.getWorkspace()}:/workspace`);
      
      // 挂载允许的目录（跳过已挂载的 /workspace）
      for (const dir of this.getAllowedDirs()) {
        // 跳过 /workspace，已经挂载过了
        if (dir.path === '/workspace' || dir.path === this.getWorkspace()) {
          continue;
        }
        const dest = dir.path.startsWith('/') ? dir.path : `/mnt${dir.path}`;
        const mountMode = dir.mode === 'readonly' ? ':ro' : '';
        args.push('-v', `${dir.path}:${dest}${mountMode}`);
      }
      
      // 资源限制
      if (this.resources.memory) {
        args.push('--memory', this.resources.memory);
      }
      if (this.resources.cpu) {
        args.push('--cpus', String(this.resources.cpu));
      }
      
      // 网络配置
      if (!this.networkEnabled) {
        args.push('--network', 'none');
      }
      
      // 环境变量
      for (const [key, value] of Object.entries(this.envVars)) {
        args.push('-e', `${key}=${value}`);
      }
      
      // 安全选项
      args.push('--security-opt', 'no-new-privileges');
      args.push('--cap-drop', 'ALL');
      
      // 镜像名称
      args.push(this.imageName);
      
      // ★ 保持容器运行的命令（使用 sleep infinity，slim 镜像都有）
      args.push('sleep', 'infinity');
      
      // 启动容器
      const output = execSync(`docker ${args.join(' ')}`, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      
      this.containerId = output;
      this.startedAt = new Date().toISOString();
      
      return true;
    } catch (error) {
      // 启动失败，打印错误信息
      const msg = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`沙箱容器启动失败: ${msg}`));
      return false;
    }
  }

  /**
   * 停止容器
   */
  async stop(): Promise<boolean> {
    if (!this.containerId) return true;
    
    try {
      execSync(`docker stop ${this.containerId}`, { stdio: 'ignore' });
      console.log(chalk.gray(`沙箱容器已停止: ${this.containerName}`));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 删除容器
   */
  async remove(): Promise<boolean> {
    if (!this.containerId) return true;
    
    try {
      execSync(`docker rm -f ${this.containerId}`, { stdio: 'ignore' });
      this.containerId = null;
      this.startedAt = null;
      console.log(chalk.gray(`沙箱容器已删除: ${this.containerName}`));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 在容器内执行命令
   */
  async exec(command: string, timeout: number = 30000): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    // 确保容器存在且正在运行
    if (!this.containerId) {
      const started = await this.start();
      if (!started) {
        return {
          stdout: '',
          stderr: '无法启动沙箱容器',
          exitCode: 1,
        };
      }
    } else {
      // 检查容器是否正在运行，如果不在运行则启动
      try {
        const status = execSync(
          `docker inspect --format='{{.State.Status}}' ${this.containerId}`,
          { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
        ).trim();
        
        if (status !== 'running') {
          // 容器不在运行，尝试启动
          execSync(`docker start ${this.containerId}`, { stdio: 'ignore' });
        }
      } catch {
        // 容器可能已被删除，重新创建
        this.containerId = null;
        const started = await this.start();
        if (!started) {
          return {
            stdout: '',
            stderr: '无法启动沙箱容器',
            exitCode: 1,
          };
        }
      }
    }
    
    return new Promise((resolve) => {
      // ★ 使用 bash 执行，支持 source 等 bash 内置命令
      const args = ['exec', this.containerId!, 'bash', '-c', command];
      const proc = spawn('docker', args);
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve({
          stdout,
          stderr: stderr + '\n命令执行超时',
          exitCode: -1,
        });
      }, timeout);
      
      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });
      
      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr: err.message,
          exitCode: 1,
        });
      });
    });
  }

  /**
   * 获取容器状态
   */
  override getStatus(): SandboxStatus {
    return {
      running: this.containerId !== null,
      type: 'docker',
      containerId: this.containerId ?? undefined,
      startedAt: this.startedAt ?? undefined,
    };
  }

  /**
   * 获取容器资源使用情况
   */
  async getResourceUsage(): Promise<{ memory: number; cpu: number } | null> {
    if (!this.containerId) return null;
    
    try {
      const output = execSync(
        `docker stats --no-stream --format '{{.MemPerc}},{{.CPUPerc}}' ${this.containerId}`,
        { encoding: 'utf-8' }
      ).trim();
      
      const [mem, cpu] = output.split(',');
      return {
        memory: parseFloat((mem || '0').replace('%', '')),
        cpu: parseFloat((cpu || '0').replace('%', '')),
      };
    } catch {
      return null;
    }
  }

  /**
   * 进入容器 shell
   */
  async shell(): Promise<void> {
    if (!this.containerId) {
      await this.start();
    }
    
    console.log(chalk.cyan(`进入沙箱容器: ${this.containerName}`));
    console.log(chalk.gray('输入 "exit" 退出容器'));
    console.log();
    
    execSync(`docker exec -it ${this.containerId} /bin/bash`, {
      stdio: 'inherit',
    });
  }
}

// ============ Docker 沙箱管理器 ============

/**
 * 检查增强版沙箱镜像是否存在
 */
async function isEnhancedImageAvailable(): Promise<boolean> {
  try {
    execSync(`docker image inspect ${ENHANCED_SANDBOX_IMAGE}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Docker 沙箱实例缓存
 */
const dockerSandboxInstances = new Map<string, DockerSandbox>();

/**
 * 获取或创建 Docker 沙箱实例
 */
export async function getDockerSandbox(
  agentId: string,
  workspace: string,
  config?: Partial<SandboxConfig>
): Promise<DockerSandbox | null> {
  // 检查 Docker 是否可用
  const available = await DockerSandbox.isDockerAvailable();
  if (!available) {
    return null;
  }
  
  // 选择镜像：优先使用增强版
  let imageName = SANDBOX_IMAGE;
  const enhancedAvailable = await isEnhancedImageAvailable();
  
  if (!enhancedAvailable) {
    // ★ 增强版镜像不存在，自动构建（首次运行）
    console.log(chalk.cyan('首次运行，正在构建增强版沙箱镜像...'));
    console.log(chalk.gray('包含: Python, Node.js, Java, Go, Rust, C++, 数据库客户端等'));
    const built = await DockerSandbox.buildImage(false);
    if (built) {
      imageName = ENHANCED_SANDBOX_IMAGE;
    }
  } else {
    imageName = ENHANCED_SANDBOX_IMAGE;
  }
  
  let sandbox = dockerSandboxInstances.get(agentId);
  
  if (!sandbox) {
    sandbox = new DockerSandbox(agentId, {
      ...config,
      workspace,
    });
    sandbox.setImageName(imageName);
    dockerSandboxInstances.set(agentId, sandbox);
  }
  
  return sandbox;
}

/**
 * 初始化 Docker 沙箱环境（构建镜像）
 */
export async function initDockerSandboxEnvironment(force: boolean = false): Promise<boolean> {
  const available = await DockerSandbox.isDockerAvailable();
  if (!available) {
    console.error(chalk.red('Docker 未安装或未运行'));
    console.log(chalk.gray('请安装 Docker: https://docs.docker.com/get-docker/'));
    return false;
  }
  
  return DockerSandbox.buildImage(force);
}

/**
 * 列出所有运行中的沙箱容器
 */
export async function listRunningContainers(): Promise<Array<{
  agentId: string;
  containerId: string;
  status: string;
  startedAt: string;
}>> {
  try {
    const output = execSync(
      'docker ps --filter "name=securebot-" --format "{{.Names}},{{.ID}},{{.Status}}"',
      { encoding: 'utf-8' }
    ).trim();
    
    if (!output) return [];
    
    return output.split('\n').map(line => {
      const [name, id, status] = line.split(',');
      return {
        agentId: (name || '').replace('securebot-', ''),
        containerId: id || '',
        status: status || '',
        startedAt: status || '',
      };
    });
  } catch {
    return [];
  }
}

/**
 * 停止所有沙箱容器
 */
export async function stopAllContainers(): Promise<void> {
  const containers = await listRunningContainers();
  for (const container of containers) {
    try {
      execSync(`docker stop ${container.containerId}`, { stdio: 'ignore' });
    } catch {
      // 忽略错误
    }
  }
  console.log(chalk.green(`✓ 已停止 ${containers.length} 个沙箱容器`));
}