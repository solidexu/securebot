/**
 * 协作管理器
 * 
 * 统一管理消息总线、委派管理器和工作空间管理器
 */

import { AgentMessageBus, type AgentMessage } from './message-bus.js';
import {
  DelegationManager,
  type DelegationRequest,
  type DelegationStatus,
  type ExecutionRecord,
  type ReviewRecord,
  type ConversationMessage,
  type CollaborationConfig,
} from './delegation-manager.js';
import {
  SharedWorkspaceManager,
  type SharedWorkspace,
  type WorkspacePermission,
  type WorkspaceFile,
} from './workspace-manager.js';

// ============ 类型重导出 ============

export type {
  AgentMessage,
  DelegationRequest,
  DelegationStatus,
  ExecutionRecord,
  ReviewRecord,
  ConversationMessage,
  SharedWorkspace,
  WorkspacePermission,
  WorkspaceFile,
  CollaborationConfig,
};

// ============ CollaborationManager 类 ============

/**
 * 协作管理器
 * 
 * 提供 Agent 协作的统一入口
 */
export class CollaborationManager {
  private messageBus: AgentMessageBus;
  private delegationManager: DelegationManager;
  private workspaceManager: SharedWorkspaceManager;
  private config: Required<CollaborationConfig>;

  constructor(config: Partial<CollaborationConfig> = {}, rootDir?: string) {
    this.config = {
      messageTimeout: 60000,
      maxDelegationDepth: 3,
      autoAcceptDelegation: false,
      messageRetention: 7 * 24 * 60 * 60 * 1000,
      maxConcurrentDelegations: 10,
      defaultMaxRounds: 5,
      ...config,
    };

    this.messageBus = new AgentMessageBus();
    this.delegationManager = new DelegationManager(config, rootDir);
    this.workspaceManager = new SharedWorkspaceManager(rootDir);
  }

  // ============ 消息相关 ============

