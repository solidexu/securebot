/**
 * Agent 协作系统
 * 
 * 支持 Agent 间消息传递、任务委派、共享工作空间
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, promises as fsPromises } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';

const { writeFile } = fsPromises;

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
 * 执行记录
 */
export interface ExecutionRecord {
  /** 执行轮数 */
  round: number;
  /** 执行者 */
  executor: string;
  /** 开始时间 */
  startedAt: number;
  /** 完成时间 */
  completedAt: number;
  /** 工作目录 */
  workspace: string;
  
  /** 交付物 */
  deliverables: {
    files: Array<{
      path: string;
      type: 'created' | 'modified';
      description: string;
      linesOfCode?: number;
      testCoverage?: number;
    }>;
    commands: Array<{
      command: string;
      result: 'passed' | 'failed';
      output: string;
    }>;
  };
  
  /** 自评报告 */
  selfAssessment: {
    completionRate: number;
    criteriaMet: Array<{
      criteria: string;
      met: boolean;
      evidence: string;
    }>;
    notes: string;
  };
  
  /** 问题解决（仅迭代时） */
  issueResolution?: Array<{
    issue: string;
    resolution: string;
  }>;
  
  /** 执行摘要 */
  summary: string;
}

/**
 * 验收记录
 */
export interface ReviewRecord {
  /** 验收轮数 */
  round: number;
  /** 验收者 */
  reviewer: string;
  /** 验收时间 */
  reviewedAt: number;
  /** 验收结果 */
  result: 'approved' | 'rejected';
  /** 反馈 */
  feedback: string;
  /** 问题列表 */
  issues?: Array<{
    severity: 'high' | 'medium' | 'low';
    description: string;
    suggestion?: string;
  }>;
}

/**
 * 对话消息
 */
export interface ConversationMessage {
  /** 消息ID */
  id: string;
  /** 关联的任务ID */
  delegationId: string;
  /** 发送者 (delegator/delegatee/system) */
  sender: string;
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: number;
  /** 消息类型 */
  type: 'text' | 'instruction' | 'feedback' | 'system' | 'tool_call' | 'tool_result';
  /** 是否已读 */
  read: boolean;
  /** 元数据 */
  metadata?: {
    toolName?: string;
    toolResult?: string;
    executionTime?: number;
  };
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
  
  /** 验收标准 */
  acceptanceCriteria?: string[];
  /** 期望交付物 */
  expectedDeliverables?: string[];
  /** 任务上下文 */
  context?: string;
  /** 截止时间 */
  deadline?: number;
  /** 优先级 */
  priority: 'low' | 'normal' | 'high';
  
  /** 共享工作空间路径 */
  sharedWorkspace?: string;
  
  /** 状态 */
  status: 'pending' | 'accepted' | 'rejected' | 'in_progress' | 'pending_review' | 'completed' | 'failed';
  /** 当前轮数 */
  currentRound: number;
  /** 最大轮数 */
  maxRounds: number;
  
  /** 执行历史 */
  executionHistory: ExecutionRecord[];
  /** 验收历史 */
  reviewHistory: ReviewRecord[];
  
  /** 最新执行结果 */
  result?: string;
  /** 最新验收反馈 */
  reviewFeedback?: string;
  
  /** 对话历史 */
  conversationHistory: ConversationMessage[];
  /** 未读消息数 */
  unreadCount?: number;
  
  /** 重试次数 */
  retryCount?: number;
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

  /**
   * 获取全局待处理消息数量（用于统计）
   */
  getTotalPendingCount(): number {
    let count = 0;
    for (const queue of this.messageQueue.values()) {
      count += queue.filter(m => m.status === 'pending').length;
    }
    return count;
  }
}

// ============ 任务委派管理器 ============

/**
 * 任务委派管理器
 */
export class DelegationManager {
  private dataDir: string;
  private workspaceDir: string;
  private delegations: Map<string, DelegationRequest> = new Map();
  private handlers: Map<string, (request: DelegationRequest) => Promise<boolean>> = new Map();
  private config: Required<CollaborationConfig>;
  private delegationProcessorInterval?: ReturnType<typeof setInterval>;
  private executionQueue: string[] = [];
  private isExecuting: boolean = false;
  private executor?: (delegation: DelegationRequest) => Promise<string | null>;
  private messageBus?: any;
  private eventListeners: Map<string, Set<() => void>> = new Map();

