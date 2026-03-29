/**
 * 沙箱管理器
 * 
 * 负责 agent 的沙箱隔离和路径访问控制
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, normalize, basename } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import type { 
  SandboxConfig, 
  SandboxType,
  AllowedDir, 
  AccessRequest, 
  AccessResult,
  SandboxStatus,
  SandboxLogEntry 
} from './types.js';
import { 
  DEFAULT_SANDBOX_CONFIG, 
  DANGEROUS_PATHS, 
  SENSITIVE_PATTERNS 
} from './types.js';

// ============ 路径过滤器沙箱 ============

/**
 * 路径过滤器沙箱
 * 
 * 最基础的沙箱实现，通过路径白名单控制访问
 */
export class PathFilterSandbox {
  protected config: SandboxConfig;
  protected agentId: string;
  protected dataDir: string;
  protected logEntries: SandboxLogEntry[] = [];

  constructor(agentId: string, config: Partial<SandboxConfig> = {}) {
    this.agentId = agentId;
    this.dataDir = join(homedir(), '.securebot', 'sandboxes', agentId);
    
    // 合并默认配置
    this.config = {
      ...DEFAULT_SANDBOX_CONFIG,
      ...config,
      allowedDirs: config.allowedDirs || [],
      deniedDirs: [...(config.deniedDirs || []), ...DANGEROUS_PATHS],
    } as SandboxConfig;
    
    this.ensureDataDir();
    this.loadConfig();
  }

