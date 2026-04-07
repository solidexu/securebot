/**
 * 共享工作空间管理器
 * 
 * 提供 Agent 间共享工作空间的管理功能
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { WorkspacePermission } from './workspace-types.js';

/**
 * 共享工作空间
 */
export interface SharedWorkspace {
  id: string;
  name: string;
  agents: string[];
  permissions: Map<string, WorkspacePermission>;
  sharedPath: string;
  createdAt: number;
}

/**
 * 共享工作空间管理器
 */
export class SharedWorkspaceManager {
  private dataDir: string;
  private workspaces: Map<string, SharedWorkspace> = new Map();

  constructor() {
    this.dataDir = join(homedir(), '.securebot', 'collaboration', 'workspaces');
    this.loadWorkspaces();
  }

  private loadWorkspaces(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
      return;
    }

    const files = readdirSync(this.dataDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = readFileSync(join(this.dataDir, file), 'utf-8');
        const ws = JSON.parse(content) as SharedWorkspace;
        ws.permissions = new Map(Object.entries(ws.permissions as unknown as Record<string, WorkspacePermission>));
        this.workspaces.set(ws.id, ws);
      } catch {
        // 忽略
      }
    }
  }

  /**
   * 创建共享工作空间
   */
  async createWorkspace(
    name: string,
    agents: string[],
    permissions?: Map<string, WorkspacePermission>
  ): Promise<SharedWorkspace> {
    const id = uuidv4();
    const sharedPath = join(this.dataDir, id);

    const defaultPermission: WorkspacePermission = {
      read: true,
      write: true,
      delete: false,
      delegate: false,
    };

    const wsPermissions = permissions ?? new Map<string, WorkspacePermission>();
    for (const agentId of agents) {
      if (!wsPermissions.has(agentId)) {
        wsPermissions.set(agentId, { ...defaultPermission });
      }
    }

    const workspace: SharedWorkspace = {
      id,
      name,
      agents,
      permissions: wsPermissions,
      sharedPath,
      createdAt: Date.now(),
    };

    if (!existsSync(sharedPath)) {
      mkdirSync(sharedPath, { recursive: true });
    }

    this.workspaces.set(id, workspace);
    await this.persistWorkspace(workspace);

    return workspace;
  }

  /**
   * 获取工作空间
   */
  getWorkspace(workspaceId: string): SharedWorkspace | undefined {
    return this.workspaces.get(workspaceId);
  }

  /**
   * 获取 Agent 可访问的工作空间
   */
  getAgentWorkspaces(agentId: string): SharedWorkspace[] {
    return Array.from(this.workspaces.values())
      .filter(ws => ws.agents.includes(agentId));
  }

  /**
   * 检查权限
   */
  checkPermission(workspaceId: string, agentId: string, action: keyof WorkspacePermission): boolean {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;
    
    const permission = workspace.permissions.get(agentId);
    return permission?.[action] ?? false;
  }

  /**
   * 更新权限
   */
  async updatePermission(
    workspaceId: string,
    agentId: string,
    permission: Partial<WorkspacePermission>
  ): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error('工作空间不存在');
    }

    const current = workspace.permissions.get(agentId) ?? {
      read: false,
      write: false,
      delete: false,
      delegate: false,
    };

    workspace.permissions.set(agentId, { ...current, ...permission });
    await this.persistWorkspace(workspace);
  }

  /**
   * 添加 Agent 到工作空间
   */
  async addAgent(workspaceId: string, agentId: string, permission?: WorkspacePermission): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error('工作空间不存在');
    }

    if (!workspace.agents.includes(agentId)) {
      workspace.agents.push(agentId);
    }

    const defaultPermission: WorkspacePermission = {
      read: true,
      write: true,
      delete: false,
      delegate: false,
    };
    workspace.permissions.set(agentId, permission ?? defaultPermission);
    
    await this.persistWorkspace(workspace);
  }

  /**
   * 移除 Agent
   */
  async removeAgent(workspaceId: string, agentId: string): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error('工作空间不存在');
    }

    workspace.agents = workspace.agents.filter(id => id !== agentId);
    workspace.permissions.delete(agentId);
    
    await this.persistWorkspace(workspace);
  }

  /**
   * 删除工作空间
   */
  async deleteWorkspace(workspaceId: string): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return;

    if (existsSync(workspace.sharedPath)) {
      const { rmSync } = await import('node:fs');
      rmSync(workspace.sharedPath, { recursive: true, force: true });
    }

    const filePath = join(this.dataDir, `${workspaceId}.json`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }

    this.workspaces.delete(workspaceId);
  }

  /**
   * 持久化工作空间
   */
  private async persistWorkspace(workspace: SharedWorkspace): Promise<void> {
    const filePath = join(this.dataDir, `${workspace.id}.json`);
    const data = {
      ...workspace,
      permissions: Object.fromEntries(workspace.permissions),
    };
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * 获取工作空间总数（用于统计）
   */
  getWorkspaceCount(): number {
    return this.workspaces.size;
  }
}