  /**
   * 发送消息
   */
  async sendMessage(
    fromAgent: string,
    toAgent: string,
    content: string,
    options?: {
      type?: AgentMessage['type'];
      priority?: AgentMessage['priority'];
      taskId?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<string> {
    return this.messageBus.sendMessage({
      fromAgent,
      toAgent,
      content,
      type: options?.type ?? 'notification',
      priority: options?.priority ?? 'normal',
      taskId: options?.taskId,
      metadata: options?.metadata,
    });
  }

  /**
   * 获取消息
   */
  getMessages(agentId: string): AgentMessage[] {
    return this.messageBus.getMessages(agentId);
  }

  /**
   * 获取未读消息
   */
  getUnreadMessages(agentId: string): AgentMessage[] {
    return this.messageBus.getUnreadMessages(agentId);
  }

  /**
   * 订阅消息
   */
  subscribeToMessages(
    agentId: string,
    callback: (message: AgentMessage) => void
  ): () => void {
    return this.messageBus.subscribe(agentId, callback);
  }

  /**
   * 获取消息总线
   */
  getMessageBus(): AgentMessageBus {
    return this.messageBus;
  }

  // ============ 委派相关 ============

  /**
   * 创建委派
   */
  async createDelegation(
    delegator: string,
    delegatee: string,
    task: string,
    options?: {
      priority?: DelegationRequest['priority'];
      context?: string;
      acceptanceCriteria?: string[];
      expectedDeliverables?: string[];
      maxRounds?: number;
      deadline?: number;
    }
  ): Promise<string> {
    return this.delegationManager.createDelegation({
      delegator,
      delegatee,
      task,
      priority: options?.priority ?? 'normal',
      context: options?.context,
      acceptanceCriteria: options?.acceptanceCriteria ?? [],
      expectedDeliverables: options?.expectedDeliverables ?? [],
      maxRounds: options?.maxRounds ?? this.config.defaultMaxRounds,
      deadline: options?.deadline,
    });
  }

  /**
   * 获取委派
   */
  getDelegation(id: string): DelegationRequest | undefined {
    return this.delegationManager.getDelegation(id);
  }

  /**
   * 获取待处理委派
   */
  getPendingDelegations(agentId: string): DelegationRequest[] {
    return this.delegationManager.getPendingDelegations(agentId);
  }

  /**
   * 获取 Agent 的所有委派
   */
  getAgentDelegations(agentId: string): DelegationRequest[] {
    return this.delegationManager.getAgentDelegations(agentId);
  }

  /**
   * 接受委派
   */
  async acceptDelegation(id: string): Promise<void> {
    return this.delegationManager.acceptDelegation(id);
  }

  /**
   * 拒绝委派
   */
  async rejectDelegation(id: string, reason?: string): Promise<void> {
    return this.delegationManager.rejectDelegation(id, reason);
  }

  /**
   * 完成委派
   */
  async completeDelegation(id: string, result: string): Promise<void> {
    await this.delegationManager.startExecution(id);
    return this.delegationManager.completeExecution(id, result);
  }

  /**
   * 提交审查
   */
  async submitReview(
    id: string,
    reviewer: string,
    feedback: string,
    approved: boolean
  ): Promise<void> {
    return this.delegationManager.submitReview(id, reviewer, feedback, approved);
  }

  /**
   * 获取委派管理器
   */
  getDelegationManager(): DelegationManager {
    return this.delegationManager;
  }

  // ============ 工作空间相关 ============

  /**
   * 创建工作空间
   */
  createWorkspace(
    agents: string[],
    createdBy: string,
    metadata?: Record<string, unknown>
  ): SharedWorkspace {
    return this.workspaceManager.createWorkspace(agents, createdBy, metadata);
  }

  /**
   * 获取工作空间
   */
  getWorkspace(id: string): SharedWorkspace | undefined {
    return this.workspaceManager.getWorkspace(id);
  }

  /**
   * 列出工作空间
   */
  listWorkspaces(agentId?: string): SharedWorkspace[] {
    return this.workspaceManager.listWorkspaces(agentId);
  }

  /**
   * 读取工作空间文件
   */
  readWorkspaceFile(workspaceId: string, filePath: string): string | undefined {
    return this.workspaceManager.readFile(workspaceId, filePath);
  }

  /**
   * 写入工作空间文件
   */
  writeWorkspaceFile(
    workspaceId: string,
    filePath: string,
    content: string,
    agentId: string
  ): void {
    return this.workspaceManager.writeFile(workspaceId, filePath, content, agentId);
  }

  /**
   * 获取工作空间管理器
   */
  getWorkspaceManager(): SharedWorkspaceManager {
    return this.workspaceManager;
  }

  // ============ 统计和状态 ============

  /**
   * 获取整体统计
   */
  getStats(): {
    messages: ReturnType<AgentMessageBus['getStats']>;
    delegations: ReturnType<DelegationManager['getStats']>;
    workspaces: ReturnType<SharedWorkspaceManager['getStats']>;
  } {
    return {
      messages: this.messageBus.getStats(),
      delegations: this.delegationManager.getStats(),
      workspaces: this.workspaceManager.getStats(),
    };
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    this.messageBus.clearMessages();
  }

  // ============ 向后兼容方法 ============

  /**
   * @deprecated 使用 sendMessage 代替
   */
  async request(fromAgent: string, toAgent: string, content: string): Promise<AgentMessage> {
    return this.sendMessage(fromAgent, toAgent, content, { type: 'request' });
  }

  /**
   * @deprecated 使用 createDelegation 代替
   */
  async delegateTask(
    delegator: string,
    delegatee: string,
    task: string,
    options?: {
      priority?: DelegationRequest['priority'];
      context?: string;
    }
  ): Promise<string> {
    return this.createDelegation(delegator, delegatee, task, options);
  }

  /**
   * @deprecated 使用 createWorkspace 代替
   */
  createSharedWorkspace(agents: string[], createdBy: string): SharedWorkspace {
    return this.createWorkspace(agents, createdBy);
  }
}

// ============ 便捷函数 ============

let globalManager: CollaborationManager | null = null;

/**
 * 获取全局协作管理器
 */
export function getCollaborationManager(
  config?: Partial<CollaborationConfig>
): CollaborationManager {
  if (!globalManager) {
    globalManager = new CollaborationManager(config);
  }
  return globalManager;
}

/**
 * 配置全局协作管理器
 */
export function configureCollaborationManager(
  config: Partial<CollaborationConfig>
): void {
  globalManager = new CollaborationManager(config);
}

/**
 * 重置全局协作管理器
 */
export function resetCollaborationManager(): void {
  if (globalManager) {
    globalManager.cleanup();
  }
  globalManager = null;
}