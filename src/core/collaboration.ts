/**
 * Agent 协作系统
 * 
 * 支持 Agent 间消息传递、任务委派、共享工作空间
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';

// ============ 类型定义 ============

/**
 * Agent 消息
 */
export interface AgentMessage {
  /** 消息ID */
  id: string;
  /** 发送者 Agent ID */
  fromAgent: string;
  /** 接收者 Agent ID */
  toAgent: string;
  /** 消息类型 */
  type: 'request' | 'response' | 'notification' | 'delegation' | 'query';
  /** 消息内容 */
  content: string;
  /** 关联的任务ID */
  taskId?: string;
  /** 优先级 */
  priority: 'low' | 'normal' | 'high' | 'urgent';
  /** 状态 */
  status: 'pending' | 'delivered' | 'read' | 'processed' | 'failed';
  /** 创建时间 */
  createdAt: number;
  /** 处理时间 */
  processedAt?: number;
  /** 回复消息ID */
  replyTo?: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 任务委派请求
 */
export interface DelegationRequest {
  /** 委派ID */
  id: string;
  /** 委派者 Agent ID */
  delegator: string;
  /** 受托者 Agent ID */
  delegatee: string;
  /** 任务描述 */
  task: string;
  /** 任务上下文 */
  context?: string;
  /** 截止时间 */
  deadline?: number;
  /** 优先级 */
  priority: 'low' | 'normal' | 'high';
  /** 状态 */
  status: 'pending' | 'accepted' | 'rejected' | 'in_progress' | 'completed' | 'failed';
  /** 结果 */
  result?: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/**
 * 共享工作空间
 */
export interface SharedWorkspace {
  /** 工作空间ID */
  id: string;
  /** 名称 */
  name: string;
  /** 参与的 Agent 列表 */
  agents: string[];
  /** 权限设置 */
  permissions: Map<string, WorkspacePermission>;
  /** 共享文件路径 */
  sharedPath: string;
  /** 创建时间 */
  createdAt: number;
}

/**
 * 工作空间权限
 */
export interface WorkspacePermission {
  /** 可读 */
  read: boolean;
  /** 可写 */
  write: boolean;
  /** 可删除 */
  delete: boolean;
  /** 可委派 */
  delegate: boolean;
}

/**
 * Agent 协作配置
 */
export interface CollaborationConfig {
  /** 消息超时（毫秒） */
  messageTimeout: number;
  /** 最大委派深度 */
  maxDelegationDepth: number;
  /** 是否允许自动接受委派 */
  autoAcceptDelegation: boolean;
  /** 消息保留时间（毫秒） */
  messageRetention: number;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: CollaborationConfig = {
  messageTimeout: 30 * 60 * 1000, // 30 分钟
  maxDelegationDepth: 3,
  autoAcceptDelegation: false,
  messageRetention: 7 * 24 * 60 * 60 * 1000, // 7 天
};

// ============ Agent 消息总线 ============

/**
 * Agent 消息总线
 */
export class AgentMessageBus {
  private config: CollaborationConfig;
  private dataDir: string;
  private messageQueue: Map<string, AgentMessage[]> = new Map();
  private handlers: Map<string, (message: AgentMessage) => Promise<void>> = new Map();

  constructor(config: Partial<CollaborationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dataDir = join(homedir(), '.securebot', 'collaboration');
    this.ensureDataDir();
    this.loadMessages();
  }

  private ensureDataDir(): void {
    const dirs = ['messages', 'delegations', 'workspaces'];
    for (const dir of dirs) {
      const fullPath = join(this.dataDir, dir);
      if (!existsSync(fullPath)) {
        mkdirSync(fullPath, { recursive: true });
      }
    }
  }

  private loadMessages(): void {
    const messagesDir = join(this.dataDir, 'messages');
    if (!existsSync(messagesDir)) return;

    const files = readdirSync(messagesDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = readFileSync(join(messagesDir, file), 'utf-8');
        const message = JSON.parse(content) as AgentMessage;
        
        const agentQueue = this.messageQueue.get(message.toAgent) ?? [];
        if (message.status === 'pending' || message.status === 'delivered') {
          agentQueue.push(message);
          this.messageQueue.set(message.toAgent, agentQueue);
        }
      } catch {
        // 忽略错误
      }
    }
  }

