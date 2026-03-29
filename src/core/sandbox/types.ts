/**
 * 沙箱隔离系统类型定义
 */

/**
 * 沙箱类型
 */
export type SandboxType = 'docker' | 'bubblewrap' | 'path-filter';

/**
 * 访问模式
 */
export type AccessMode = 'readonly' | 'readwrite';

/**
 * 允许的目录配置
 */
export interface AllowedDir {
  /** 目录路径 */
  path: string;
  /** 访问模式 */
  mode: AccessMode;
  /** 授权时间 */
  authorizedAt: string;
  /** 授权原因 */
  reason?: string;
}

/**
 * 资源限制
 */
export interface ResourceLimits {
  /** 内存限制 (e.g., "512m", "1g") */
  memory?: string;
  /** CPU 核心数 */
  cpu?: number;
  /** 磁盘限制 */
  disk?: string;
}

/**
 * 网络配置
 */
export interface NetworkConfig {
  /** 是否启用网络 */
  enabled: boolean;
  /** 允许访问的主机 */
  allowedHosts?: string[];
}

/**
 * 沙箱配置
 */
export interface SandboxConfig {
  /** 沙箱类型 */
  type: SandboxType;
  /** 是否启用 */
  enabled: boolean;
  /** 工作区路径 */
  workspace: string;
  /** 允许访问的目录 */
  allowedDirs: AllowedDir[];
  /** 拒绝访问的目录（黑名单） */
  deniedDirs: string[];
  /** 资源限制 */
  resources?: ResourceLimits;
  /** 网络配置 */
  network?: NetworkConfig;
  /** 环境变量 */
  env?: Record<string, string>;
}

/**
 * 访问请求
 */
export interface AccessRequest {
  /** 请求的路径 */
  path: string;
  /** 请求的操作 */
  operation: 'read' | 'write' | 'execute';
  /** 请求原因 */
  reason?: string;
}

/**
 * 访问结果
 */
export interface AccessResult {
  /** 是否允许 */
  allowed: boolean;
  /** 原因 */
  reason: string;
  /** 是否需要用户确认 */
  requiresConfirmation?: boolean;
}

/**
 * 沙箱状态
 */
export interface SandboxStatus {
  /** 是否运行中 */
  running: boolean;
  /** 沙箱类型 */
  type: SandboxType;
  /** 容器/进程 ID */
  containerId?: string;
  /** 启动时间 */
  startedAt?: string;
  /** 资源使用 */
  resourceUsage?: {
    memory: number;
    cpu: number;
  };
}

/**
 * 沙箱日志条目
 */
export interface SandboxLogEntry {
  /** 时间戳 */
  timestamp: string;
  /** Agent ID */
  agentId: string;
  /** 事件类型 */
  event: 'ACCESS_ALLOWED' | 'ACCESS_DENIED' | 'ACCESS_REQUEST' | 'USER_GRANTED' | 'USER_DENIED';
  /** 路径 */
  path: string;
  /** 详情 */
  details?: string;
}

/**
 * 危险路径模式
 */
export const DANGEROUS_PATHS = [
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
  '/root',
  '/.ssh',
  '/.gnupg',
  '/.config/credentials',
  '/.aws/credentials',
  '/.docker/config.json',
  '/var/log',
  '/proc',
  '/sys',
  '/boot',
  '/dev',
];

/**
 * 敏感文件模式
 */
export const SENSITIVE_PATTERNS = [
  /\.env$/,
  /\.pem$/,
  /\.key$/,
  /\.crt$/,
  /credentials/i,
  /secret/i,
  /password/i,
  /token/i,
  /api[_-]?key/i,
];

/**
 * 默认沙箱配置
 */
export const DEFAULT_SANDBOX_CONFIG: Partial<SandboxConfig> = {
  type: 'path-filter',
  enabled: true,
  allowedDirs: [],
  deniedDirs: [...DANGEROUS_PATHS],
};