  constructor(config: Partial<CollaborationConfig> = {}, rootDir?: string) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dataDir = join(homedir(), '.securebot', 'collaboration');
    this.workspaceDir = rootDir 
      ? join(rootDir, 'agents', 'collab_workspaces')
      : join(homedir(), '.securebot', 'agents', 'collab_workspaces');
    this.loadDelegations();
  }
  
  // 事件监听
  on(event: string, callback: () => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }
  
  off(event: string, callback: () => void): void {
    this.eventListeners.get(event)?.delete(callback);
  }
  
  private emit(event: string): void {
    this.eventListeners.get(event)?.forEach(callback => {
      try {
        callback();
      } catch (error) {
        // 忽略回调错误
      }
    });
  }

  private loadDelegations(): void {
    const delegationsDir = join(this.dataDir, 'delegations');
    if (!existsSync(delegationsDir)) return;

    const files = readdirSync(delegationsDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = readFileSync(join(delegationsDir, file), 'utf-8');
        const delegation = JSON.parse(content) as DelegationRequest;
        
        // 数据迁移：补充缺失的新字段
        if (delegation.currentRound === undefined) {
          delegation.currentRound = 0;
        }
        if (delegation.maxRounds === undefined) {
          delegation.maxRounds = 5;
        }
        if (!delegation.executionHistory) {
          delegation.executionHistory = [];
        }
        if (!delegation.reviewHistory) {
          delegation.reviewHistory = [];
        }
        if (!delegation.acceptanceCriteria) {
          delegation.acceptanceCriteria = [];
        }
        if (!delegation.expectedDeliverables) {
          delegation.expectedDeliverables = [];
        }
        if (!delegation.conversationHistory) {
          delegation.conversationHistory = [];
        }
        if (!delegation.sharedWorkspace) {
          // 为旧任务创建共享工作空间
          if (!existsSync(this.workspaceDir)) {
            mkdirSync(this.workspaceDir, { recursive: true });
          }
          const sharedWorkspacePath = join(this.workspaceDir, `${delegation.delegator}-${delegation.delegatee}-${delegation.createdAt}`);
          if (!existsSync(sharedWorkspacePath)) {
            mkdirSync(sharedWorkspacePath, { recursive: true });
          }
          delegation.sharedWorkspace = sharedWorkspacePath;
        }
        
        this.delegations.set(delegation.id, delegation);
      } catch {
        // 忽略
      }
    }
  }

  /**
   * 委派任务
   */
  /**
   * 启动委派任务处理循环
   */
  startDelegationProcessor(processor: (delegation: DelegationRequest) => Promise<void>): void {
    // 每5秒检查一次pending任务
    this.delegationProcessorInterval = setInterval(async () => {
      const pendingDelegations = Array.from(this.delegations.values())
        .filter(d => d.status === 'pending');
      
      for (const delegation of pendingDelegations) {
        try {
          await processor(delegation);
        } catch (error) {
          console.error(`处理委派任务失败 ${delegation.id}:`, error);
        }
      }
    }, 5000);
  }

  /**
   * 停止委派任务处理循环
   */
  stopDelegationProcessor(): void {
    if (this.delegationProcessorInterval) {
      clearInterval(this.delegationProcessorInterval);
      this.delegationProcessorInterval = undefined;
    }
  }

  async delegate(request: Omit<DelegationRequest, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'currentRound' | 'maxRounds' | 'executionHistory' | 'reviewHistory' | 'sharedWorkspace' | 'conversationHistory'>): Promise<DelegationRequest> {
    // 检查委派深度
    const depth = await this.getDelegationDepth(request.delegator);
    if (depth >= this.config.maxDelegationDepth) {
      throw new Error(`委派深度超过限制 (${this.config.maxDelegationDepth})`);
    }

    // 创建共享工作空间
    if (!existsSync(this.workspaceDir)) {
      mkdirSync(this.workspaceDir, { recursive: true });
    }
    const sharedWorkspacePath = join(this.workspaceDir, `${request.delegator}-${request.delegatee}-${Date.now()}`);
    if (!existsSync(sharedWorkspacePath)) {
      mkdirSync(sharedWorkspacePath, { recursive: true });
    }

    const delegation: DelegationRequest = {
      ...request,
      id: uuidv4(),
      status: 'pending',
      currentRound: 0,
      maxRounds: 5,
      executionHistory: [],
      reviewHistory: [],
      conversationHistory: [],
      sharedWorkspace: sharedWorkspacePath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.delegations.set(delegation.id, delegation);
    await this.persistDelegation(delegation);

    // 立即尝试通知受托者
    const handler = this.handlers.get(request.delegatee);
    if (handler) {
      try {
        const accepted = await handler(delegation);
        delegation.status = accepted ? 'accepted' : 'rejected';
        delegation.updatedAt = Date.now();
        await this.persistDelegation(delegation);
      } catch (error) {
        console.error(`委派处理器执行失败 ${request.delegatee}:`, error);
        // 保持pending状态，等待后续处理
      }
    }

    return delegation;
  }

/**
   * 获取委派深度
   * 
   * 追踪从 agentId 开始的委派链：delegator -> delegatee
   * 只计算活跃状态的委派
   */
  public async getDelegationDepth(agentId: string): Promise<number> {
    let depth = 0;
    let current = agentId;
    const visited = new Set<string>(); // 防止循环委派

    // 追溯委派链：从当前 agent (delegator) 向被委派者 (delegatee) 追踪
    // 只计算活跃的委派链（pending, accepted, in_progress, pending_review）
    while (depth < this.config.maxDelegationDepth) {
      // 找到 current 作为 delegator 的活跃委派记录
      let found = false;
      for (const delegation of this.delegations.values()) {
        // 只计算活跃状态的委派
        const isActive = ['pending', 'accepted', 'in_progress', 'pending_review'].includes(delegation.status);
        if (delegation.delegator === current && !visited.has(delegation.id) && isActive) {
          visited.add(delegation.id);
          current = delegation.delegatee;
          depth++;
          found = true;
          break;
        }
      }
      if (!found) break;
    }

    return depth;
  }

  /**
   * 注册委派处理器
   */
  registerHandler(agentId: string, handler: (request: DelegationRequest) => Promise<boolean>): void {
    this.handlers.set(agentId, handler);
    
    // 处理队列中的pending任务
    for (const delegation of this.delegations.values()) {
      if (delegation.status === 'pending' && delegation.delegatee === agentId) {
        handler(delegation).then(accepted => {
          delegation.status = accepted ? 'accepted' : 'rejected';
          delegation.updatedAt = Date.now();
          this.persistDelegation(delegation);
        }).catch(error => {
          console.error(`处理委派任务失败 ${delegation.id}:`, error);
        });
      }
    }
  }

  /**
   * 检查是否注册了处理器
   */
  hasHandler(agentId: string): boolean {
    return this.handlers.has(agentId);
  }

  /**
   * 接受委派
   */
  async acceptDelegation(delegationId: string): Promise<void> {
    const delegation = this.findDelegationById(delegationId);
    if (!delegation) {
      throw new Error('委派不存在');
    }

    delegation.status = 'accepted';
    delegation.updatedAt = Date.now();
    await this.persistDelegation(delegation);
    
    // 所有任务都自动加入执行队列
    this.executionQueue.push(delegation.id);
    console.log(`任务 ${delegation.id.slice(0, 8)} 已加入执行队列，当前位置: ${this.executionQueue.length}`);
    
    // 触发队列处理
    this.processQueue();
  }
  
  /**
   * 设置任务执行器
   */
  setExecutor(executor: (delegation: DelegationRequest) => Promise<string | null>): void {
    this.executor = executor;
  }
  
  /**
   * 设置消息总线
   */
  setMessageBus(messageBus: any): void {
    this.messageBus = messageBus;
  }
  
  /**
   * 处理执行队列
   */
  private async processQueue(): Promise<void> {
    if (this.isExecuting || this.executionQueue.length === 0) {
      return;
    }
    
    if (!this.executor) {
      console.warn('未设置任务执行器，无法自动执行任务');
      return;
    }
    
    this.isExecuting = true;
    
    while (this.executionQueue.length > 0) {
      const delegationId = this.executionQueue.shift();
      if (!delegationId) break;
      
      const delegation = this.findDelegationById(delegationId);
      if (!delegation || delegation.status !== 'accepted') {
        continue;
      }
      
      let startedAt = Date.now();
      
      try {
        console.log(`开始执行任务 ${delegation.id.slice(0, 8)}: ${delegation.task.slice(0, 50)}...`);
        
        delegation.status = 'in_progress';
        delegation.currentRound++;
        delegation.updatedAt = Date.now();
        await this.persistDelegation(delegation);
        
        const result = await this.executor(delegation);
        const completedAt = Date.now();
        
        if (result) {
          delegation.status = 'pending_review';
          delegation.result = result;
          delegation.retryCount = (delegation.retryCount || 0) + 1;
          
          // 保存执行记录到历史
          const executionRecord: ExecutionRecord = {
            round: delegation.currentRound,
            executor: delegation.delegatee,
            startedAt,
            completedAt,
            workspace: '',
            deliverables: {
              files: [],
              commands: []
            },
            selfAssessment: {
              completionRate: 100,
              criteriaMet: [],
              notes: '任务执行完成'
            },
            summary: result
          };
          
          delegation.executionHistory.push(executionRecord);
        } else {
          delegation.status = 'failed';
          delegation.result = '执行失败，未获得结果';
        }
        
        delegation.updatedAt = Date.now();
        await this.persistDelegation(delegation);
        
        // 通知委托者任务已完成，等待验收
        if (delegation.status === 'pending_review') {
          if (this.messageBus) {
            await this.messageBus.sendMessage({
              id: uuidv4(),
              fromAgent: delegation.delegatee,
              toAgent: delegation.delegator,
              type: 'delegation',
              content: `任务 "${delegation.task.slice(0, 50)}..." 已完成（第${delegation.currentRound}轮），等待验收。\n使用 /collab review 快速验收。`,
              createdAt: Date.now(),
              read: false,
            });
          }
          console.log(`任务 ${delegation.id.slice(0, 8)} 执行完成，状态: ${delegation.status}，已通知委托者 ${delegation.delegator}`);
        } else {
          console.log(`任务 ${delegation.id.slice(0, 8)} 执行完成，状态: ${delegation.status}`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        
        delegation.status = 'failed';
        delegation.result = `错误: ${msg}\n\n${stack || ''}`;
        delegation.updatedAt = Date.now();
        
        // 保存失败记录到执行历史
        const failedRecord: ExecutionRecord = {
          round: delegation.currentRound,
          executor: delegation.delegatee,
          startedAt,
          completedAt: Date.now(),
          workspace: delegation.sharedWorkspace || '',
          deliverables: {
            files: [],
            commands: []
          },
          selfAssessment: {
            completionRate: 0,
            criteriaMet: [],
            notes: `执行失败: ${msg}`
          },
          summary: `执行失败: ${msg}\n\n堆栈信息:\n${stack || '无'}`
        };
        
        delegation.executionHistory.push(failedRecord);
        await this.persistDelegation(delegation);
        
        console.error(`任务 ${delegation.id.slice(0, 8)} 执行失败:`, msg);
      }
    }
    
    this.isExecuting = false;
  }
  
  /**
   * 重试失败的任务
   */
  async retryDelegation(delegationId: string): Promise<void> {
    const delegation = this.findDelegationById(delegationId);
    if (!delegation) {
      throw new Error('委派不存在');
    }
    
    if (delegation.status !== 'failed') {
      throw new Error('只能重试失败的任务');
    }
    
    delegation.status = 'accepted';
    delegation.updatedAt = Date.now();
    await this.persistDelegation(delegation);
    
    // 重新加入执行队列
    this.executionQueue.push(delegation.id);
    console.log(`任务 ${delegation.id.slice(0, 8)} 已重新加入执行队列`);
    
    // 触发队列处理
    this.processQueue();
  }
  
  /**
   * 发送对话消息
   */
  async sendMessage(
    delegationId: string,
    sender: string,
    content: string,
    type: ConversationMessage['type'] = 'text'
  ): Promise<ConversationMessage> {
    const delegation = this.findDelegationById(delegationId);
    if (!delegation) {
      throw new Error('委派不存在');
    }
    
    // 权限验证：只有委托者、被委托者和系统可以发送消息
    if (sender !== delegation.delegator && sender !== delegation.delegatee && sender !== 'system') {
      throw new Error(`无权限：只有委托者 (${delegation.delegator}) 和被委托者 (${delegation.delegatee}) 可以发送消息`);
    }
    
    // 内容验证
    if (!content || content.trim().length === 0) {
      throw new Error('消息内容不能为空');
    }
    
    // 限制消息长度
    if (content.length > 10000) {
      throw new Error('消息长度不能超过 10000 字符');
    }
    
    const message: ConversationMessage = {
      id: uuidv4(),
      delegationId,
      sender,
      content: content.trim(),
      timestamp: Date.now(),
      type,
      read: false,
    };
    
    delegation.conversationHistory = delegation.conversationHistory || [];
    delegation.conversationHistory.push(message);
    delegation.updatedAt = Date.now();
    
    await this.persistDelegation(delegation);
    
    // 触发消息事件
    const listeners = this.eventListeners.get('message');
    if (listeners) {
      for (const listener of listeners) {
        try {
          (listener as any)(message);
        } catch (error) {
          console.error('消息事件监听器执行失败:', error);
        }
      }
    }
    
    return message;
  }
  
  /**
   * 获取对话历史
   */
  getConversationHistory(delegationId: string): ConversationMessage[] {
    const delegation = this.findDelegationById(delegationId);
    if (!delegation) {
      return [];
    }
    
    return delegation.conversationHistory || [];
  }
  
  /**
   * 标记消息已读
   */
  async markMessagesAsRead(delegationId: string, reader: string): Promise<void> {
    const delegation = this.findDelegationById(delegationId);
    if (!delegation) {
      return;
    }
    
    let updated = false;
    delegation.conversationHistory = delegation.conversationHistory || [];
    
    for (const message of delegation.conversationHistory) {
      // 标记不是自己发送的消息为已读
      if (message.sender !== reader && !message.read) {
        message.read = true;
        updated = true;
      }
    }
    
    if (updated) {
      delegation.updatedAt = Date.now();
      await this.persistDelegation(delegation);
    }
  }
  
  /**
   * 获取未读消息数
   */
  getUnreadCount(delegationId: string, reader: string): number {
    const delegation = this.findDelegationById(delegationId);
    if (!delegation) {
      return 0;
    }
    
    return (delegation.conversationHistory || [])
      .filter(m => m.sender !== reader && !m.read)
      .length;
  }
  
  /**
   * 获取队列状态
   */
  getQueueStatus(): { queueLength: number; isExecuting: boolean } {
    return {
      queueLength: this.executionQueue.length,
      isExecuting: this.isExecuting
    };
  }

  /**
   * 拒绝委派
   */
  async rejectDelegation(delegationId: string, reason?: string): Promise<void> {
    const delegation = this.findDelegationById(delegationId);
    if (!delegation) {
      throw new Error('委派不存在');
    }

    delegation.status = 'rejected';
    delegation.result = reason;
    delegation.updatedAt = Date.now();
    await this.persistDelegation(delegation);
  }
  
  /**
   * 验收通过
   */
  async approveDelegation(delegationId: string): Promise<void> {
    const delegation = this.findDelegationById(delegationId);
    if (!delegation) {
      throw new Error('委派不存在');
    }

    if (delegation.status !== 'pending_review') {
      throw new Error('只能验收待审核的任务');
    }

    // 保存验收记录到历史
    const reviewRecord: ReviewRecord = {
      round: delegation.currentRound,
      reviewer: delegation.delegator,
      reviewedAt: Date.now(),
      result: 'approved',
      feedback: '验收通过'
    };
    
    delegation.reviewHistory.push(reviewRecord);
    delegation.status = 'completed';
    delegation.updatedAt = Date.now();
    await this.persistDelegation(delegation);
    
    // 通知被委托者任务验收通过
    if (this.messageBus) {
      await this.messageBus.sendMessage({
        id: uuidv4(),
        fromAgent: delegation.delegator,
        toAgent: delegation.delegatee,
        type: 'delegation',
        content: `任务 "${delegation.task.slice(0, 50)}..." 验收通过！\n感谢您的辛勤工作。`,
        createdAt: Date.now(),
        read: false,
      });
    }
    
    console.log(`任务 ${delegation.id.slice(0, 8)} 验收通过`);
  }
  
  /**
   * 验收不通过，重新执行
   */
  async rejectReview(delegationId: string, feedback: string): Promise<void> {
    const delegation = this.findDelegationById(delegationId);
    if (!delegation) {
      throw new Error('委派不存在');
    }

    if (delegation.status !== 'pending_review') {
      throw new Error('只能重新执行待审核的任务');
    }

    // 保存验收记录到历史
    const reviewRecord: ReviewRecord = {
      round: delegation.currentRound,
      reviewer: delegation.delegator,
      reviewedAt: Date.now(),
      result: 'rejected',
      feedback,
      issues: this.parseFeedbackToIssues(feedback)
    };
    
    delegation.reviewHistory.push(reviewRecord);
    delegation.status = 'accepted';
    delegation.reviewFeedback = feedback;
    delegation.updatedAt = Date.now();
    await this.persistDelegation(delegation);
    
    // 重新加入执行队列
    this.executionQueue.push(delegation.id);
    console.log(`任务 ${delegation.id.slice(0, 8)} 验收不通过，已重新加入执行队列`);
    console.log(`反馈: ${feedback}`);
    
    // 通知被委托者任务需要重新执行
    if (this.messageBus) {
      await this.messageBus.sendMessage({
        id: uuidv4(),
        fromAgent: delegation.delegator,
        toAgent: delegation.delegatee,
        type: 'delegation',
        content: `任务 "${delegation.task.slice(0, 50)}..." 验收未通过（第${delegation.currentRound}轮）\n\n反馈：\n${feedback}\n\n请根据反馈改进后重新执行。`,
        createdAt: Date.now(),
        read: false,
      });
    }
    
    // 尝试启动队列处理
    this.processQueue();
  }
  
  /**
   * 解析反馈文本为问题列表
   */
  private parseFeedbackToIssues(feedback: string): Array<{
    severity: 'high' | 'medium' | 'low';
    description: string;
    suggestion?: string;
  }> {
    const issues: Array<{
      severity: 'high' | 'medium' | 'low';
      description: string;
      suggestion?: string;
    }> = [];
    
    const lines = feedback.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // 检测严重程度标记
      let severity: 'high' | 'medium' | 'low' = 'medium';
      let description = trimmed;
      
      if (trimmed.startsWith('[高]') || trimmed.startsWith('[紧急]') || trimmed.startsWith('[重要]')) {
        severity = 'high';
        description = trimmed.replace(/^\[[^\]]+\]\s*/, '');
      } else if (trimmed.startsWith('[低]') || trimmed.startsWith('[次要]')) {
        severity = 'low';
        description = trimmed.replace(/^\[[^\]]+\]\s*/, '');
      } else if (trimmed.startsWith('[中]') || trimmed.startsWith('[一般]')) {
        severity = 'medium';
        description = trimmed.replace(/^\[[^\]]+\]\s*/, '');
      }
      
      issues.push({
        severity,
        description,
        suggestion: undefined
      });
    }
    
    return issues.length > 0 ? issues : [{
      severity: 'medium',
      description: feedback
    }];
  }

  /**
   * 完成委派
   */
  async completeDelegation(delegationId: string, result: string): Promise<void> {
    const delegation = this.findDelegationById(delegationId);
    if (!delegation) {
      throw new Error('委派不存在');
    }

    delegation.status = 'completed';
    delegation.result = result;
    delegation.updatedAt = Date.now();
    await this.persistDelegation(delegation);
  }

  /**
   * 删除委派任务
   * 
   * 只有委托者可以删除，且只能删除特定状态的任务
   */
  async deleteDelegation(delegationId: string, requesterId: string): Promise<void> {
    const delegation = this.findDelegationById(delegationId);
    if (!delegation) {
      throw new Error('委派不存在');
    }

    // 检查权限：只有委托者可以删除
    if (delegation.delegator !== requesterId) {
      throw new Error('只有委托者可以删除委派任务');
    }

    // 检查状态：不能删除正在执行的任务（除非明确中止）
    const deletableStates = ['pending', 'accepted', 'rejected', 'completed', 'failed', 'pending_review', 'in_progress'];
    if (!deletableStates.includes(delegation.status)) {
      throw new Error(`不能删除状态为 ${delegation.status} 的任务`);
    }
    
    // 如果是正在执行的任务，需要从执行队列中移除
    if (delegation.status === 'in_progress') {
      const queueIndex = this.executionQueue.indexOf(delegation.id);
      if (queueIndex !== -1) {
        this.executionQueue.splice(queueIndex, 1);
      }
    }

    // 从内存中删除
    this.delegations.delete(delegation.id);
    
    // 从执行队列中移除（如果在队列中）
    const queueIndex = this.executionQueue.indexOf(delegation.id);
    if (queueIndex !== -1) {
      this.executionQueue.splice(queueIndex, 1);
    }
    
    // 删除持久化文件
    const filePath = join(this.dataDir, 'delegations', `${delegation.id}.json`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
    
    // 删除共享工作空间
    if (delegation.sharedWorkspace && existsSync(delegation.sharedWorkspace)) {
      try {
        const { rmSync } = await import('node:fs');
        rmSync(delegation.sharedWorkspace, { recursive: true, force: true });
        console.log(`共享工作空间已删除: ${delegation.sharedWorkspace}`);
      } catch (error) {
        console.error(`删除共享工作空间失败: ${error}`);
      }
    }
    
    // 通知被委托者任务已取消
    if (this.messageBus && delegation.status !== 'completed' && delegation.status !== 'failed') {
      await this.messageBus.sendMessage({
        id: uuidv4(),
        fromAgent: delegation.delegator,
        toAgent: delegation.delegatee,
        type: 'delegation',
        content: `任务 "${delegation.task.slice(0, 50)}..." 已被委托者取消`,
        createdAt: Date.now(),
        read: false,
      });
    }
    
    // 触发变更事件
    this.emit('delegationChanged');
    
    console.log(`委派 ${delegation.id.slice(0, 8)} 已删除`);
  }

  /**
   * 查找委派（支持部分ID匹配）
   */
  private findDelegationById(id: string): DelegationRequest | undefined {
    // 先尝试完整匹配
    const fullMatch = this.delegations.get(id);
    if (fullMatch) return fullMatch;
    
    // 尝试部分匹配（前8位或更多）
    for (const [fullId, delegation] of this.delegations) {
      if (fullId.startsWith(id)) {
        return delegation;
      }
    }
    
    return undefined;
  }

  /**
   * 获取委派
   */
  getDelegation(delegationId: string): DelegationRequest | undefined {
    return this.delegations.get(delegationId);
  }
  
  /**
   * 重新从文件系统加载所有委派（用于多进程同步）
   */
  reloadDelegations(): void {
    this.delegations.clear();
    this.loadDelegations();
  }

  /**
   * 获取 Agent 的委派列表
   * @param reload 是否从文件重新加载（用于多进程同步）
   */
  getDelegations(agentId: string, role?: 'delegator' | 'delegatee', reload: boolean = false): DelegationRequest[] {
    // 如果需要刷新，重新从文件加载
    if (reload) {
      this.reloadDelegations();
    }
    
    return Array.from(this.delegations.values())
      .filter(d => {
        if (role === 'delegator') return d.delegator === agentId;
        if (role === 'delegatee') return d.delegatee === agentId;
        return d.delegator === agentId || d.delegatee === agentId;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  
  /**
   * 获取委派的迭代历史
   */
  getDelegationHistory(delegationId: string): {
    delegation: DelegationRequest | null;
    summary: {
      totalRounds: number;
      executionHistory: ExecutionRecord[];
      reviewHistory: ReviewRecord[];
    };
  } {
    const delegation = this.findDelegationById(delegationId);
    
    if (!delegation) {
      return {
        delegation: null,
        summary: {
          totalRounds: 0,
          executionHistory: [],
          reviewHistory: []
        }
      };
    }
    
    return {
      delegation,
      summary: {
        totalRounds: delegation.currentRound,
        executionHistory: delegation.executionHistory,
        reviewHistory: delegation.reviewHistory
      }
    };
  }

  /**
   * 持久化委派
   */
private async persistDelegation(delegation: DelegationRequest): Promise<void> {
    const filePath = join(this.dataDir, 'delegations', `${delegation.id}.json`);
    await writeFile(filePath, JSON.stringify(delegation, null, 2));
    
    // 触发变更事件
    this.emit('delegationChanged');
  }

  /**
   * 获取活跃委派数量（用于统计）
   */
  getActiveCount(): number {
    return Array.from(this.delegations.values())
      .filter(d => d.status === 'in_progress' || d.status === 'accepted')
      .length;
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

  /**
   * 获取工作空间总数（用于统计）
   */
  getWorkspaceCount(): number {
    return this.workspaces.size;
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

  constructor(config: Partial<CollaborationConfig> = {}, rootDir?: string) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.messageBus = new AgentMessageBus(this.config);
    this.delegationManager = new DelegationManager(this.config, rootDir);
    this.workspaceManager = new SharedWorkspaceManager();
    
    // 设置消息总线到委派管理器，用于发送通知
    this.delegationManager.setMessageBus(this.messageBus);
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
    * 委派任务
    */
  async delegateTask(
    delegator: string,
    delegatee: string,
    task: string,
    options?: {
      priority?: 'low' | 'normal' | 'high';
      deadline?: number;
      acceptanceCriteria?: string[];
      expectedDeliverables?: string[];
      context?: string;
    }
  ): Promise<DelegationRequest> {
    const delegation = await this.delegationManager.delegate({
      delegator,
      delegatee,
      task,
      priority: options?.priority ?? 'normal',
      deadline: options?.deadline,
      acceptanceCriteria: options?.acceptanceCriteria,
      expectedDeliverables: options?.expectedDeliverables,
      context: options?.context,
    });

    // 如果状态还是pending，尝试立即处理
    if (delegation.status === 'pending') {
      // 检查是否有handler
      const hasHandler = this.delegationManager.hasHandler(delegatee);
      if (!hasHandler) {
        console.warn(`警告: Agent "${delegatee}" 未注册委派处理器，任务将保持pending状态`);
        console.warn(`提示: 使用 agent.registerDelegationHandler() 注册处理器`);
      }
    }

    return delegation;
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
    pendingDelegations: number;
    sharedWorkspaces: number;
  } {
    let pendingMessages = 0;
    let activeDelegations = 0;
    let pendingDelegations = 0;
    let sharedWorkspaces = 0;

    if (agentId) {
      pendingMessages = this.messageBus.getMessages(agentId, { status: 'pending' }).length;
      const delegations = this.delegationManager.getDelegations(agentId);
      activeDelegations = delegations.filter(d => 
        d.status === 'in_progress' || d.status === 'accepted'
      ).length;
      pendingDelegations = delegations.filter(d => 
        d.status === 'pending' && d.delegatee === agentId
      ).length;
      sharedWorkspaces = this.workspaceManager.getAgentWorkspaces(agentId).length;
    } else {
      // 使用公开方法获取全局统计
      pendingMessages = this.messageBus.getTotalPendingCount();
      activeDelegations = this.delegationManager.getActiveCount();
      pendingDelegations = Array.from(this.delegationManager.getDelegations('') as DelegationRequest[])
        .filter(d => d.status === 'pending').length;
      sharedWorkspaces = this.workspaceManager.getWorkspaceCount();
    }

    return { pendingMessages, activeDelegations, pendingDelegations, sharedWorkspaces };
  }
}

// ============ 全局实例 ============

let globalCollaborationManager: CollaborationManager | null = null;

export function getCollaborationManager(config?: Partial<CollaborationConfig>, rootDir?: string): CollaborationManager {
  if (!globalCollaborationManager) {
    globalCollaborationManager = new CollaborationManager(config, rootDir);
  }
  return globalCollaborationManager;
}

export function resetCollaborationManager(): void {
  globalCollaborationManager = null;
}