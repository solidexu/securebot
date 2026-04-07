/**
 * 任务委派管理器
 * 
 * 管理 Agent 之间的任务委派
 */

import { v4 as uuidv4 } from 'uuid';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';

// ============ 类型定义 ============

export interface ExecutionRecord {
  round: number;
  startTime: number;
  endTime: number;
  result: string;
  success: boolean;
  error?: string;
}

export interface ReviewRecord {
  round: number;
  reviewer: string;
  feedback: string;
  approved: boolean;
  timestamp: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  agentId?: string;
}

export interface DelegationRequest {
  id: string;
  delegator: string;
  delegatee: string;
  task: string;
  acceptanceCriteria?: string[];
  expectedDeliverables?: string[];
  context?: string;
  deadline?: number;
  priority: 'low' | 'normal' | 'high';
  sharedWorkspace?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'in_progress' | 'pending_review' | 'completed' | 'failed';
  currentRound: number;
  maxRounds: number;
  executionHistory: ExecutionRecord[];
  reviewHistory: ReviewRecord[];
  result?: string;
  reviewFeedback?: string;
  conversationHistory: ConversationMessage[];
  unreadCount?: number;
  retryCount?: number;
  createdAt: number;
  updatedAt: number;
}

export type DelegationStatus = DelegationRequest['status'];

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
}

export interface CollaborationConfig {
  messageTimeout?: number;
  maxDelegationDepth?: number;
  autoAcceptDelegation?: boolean;
  messageRetention?: number;
  maxConcurrentDelegations?: number;
  defaultMaxRounds?: number;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: Required<CollaborationConfig> = {
  messageTimeout: 60000,
  maxDelegationDepth: 3,
  autoAcceptDelegation: false,
  messageRetention: 7 * 24 * 60 * 60 * 1000, // 7天
  maxConcurrentDelegations: 10,
  defaultMaxRounds: 5,
};

// ============ DelegationManager 类 ============

/**
 * 任务委派管理器
 * 
 * 处理 Agent 之间的任务委派流程
 */
export class DelegationManager {
  private dataDir: string;
  private workspaceDir: string;
  private delegations: Map<string, DelegationRequest> = new Map();
  private handlers: Map<string, (request: DelegationRequest) => Promise<boolean>> = new Map();
  private config: Required<CollaborationConfig>;
  private executionQueue: string[] = [];
  private isExecuting: boolean = false;
  private eventListeners: Map<string, Set<() => void>> = new Map();

  constructor(config: Partial<CollaborationConfig> = {}, rootDir?: string) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dataDir = join(homedir(), '.securebot', 'collaboration');
    this.workspaceDir = rootDir
      ? join(rootDir, 'agents', 'collab_workspaces')
      : join(homedir(), '.securebot', 'agents', 'collab_workspaces');
    this.loadDelegations();
  }