  /**
   * 发送消息
   */
  async sendMessage(message: Omit<AgentMessage, 'id' | 'createdAt' | 'status'>): Promise<AgentMessage> {
    const fullMessage: AgentMessage = {
      ...message,
      id: uuidv4(),
      createdAt: Date.now(),
      status: 'pending',
    };

    // 保存到队列
    const agentQueue = this.messageQueue.get(message.toAgent) ?? [];
    agentQueue.push(fullMessage);
    this.messageQueue.set(message.toAgent, agentQueue);

    // 持久化
    await this.persistMessage(fullMessage);

    // 通知接收者
    const handler = this.handlers.get(message.toAgent);
    if (handler) {
      fullMessage.status = 'delivered';
      await handler(fullMessage);
    }

    return fullMessage;
  }

  /**
   * 注册消息处理器
   */
  registerHandler(agentId: string, handler: (message: AgentMessage) => Promise<void>): void {
    this.handlers.set(agentId, handler);
    
    // 处理队列中的待处理消息
    const queue = this.messageQueue.get(agentId) ?? [];
    for (const message of queue) {
      if (message.status === 'pending') {
        handler(message).catch(() => {
          message.status = 'failed';
        });
      }
    }
  }

  /**
   * 获取消息
   */
  getMessages(agentId: string, options?: {
    type?: AgentMessage['type'];
    status?: AgentMessage['status'];
    limit?: number;
  }): AgentMessage[] {
    let messages = this.messageQueue.get(agentId) ?? [];
    
    if (options?.type) {
      messages = messages.filter(m => m.type === options.type);
    }
    if (options?.status) {
      messages = messages.filter(m => m.status === options.status);
    }
    
    messages.sort((a, b) => b.createdAt - a.createdAt);
    
    if (options?.limit) {
      messages = messages.slice(0, options.limit);
    }
    
    return messages;
  }

  /**
   * 标记消息已读
   */
  markAsRead(messageId: string): void {
    for (const [_, queue] of this.messageQueue) {
      const message = queue.find(m => m.id === messageId);
      if (message) {
        message.status = 'read';
        this.persistMessage(message);
        break;
      }
    }
  }

  /**
   * 回复消息
   */
  async reply(
    originalMessage: AgentMessage,
    content: string,
    type: AgentMessage['type'] = 'response'
  ): Promise<AgentMessage> {
    return this.sendMessage({
      fromAgent: originalMessage.toAgent,
      toAgent: originalMessage.fromAgent,
      type,
      content,
      replyTo: originalMessage.id,
      taskId: originalMessage.taskId,
      priority: originalMessage.priority,
    });
  }

  /**
   * 持久化消息
   */
  private async persistMessage(message: AgentMessage): Promise<void> {
    const filePath = join(this.dataDir, 'messages', `${message.id}.json`);
    writeFileSync(filePath, JSON.stringify(message, null, 2), 'utf-8');
  }

  /**
   * 清理过期消息
   */
  cleanupExpired(): number {
    const now = Date.now();
    const cutoff = now - this.config.messageRetention;
    let cleaned = 0;

    for (const [agentId, queue] of this.messageQueue) {
      const filtered = queue.filter(m => m.createdAt > cutoff);
      if (filtered.length !== queue.length) {
        cleaned += queue.length - filtered.length;
        this.messageQueue.set(agentId, filtered);
      }
    }

    // 清理文件
    const messagesDir = join(this.dataDir, 'messages');
    if (existsSync(messagesDir)) {
      const files = readdirSync(messagesDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = readFileSync(join(messagesDir, file), 'utf-8');
          const message = JSON.parse(content) as AgentMessage;
          if (message.createdAt < cutoff) {
            unlinkSync(join(messagesDir, file));
          }
        } catch {
          // 忽略
        }
      }
    }

