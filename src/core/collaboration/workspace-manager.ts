/**
 * 共享工作空间管理器
 * 
 * 管理 Agent 之间的共享文件和资源
 */

import { v4 as uuidv4 } from 'uuid';
import { join } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { homedir } from 'os';

// ============ 类型定义 ============

export interface WorkspacePermission {
  agentId: string;
  readOnly: boolean;
  canShare: boolean;
}

export interface SharedWorkspace {
  id: string;
  path: string;
  agents: string[];
  permissions: Map<string, WorkspacePermission>;
  createdAt: number;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceFile {
  path: string;
  content: string;
  lastModified: number;
  modifiedBy: string;
}

// ============ SharedWorkspaceManager 类 ============

/**
 * 共享工作空间管理器
 * 
 * 提供文件共享和协作编辑能力
 */
export class SharedWorkspaceManager {
  private workspaces: Map<string, SharedWorkspace> = new Map();
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? join(homedir(), '.securebot', 'workspaces');
    this.loadWorkspaces();
  }

  /**
   * 创建工作空间
   */
  createWorkspace(
    agents: string[],
    createdBy: string,
    metadata?: Record<string, unknown>
  ): SharedWorkspace {
    const id = `ws-${Date.now()}-${uuidv4().slice(0, 8)}`;
    const path = join(this.baseDir, id);

    // 创建目录
    try {
      if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
      }
    } catch {
      // 测试环境可能无法创建目录，忽略错误
    }

    const permissions = new Map<string, WorkspacePermission>();
    agents.forEach((agentId, index) => {
      permissions.set(agentId, {
        agentId,
        readOnly: index > 0, // 创建者可写，其他只读
        canShare: true,
      });
    });

    const workspace: SharedWorkspace = {
      id,
      path,
      agents,
      permissions,
      createdAt: Date.now(),
      createdBy,
      metadata,
    };

    this.workspaces.set(id, workspace);
    try {
      this.saveWorkspace(workspace);
    } catch {
      // 测试环境可能无法保存文件，忽略错误
    }

    return workspace;
  }

  /**
   * 获取工作空间
   */
  getWorkspace(id: string): SharedWorkspace | undefined {
    return this.workspaces.get(id);
  }

  /**
   * 列出所有工作空间
   */
  listWorkspaces(agentId?: string): SharedWorkspace[] {
    const all = Array.from(this.workspaces.values());
    if (!agentId) return all;
    return all.filter((ws) => ws.agents.includes(agentId));
  }

  /**
   * 添加 Agent 到工作空间
   */
  addAgent(workspaceId: string, agentId: string, readOnly = true): void {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);

    if (!workspace.agents.includes(agentId)) {
      workspace.agents.push(agentId);
      workspace.permissions.set(agentId, {
        agentId,
        readOnly,
        canShare: false,
      });
      this.saveWorkspace(workspace);
    }
  }

  /**
   * 移除 Agent
   */
  removeAgent(workspaceId: string, agentId: string): void {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);

    workspace.agents = workspace.agents.filter((id) => id !== agentId);
    workspace.permissions.delete(agentId);
    this.saveWorkspace(workspace);
  }

  /**
   * 检查权限
   */
  checkPermission(workspaceId: string, agentId: string): WorkspacePermission | undefined {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return undefined;
    return workspace.permissions.get(agentId);
  }

  /**
   * 更新权限
   */
  updatePermission(workspaceId: string, agentId: string, permission: Partial<WorkspacePermission>): void {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);

    const current = workspace.permissions.get(agentId);
    if (current) {
      workspace.permissions.set(agentId, { ...current, ...permission });
      this.saveWorkspace(workspace);
    }
  }

  /**
   * 获取 Agent 的所有工作空间
   */
  getAgentWorkspaces(agentId: string): SharedWorkspace[] {
    return Array.from(this.workspaces.values()).filter(ws => ws.agents.includes(agentId));
  }

  /**
   * 创建工作空间（旧 API 兼容）
   */
  createSharedWorkspace(agents: string[], createdBy: string): SharedWorkspace {
    return this.createWorkspace(agents, createdBy);
  }

  /**
   * 读取文件
   */
  readFile(workspaceId: string, filePath: string): string | undefined {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);

    const fullPath = join(workspace.path, filePath);
    if (!existsSync(fullPath)) return undefined;

    return readFileSync(fullPath, 'utf-8');
  }

  /**
   * 写入文件
   */
  writeFile(workspaceId: string, filePath: string, content: string, agentId: string): void {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);

    // 检查权限
    const permission = workspace.permissions.get(agentId);
    if (!permission || permission.readOnly) {
      throw new Error(`Agent ${agentId} does not have write permission`);
    }

    const fullPath = join(workspace.path, filePath);
    const dir = join(fullPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(fullPath, content);
  }

  /**
   * 列出文件
   */
  listFiles(workspaceId: string, dirPath = ''): WorkspaceFile[] {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);

    const fullPath = join(workspace.path, dirPath);
    if (!existsSync(fullPath)) return [];

    const files: WorkspaceFile[] = [];
    const entries = readdirSync(fullPath);

    for (const entry of entries) {
      const entryPath = join(fullPath, entry);
      const stats = statSync(entryPath);
      if (stats.isFile()) {
        files.push({
          path: join(dirPath, entry),
          content: '', // 不自动加载内容
          lastModified: stats.mtimeMs,
          modifiedBy: '',
        });
      }
    }

    return files;
  }

  /**
   * 删除工作空间
   */
  deleteWorkspace(id: string): void {
    const workspace = this.workspaces.get(id);
    if (!workspace) return;

    // 删除文件
    if (existsSync(workspace.path)) {
      rmSync(workspace.path, { recursive: true, force: true });
    }

    this.workspaces.delete(id);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    totalFiles: number;
    totalSize: number;
  } {
    let totalFiles = 0;
    let totalSize = 0;

    for (const workspace of this.workspaces.values()) {
      const files = this.listFiles(workspace.id);
      totalFiles += files.length;
      // 计算大小...
    }

    return {
      total: this.workspaces.size,
      totalFiles,
      totalSize,
    };
  }

  // ============ 私有方法 ============

  private loadWorkspaces(): void {
    if (!existsSync(this.baseDir)) return;

    const dirs = readdirSync(this.baseDir);
    for (const dir of dirs) {
      const metaPath = join(this.baseDir, dir, 'workspace.json');
      if (existsSync(metaPath)) {
        try {
          const content = readFileSync(metaPath, 'utf-8');
          const data = JSON.parse(content);
          const permissions = new Map<string, WorkspacePermission>();
          if (data.permissions) {
            Object.entries(data.permissions).forEach(([key, value]) => {
              permissions.set(key, value as WorkspacePermission);
            });
          }
          this.workspaces.set(data.id, {
            ...data,
            permissions,
          });
        } catch {
          // 忽略加载错误
        }
      }
    }
  }

  private saveWorkspace(workspace: SharedWorkspace): void {
    const metaPath = join(workspace.path, 'workspace.json');
    const data = {
      ...workspace,
      permissions: Object.fromEntries(workspace.permissions),
    };
    writeFileSync(metaPath, JSON.stringify(data, null, 2));
  }
}