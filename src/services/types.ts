/**
 * 服务层抽象
 * 
 * 为 CLI 层提供统一的服务接口，解耦核心模块依赖
 */

// ============ 类型定义 ============

import type { Agent } from '../core/agent/index.js';
import type { Session } from '../core/session/index.js';
import type { Graph } from '../core/collaboration/graph.js';

/**
 * Agent 服务接口
 */
export interface AgentService {
  /** 获取默认 Agent */
  getDefaultAgent(): Promise<Agent>;
  /** 获取指定 Agent */
  getAgent(id: string): Agent | undefined;
  /** 列出所有 Agent */
  listAgents(): Agent[];
  /** 创建会话 */
  createSession(agentId: string): Promise<Session>;
  /** 执行消息 */
  executeMessage(message: string, context?: ExecutionContext): Promise<void>;
}

/**
 * 模型服务接口
 */
export interface ModelService {
  /** 聊天 */
  chat(params: ChatParams): Promise<ChatResult>;
  /** 流式聊天 */
  stream(params: ChatParams, onChunk: (chunk: string) => void): Promise<void>;
  /** 检查可用性 */
  isAvailable(): boolean;
  /** 获取模型信息 */
  getModelInfo(): ModelInfo;
}

/**
 * 协作服务接口
 */
export interface CollaborationService {
  /** 发送消息 */
  sendMessage(from: string, to: string, content: string): Promise<string>;
  /** 创建委派 */
  createDelegation(request: DelegationRequestParams): Promise<string>;
  /** 获取工作空间 */
  getWorkspace(id: string): import('../core/collaboration/workspace-manager.js').SharedWorkspace | undefined;
  /** 获取图执行器 */
  getGraphExecutor(graphId: string): import('../core/collaboration/executor.js').GraphExecutor | undefined;
}

/**
 * 执行上下文
 */
export interface ExecutionContext {
  sessionId?: string;
  threadId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 聊天参数
 */
export interface ChatParams {
  prompt: string;
  system?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

/**
 * 聊天结果
 */
export interface ChatResult {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * 模型信息
 */
export interface ModelInfo {
  provider: string;
  model: string;
  contextWindow: number;
}

/**
 * 委派请求参数
 */
export interface DelegationRequestParams {
  delegator: string;
  delegatee: string;
  task: string;
  priority?: 'low' | 'normal' | 'high';
  context?: string;
  deadline?: number;
}

// ============ 服务容器 ============

/**
 * 服务容器
 * 
 * 管理所有服务的注册和解析
 */
export class ServiceContainer {
  private services: Map<string, unknown> = new Map();
  private factories: Map<string, () => unknown> = new Map();

  /**
   * 注册服务实例
   */
  register<T>(name: string, service: T): void {
    this.services.set(name, service);
  }

  /**
   * 注册服务工厂
   */
  registerFactory<T>(name: string, factory: () => T): void {
    this.factories.set(name, factory as () => unknown);
  }

  /**
   * 解析服务
   */
  resolve<T>(name: string): T {
    // 先检查实例
    const instance = this.services.get(name);
    if (instance) return instance as T;

    // 检查工厂
    const factory = this.factories.get(name);
    if (factory) {
      const service = factory();
      this.services.set(name, service);
      return service as T;
    }

    throw new Error(`Service not found: ${name}`);
  }

  /**
   * 检查服务是否存在
   */
  has(name: string): boolean {
    return this.services.has(name) || this.factories.has(name);
  }

  /**
   * 清除所有服务
   */
  clear(): void {
    this.services.clear();
    this.factories.clear();
  }
}

// ============ 全局服务容器 ============

let globalContainer: ServiceContainer | null = null;

/**
 * 获取全局服务容器
 */
export function getServiceContainer(): ServiceContainer {
  if (!globalContainer) {
    globalContainer = new ServiceContainer();
  }
  return globalContainer;
}

/**
 * 注册服务
 */
export function registerService<T>(name: string, service: T): void {
  getServiceContainer().register(name, service);
}

/**
 * 解析服务
 */
export function resolveService<T>(name: string): T {
  return getServiceContainer().resolve<T>(name);
}

// ============ 服务名称常量 ============

export const ServiceNames = {
  AGENT_SERVICE: 'AgentService',
  MODEL_SERVICE: 'ModelService',
  COLLABORATION_SERVICE: 'CollaborationService',
} as const;