  /**
   * 创建委派请求
   */
  async createDelegation(
    request: Omit<
      DelegationRequest,
      | 'id'
      | 'createdAt'
      | 'updatedAt'
      | 'status'
      | 'currentRound'
      | 'executionHistory'
      | 'reviewHistory'
      | 'conversationHistory'
    >
  ): Promise<string> {
    const id = `del-${Date.now()}-${uuidv4().slice(0, 8)}`;

    // 创建共享工作空间
    const sharedWorkspace = this.createSharedWorkspace(request.delegator, request.delegatee);

    const delegation: DelegationRequest = {
      ...request,
      id,
      status: 'pending',
      currentRound: 0,
      maxRounds: request.maxRounds ?? this.config.defaultMaxRounds,
      executionHistory: [],
      reviewHistory: [],
      conversationHistory: [],
      sharedWorkspace,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.delegations.set(id, delegation);
    this.saveDelegation(delegation);
    this.emit('delegation:created');
    this.processQueue();

    return id;
  }

  /**
   * 获取委派请求
   */
  getDelegation(id: string): DelegationRequest | undefined {
    return this.delegations.get(id);
  }

  /**
   * 获取 Agent 的待处理委派
   */
  getPendingDelegations(agentId: string): DelegationRequest[] {
    return Array.from(this.delegations.values()).filter(
      (d) => d.delegatee === agentId && d.status === 'pending'
    );
  }

  /**
   * 获取 Agent 的所有委派
   */
  getAgentDelegations(agentId: string): DelegationRequest[] {
    return Array.from(this.delegations.values()).filter(
      (d) => d.delegator === agentId || d.delegatee === agentId
    );
  }

  /**
   * 接受委派
   */
  async acceptDelegation(id: string): Promise<void> {
    const delegation = this.delegations.get(id);
    if (!delegation) throw new Error(`Delegation not found: ${id}`);

    delegation.status = 'accepted';
    delegation.updatedAt = Date.now();
    this.saveDelegation(delegation);
    this.emit('delegation:accepted');
  }

  /**
   * 拒绝委派
   */
  async rejectDelegation(id: string, reason?: string): Promise<void> {
    const delegation = this.delegations.get(id);
    if (!delegation) throw new Error(`Delegation not found: ${id}`);

    delegation.status = 'rejected';
    delegation.reviewFeedback = reason;
    delegation.updatedAt = Date.now();
    this.saveDelegation(delegation);
    this.emit('delegation:rejected');
  }

  /**
   * 开始执行
   */
  async startExecution(id: string): Promise<void> {
    const delegation = this.delegations.get(id);
    if (!delegation) throw new Error(`Delegation not found: ${id}`);

    delegation.status = 'in_progress';
    delegation.updatedAt = Date.now();
    this.saveDelegation(delegation);
  }

  /**
   * 完成执行
   */
  async completeExecution(id: string, result: string): Promise<void> {
    const delegation = this.delegations.get(id);
    if (!delegation) throw new Error(`Delegation not found: ${id}`);

    delegation.status = 'pending_review';
    delegation.result = result;
    delegation.updatedAt = Date.now();

    // 记录执行历史
    delegation.executionHistory.push({
      round: delegation.currentRound,
      startTime: Date.now() - 1000,
      endTime: Date.now(),
      result,
      success: true,
    });

    this.saveDelegation(delegation);
    this.emit('delegation:completed');
  }

  /**
   * 提交审查反馈
   */
  async submitReview(
    id: string,
    reviewer: string,
    feedback: string,
    approved: boolean
  ): Promise<void> {
    const delegation = this.delegations.get(id);
    if (!delegation) throw new Error(`Delegation not found: ${id}`);

    delegation.reviewHistory.push({
      round: delegation.currentRound,
      reviewer,
      feedback,
      approved,
      timestamp: Date.now(),
    });

    if (approved) {
      delegation.status = 'completed';
    } else {
      delegation.currentRound++;
      if (delegation.currentRound >= delegation.maxRounds) {
        delegation.status = 'failed';
        delegation.reviewFeedback = 'Exceeded max rounds';
      } else {
        delegation.status = 'in_progress';
      }
    }

    delegation.updatedAt = Date.now();
    this.saveDelegation(delegation);
    this.emit('delegation:reviewed');
  }

  /**
   * 添加对话消息
   */
  addConversationMessage(id: string, message: Omit<ConversationMessage, 'timestamp'>): void {
    const delegation = this.delegations.get(id);
    if (!delegation) return;

    delegation.conversationHistory.push({
      ...message,
      timestamp: Date.now(),
    });
    delegation.updatedAt = Date.now();
    this.saveDelegation(delegation);
  }

  /**
   * 事件监听
   */
  on(event: string, callback: () => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  off(event: string, callback: () => void): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
  } {
    const all = Array.from(this.delegations.values());
    return {
      total: all.length,
      pending: all.filter((d) => d.status === 'pending').length,
      inProgress: all.filter((d) => d.status === 'in_progress').length,
      completed: all.filter((d) => d.status === 'completed').length,
      failed: all.filter((d) => d.status === 'failed').length,
    };
  }

  // ============ 向后兼容方法 ============

  /**
   * @deprecated 使用 createDelegation 代替
   */
  async delegate(request: {
    delegator: string;
    delegatee: string;
    task: string;
    priority?: DelegationRequest['priority'];
    deadline?: number;
    acceptanceCriteria?: string[];
    expectedDeliverables?: string[];
    context?: string;
  }): Promise<DelegationRequest> {
    const id = await this.createDelegation({
      delegator: request.delegator,
      delegatee: request.delegatee,
      task: request.task,
      priority: request.priority ?? 'normal',
      deadline: request.deadline,
      acceptanceCriteria: request.acceptanceCriteria ?? [],
      expectedDeliverables: request.expectedDeliverables ?? [],
      context: request.context,
    });
    return this.delegations.get(id)!;
  }

  /**
   * @deprecated 使用 addConversationMessage 代替
   */
  async sendMessage(
    delegationId: string,
    sender: string,
    content: string,
    type: string = 'text'
  ): Promise<{ id: string; sender: string; content: string; type: string; read: boolean }> {
    const delegation = this.delegations.get(delegationId);
    if (!delegation) throw new Error('委派不存在');

    const message: ConversationMessage = {
      role: sender === delegation.delegator ? 'user' : 'assistant',
      content,
      timestamp: Date.now(),
      agentId: sender,
    };

    delegation.conversationHistory.push(message);
    delegation.updatedAt = Date.now();
    this.saveDelegation(delegation);

    return {
      id: `msg-${Date.now()}`,
      sender,
      content,
      type,
      read: false,
    };
  }

  /**
   * @deprecated 直接访问 delegation.conversationHistory
   */
  getConversationHistory(delegationId: string): ConversationMessage[] {
    const delegation = this.delegations.get(delegationId);
    return delegation?.conversationHistory ?? [];
  }

  /**
   * @deprecated 使用 completeExecution 代替
   */
  async complete(delegationId: string, result: string): Promise<void> {
    return this.completeExecution(delegationId, result);
  }

  // ============ 私有方法 ============

  private emit(event: string): void {
    this.eventListeners.get(event)?.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error(`Event callback error: ${event}`, error);
      }
    });
  }

  private processQueue(): void {
    if (this.isExecuting) return;
    // 处理队列逻辑...
  }

  private createSharedWorkspace(delegator: string, delegatee: string): string {
    if (!existsSync(this.workspaceDir)) {
      mkdirSync(this.workspaceDir, { recursive: true });
    }
    const workspacePath = join(this.workspaceDir, `${delegator}-${delegatee}-${Date.now()}`);
    if (!existsSync(workspacePath)) {
      mkdirSync(workspacePath, { recursive: true });
    }
    return workspacePath;
  }

  private loadDelegations(): void {
    const delegationsDir = join(this.dataDir, 'delegations');
    if (!existsSync(delegationsDir)) return;

    const files = readdirSync(delegationsDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = readFileSync(join(delegationsDir, file), 'utf-8');
        const delegation = JSON.parse(content) as DelegationRequest;
        this.delegations.set(delegation.id, delegation);
      } catch {
        // 忽略加载错误
      }
    }
  }

  private saveDelegation(delegation: DelegationRequest): void {
    const delegationsDir = join(this.dataDir, 'delegations');
    if (!existsSync(delegationsDir)) {
      mkdirSync(delegationsDir, { recursive: true });
    }
    writeFileSync(
      join(delegationsDir, `${delegation.id}.json`),
      JSON.stringify(delegation, null, 2)
    );
  }
}