  /**
   * 确保数据目录存在
   */
  private ensureDataDir(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * 加载持久化配置
   */
  protected loadConfig(): void {
    const configPath = join(this.dataDir, 'config.json');
    if (existsSync(configPath)) {
      try {
        const saved = JSON.parse(readFileSync(configPath, 'utf-8'));
        this.config.allowedDirs = saved.allowedDirs || [];
      } catch {
        // 忽略错误
      }
    }
  }

  /**
   * 保存配置
   */
  protected saveConfig(): void {
    const configPath = join(this.dataDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      allowedDirs: this.config.allowedDirs,
    }, null, 2), 'utf-8');
  }

  /**
   * 记录日志
   */
  protected log(event: SandboxLogEntry['event'], path: string, details?: string): void {
    const entry: SandboxLogEntry = {
      timestamp: new Date().toISOString(),
      agentId: this.agentId,
      event,
      path,
      details,
    };
    this.logEntries.push(entry);
    
    // 同时输出到控制台（可配置）
    if (process.env.SANDBOX_DEBUG) {
      console.log(chalk.gray(`[SANDBOX] ${event} | ${path}`));
    }
  }

  /**
   * 规范化路径
   */
  protected normalizePath(path: string): string {
    // 解析相对路径和符号链接
    let normalized = resolve(path);
    
    // 防止路径遍历攻击
    normalized = normalize(normalized);
    
    return normalized;
  }

  /**
   * 检查路径是否匹配敏感模式
   */
  protected isSensitivePath(path: string): boolean {
    const name = basename(path);
    return SENSITIVE_PATTERNS.some(pattern => pattern.test(name));
  }

  /**
   * 检查路径是否在黑名单中
   */
  protected isDeniedPath(path: string): boolean {
    const normalized = this.normalizePath(path);
    
    for (const denied of this.config.deniedDirs) {
      if (normalized.startsWith(denied) || normalized === denied) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 检查路径是否在白名单中
   */
  protected isAllowedPath(path: string, mode: 'read' | 'write' = 'read'): boolean {
    const normalized = this.normalizePath(path);
    
    // 检查工作区（总是允许）
    if (normalized.startsWith(this.config.workspace)) {
      return true;
    }
    
    // 检查白名单
    for (const allowed of this.config.allowedDirs) {
      if (normalized.startsWith(allowed.path)) {
        // 检查权限模式
        if (mode === 'write' && allowed.mode === 'readonly') {
          return false;
        }
        return true;
      }
    }
    
    return false;
  }

  /**
   * 检查访问权限
   */
  checkAccess(request: AccessRequest): AccessResult {
    const { path, operation } = request;
    const normalized = this.normalizePath(path);
    
    // 1. 检查黑名单
    if (this.isDeniedPath(normalized)) {
      this.log('ACCESS_DENIED', normalized, '黑名单路径');
      return {
        allowed: false,
        reason: `路径 "${normalized}" 在安全黑名单中，访问被拒绝`,
      };
    }
    
    // 2. 检查敏感文件
    if (this.isSensitivePath(normalized)) {
      this.log('ACCESS_DENIED', normalized, '敏感文件');
      return {
        allowed: false,
        reason: `路径 "${normalized}" 匹配敏感文件模式，访问被拒绝`,
      };
    }
    
    // 3. 检查白名单
    const mode = operation === 'write' ? 'write' : 'read';
    if (this.isAllowedPath(normalized, mode)) {
      this.log('ACCESS_ALLOWED', normalized, operation);
      return {
        allowed: true,
        reason: '路径在允许列表中',
      };
    }
    
    // 4. 需要用户确认
    this.log('ACCESS_REQUEST', normalized, operation);
    return {
      allowed: false,
      reason: `路径 "${normalized}" 在工作区之外，需要用户授权`,
      requiresConfirmation: true,
    };
  }

  /**
   * 添加允许目录
   */
  allowDir(path: string, mode: 'readonly' | 'readwrite' = 'readwrite', reason?: string): void {
    const normalized = this.normalizePath(path);
    
    // 检查是否已存在
    const existing = this.config.allowedDirs.find(d => d.path === normalized);
    if (existing) {
      existing.mode = mode;
      existing.reason = reason;
    } else {
      this.config.allowedDirs.push({
        path: normalized,
        mode,
        authorizedAt: new Date().toISOString(),
        reason,
      });
    }
    
    this.saveConfig();
    this.log('USER_GRANTED', normalized, mode);
  }

  /**
   * 移除允许目录
   */
  denyDir(path: string): boolean {
    const normalized = this.normalizePath(path);
    const index = this.config.allowedDirs.findIndex(d => d.path === normalized);
    
    if (index >= 0) {
      this.config.allowedDirs.splice(index, 1);
      this.saveConfig();
      this.log('USER_DENIED', normalized);
      return true;
    }
    
    return false;
  }

  /**
   * 获取允许目录列表
   */
  getAllowedDirs(): AllowedDir[] {
    return [...this.config.allowedDirs];
  }

  /**
   * 获取工作区
   */
  getWorkspace(): string {
    return this.config.workspace;
  }

  /**
   * 获取沙箱状态
   */
  getStatus(): SandboxStatus {
    return {
      running: true,
      type: 'path-filter',
      startedAt: new Date().toISOString(),
    };
  }

  /**
   * 获取日志
   */
  getLogs(): SandboxLogEntry[] {
    return [...this.logEntries];
  }

  /**
   * 重置沙箱
   */
  reset(): void {
    this.config.allowedDirs = [];
    this.logEntries = [];
    this.saveConfig();
  }
}

// ============ 沙箱管理器 ============

/**
 * 全局沙箱实例缓存
 */
const sandboxInstances = new Map<string, PathFilterSandbox>();

/**
 * 获取或创建沙箱实例
 */
export function getSandbox(
  agentId: string, 
  workspace: string,
  config?: Partial<SandboxConfig>
): PathFilterSandbox {
  let sandbox = sandboxInstances.get(agentId);
  
  if (!sandbox) {
    sandbox = new PathFilterSandbox(agentId, {
      ...config,
      workspace,
    });
    sandboxInstances.set(agentId, sandbox);
  }
  
  return sandbox;
}

/**
 * 重置沙箱实例
 */
export function resetSandbox(agentId: string): void {
  const sandbox = sandboxInstances.get(agentId);
  if (sandbox) {
    sandbox.reset();
  }
  sandboxInstances.delete(agentId);
}

/**
 * 检查路径访问权限（便捷方法）
 */
export function checkPathAccess(
  agentId: string,
  path: string,
  operation: 'read' | 'write' | 'execute' = 'read'
): AccessResult {
  const sandbox = sandboxInstances.get(agentId);
  
  if (!sandbox) {
    return {
      allowed: false,
      reason: '沙箱未初始化',
    };
  }
  
  return sandbox.checkAccess({ path, operation });
}

// 导出类型
export * from './types.js';

// 导出 Docker 沙箱
export { 
  DockerSandbox, 
  getDockerSandbox, 
  initDockerSandboxEnvironment,
  listRunningContainers,
  stopAllContainers,
} from './docker.js';

// ============ 沙箱工厂 ============

/**
 * 创建沙箱实例（根据配置选择类型）
 */
export async function createSandbox(
  agentId: string,
  workspace: string,
  config?: Partial<SandboxConfig>
): Promise<PathFilterSandbox> {
  const sandboxType = config?.type ?? 'path-filter';
  
  if (sandboxType === 'docker') {
    const { getDockerSandbox } = await import('./docker.js');
    const dockerSandbox = await getDockerSandbox(agentId, workspace, config);
    
    if (dockerSandbox) {
      // 启动容器
      await dockerSandbox.start();
      return dockerSandbox;
    }
    
    // Docker 不可用，回退到路径过滤
    console.warn(chalk.yellow('Docker 不可用，使用路径过滤沙箱'));
  }
  
  // 默认使用路径过滤沙箱
  return getSandbox(agentId, workspace, config);
}