    return cleaned;
  }
}

// ============ 任务委派管理器 ============

/**
 * 任务委派管理器
 */
export class DelegationManager {
  private config: CollaborationConfig;
  private dataDir: string;
  private delegations: Map<string, DelegationRequest> = new Map();
  private handlers: Map<string, (request: DelegationRequest) => Promise<boolean>> = new Map();

  constructor(config: Partial<CollaborationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dataDir = join(homedir(), '.securebot', 'collaboration');
    this.loadDelegations();
  }

  private loadDelegations(): void {
    const delegationsDir = join(this.dataDir, 'delegations');
    if (!existsSync(delegationsDir)) return;

    const files = readdirSync(delegationsDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = readFileSync(join(delegationsDir, file), 'utf-8');
        const delegation = JSON.parse(content) as DelegationRequest;
        this.delegations.set(delegation.id, delegation);
      } catch {
        // 忽略
      }
    }
  }

  /**
   * 委派任务
   */
  async delegate(request: Omit<DelegationRequest, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<DelegationRequest> {
    // 检查委派深度
    const depth = await this.getDelegationDepth(request.delegator);
    if (depth >= this.config.maxDelegationDepth) {
      throw new Error(`委派深度超过限制 (${this.config.maxDelegationDepth})`);
    }

    const delegation: DelegationRequest = {
      ...request,
      id: uuidv4(),
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.delegations.set(delegation.id, delegation);
    await this.persistDelegation(delegation);

    // 通知受托者
    const handler = this.handlers.get(request.delegatee);
    if (handler) {
      const accepted = await handler(delegation);
      delegation.status = accepted ? 'accepted' : 'rejected';
      delegation.updatedAt = Date.now();
      await this.persistDelegation(delegation);
    }

    return delegation;
  }

  /**
   * 获取委派深度
   */
  private async getDelegationDepth(agentId: string): Promise<number> {
    let depth = 0;
    let current = agentId;

    // 追溯委派链
    for (const delegation of this.delegations.values()) {
      if (delegation.delegatee === current) {
        depth++;
        current = delegation.delegator;
        if (depth >= this.config.maxDelegationDepth) break;
      }
    }

    return depth;
  }

  /**
   * 注册委派处理器
   */
  registerHandler(agentId: string, handler: (request: DelegationRequest) => Promise<boolean>): void {
    this.handlers.set(agentId, handler);
  }

  /**
   * 接受委派
   */
  async acceptDelegation(delegationId: string): Promise<void> {
    const delegation = this.delegations.get(delegationId);
    if (!delegation) {
      throw new Error('委派不存在');
    }

    delegation.status = 'accepted';
    delegation.updatedAt = Date.now();
    await this.persistDelegation(delegation);
  }

  /**
   * 拒绝委派
   */
  async rejectDelegation(delegationId: string, reason?: string): Promise<void> {
    const delegation = this.delegations.get(delegationId);
    if (!delegation) {
      throw new Error('委派不存在');
    }

    delegation.status = 'rejected';
    delegation.result = reason;
    delegation.updatedAt = Date.now();
    await this.persistDelegation(delegation);
  }

  /**
   * 完成委派
   */
  async completeDelegation(delegationId: string, result: string): Promise<void> {
    const delegation = this.delegations.get(delegationId);
    if (!delegation) {
      throw new Error('委派不存在');
    }

    delegation.status = 'completed';
    delegation.result = result;
    delegation.updatedAt = Date.now();
    await this.persistDelegation(delegation);
  }

  /**
   * 获取委派
   */
  getDelegation(delegationId: string): DelegationRequest | undefined {
    return this.delegations.get(delegationId);
  }

  /**
   * 获取 Agent 的委派列表
   */
  getDelegations(agentId: string, role?: 'delegator' | 'delegatee'): DelegationRequest[] {
    return Array.from(this.delegations.values())
      .filter(d => {
        if (role === 'delegator') return d.delegator === agentId;
        if (role === 'delegatee') return d.delegatee === agentId;
        return d.delegator === agentId || d.delegatee === agentId;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 持久化委派
   */
  private async persistDelegation(delegation: DelegationRequest): Promise<void> {
    const filePath = join(this.dataDir, 'delegations', `${delegation.id}.json`);
    writeFileSync(filePath, JSON.stringify(delegation, null, 2), 'utf-8');
  }
}

// ============ 共享工作空间管理器 ============

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
        // 转换 permissions
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

    // 默认权限
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

    // 创建物理目录
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

    // 删除物理目录
    if (existsSync(workspace.sharedPath)) {
      // 递归删除
      const { rmSync } = await import('node:fs');
      rmSync(workspace.sharedPath, { recursive: true, force: true });
    }

    // 删除配置文件
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
}

// ============ 协作管理器（统一入口） ============

/**
 * Agent 协作管理器
 */
export class CollaborationManager {
  private messageBus: AgentMessageBus;
  private delegationManager: DelegationManager;
  private workspaceManager: SharedWorkspaceManager;
  private config: CollaborationConfig;

  constructor(config: Partial<CollaborationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.messageBus = new AgentMessageBus(this.config);
    this.delegationManager = new DelegationManager(this.config);
    this.workspaceManager = new SharedWorkspaceManager();
  }

  /**
   * 获取消息总线
   */
  getMessageBus(): AgentMessageBus {
    return this.messageBus;
  }

  /**
   * 获取委派管理器
   */
  getDelegationManager(): DelegationManager {
    return this.delegationManager;
  }

  /**
   * 获取工作空间管理器
   */
  getWorkspaceManager(): SharedWorkspaceManager {
    return this.workspaceManager;
  }

  /**
   * 向其他 Agent 发送请求
   */
  async request(
    fromAgent: string,
    toAgent: string,
    content: string,
    options?: {
      taskId?: string;
      priority?: AgentMessage['priority'];
      timeout?: number;
    }
  ): Promise<AgentMessage> {
    return this.messageBus.sendMessage({
      fromAgent,
      toAgent,
      type: 'request',
      content,
      taskId: options?.taskId,
      priority: options?.priority ?? 'normal',
    });
  }

  /**
   * 委派任务给其他 Agent
   */
  async delegateTask(
    delegator: string,
    delegatee: string,
    task: string,
    options?: {
      context?: string;
      deadline?: number;
      priority?: 'low' | 'normal' | 'high';
    }
  ): Promise<DelegationRequest> {
    return this.delegationManager.delegate({
      delegator,
      delegatee,
      task,
      context: options?.context,
      deadline: options?.deadline,
      priority: options?.priority ?? 'normal',
    });
  }

  /**
   * 创建共享工作空间
   */
  async createSharedWorkspace(
    name: string,
    agents: string[]
  ): Promise<SharedWorkspace> {
    return this.workspaceManager.createWorkspace(name, agents);
  }

  /**
   * 获取协作统计
   */
  getStats(agentId?: string): {
    pendingMessages: number;
    activeDelegations: number;
    sharedWorkspaces: number;
  } {
    let pendingMessages = 0;
    let activeDelegations = 0;
    let sharedWorkspaces = 0;

    if (agentId) {
      pendingMessages = this.messageBus.getMessages(agentId, { status: 'pending' }).length;
      activeDelegations = this.delegationManager.getDelegations(agentId)
        .filter(d => d.status === 'in_progress' || d.status === 'accepted').length;
      sharedWorkspaces = this.workspaceManager.getAgentWorkspaces(agentId).length;
    } else {
      for (const queue of (this.messageBus as any).messageQueue.values()) {
        pendingMessages += queue.filter((m: AgentMessage) => m.status === 'pending').length;
      }
      activeDelegations = Array.from(this.delegationManager.getDelegations(''))
        .filter(d => d.status === 'in_progress').length;
      sharedWorkspaces = (this.workspaceManager as any).workspaces.size;
    }

    return { pendingMessages, activeDelegations, sharedWorkspaces };
  }
}

// ============ 全局实例 ============

let globalCollaborationManager: CollaborationManager | null = null;

export function getCollaborationManager(config?: Partial<CollaborationConfig>): CollaborationManager {
  if (!globalCollaborationManager) {
    globalCollaborationManager = new CollaborationManager(config);
  }
  return globalCollaborationManager;
}

export function resetCollaborationManager(): void {
  globalCollaborationManager = null;
}