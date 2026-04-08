/**
 * 事件总线
 * 
 * 提供模块间解耦的事件通信机制
 */

// ============ 类型定义 ============

type EventCallback<T = unknown> = (data: T) => void | Promise<void>;

interface EventSubscription {
  id: string;
  event: string;
  callback: EventCallback;
  once: boolean;
}

interface EventStats {
  totalEvents: number;
  totalListeners: number;
  eventsByType: Record<string, number>;
}

// ============ 事件类型 ============

/**
 * 应用事件类型
 */
export enum EventType {
  // Agent 相关
  AGENT_MESSAGE = 'agent:message',
  AGENT_SWITCH = 'agent:switch',
  AGENT_ERROR = 'agent:error',
  AGENT_START = 'agent:start',
  AGENT_STOP = 'agent:stop',

  // 协作相关
  COLLABORATION_DELEGATE = 'collaboration:delegate',
  COLLABORATION_ACCEPT = 'collaboration:accept',
  COLLABORATION_REJECT = 'collaboration:reject',
  COLLABORATION_COMPLETE = 'collaboration:complete',
  COLLABORATION_MESSAGE = 'collaboration:message',

  // UI 相关
  UI_MESSAGE_ADD = 'ui:message:add',
  UI_MESSAGE_UPDATE = 'ui:message:update',
  UI_MESSAGE_STREAM = 'ui:message:stream',
  UI_CODE_START = 'ui:code:start',
  UI_CODE_UPDATE = 'ui:code:update',
  UI_CODE_END = 'ui:code:end',
  UI_SHELL_START = 'ui:shell:start',
  UI_SHELL_OUTPUT = 'ui:shell:output',
  UI_SHELL_END = 'ui:shell:end',
  UI_FOCUS_CHANGE = 'ui:focus:change',
  UI_STREAM_START = 'ui:stream:start',
  UI_STREAM_END = 'ui:stream:end',

  // 工作流相关
  WORKFLOW_START = 'workflow:start',
  WORKFLOW_NODE_START = 'workflow:node:start',
  WORKFLOW_NODE_END = 'workflow:node:end',
  WORKFLOW_END = 'workflow:end',
  WORKFLOW_ERROR = 'workflow:error',

  // 系统相关
  SYSTEM_ERROR = 'system:error',
  SYSTEM_WARNING = 'system:warning',
  SYSTEM_LOG = 'system:log',
}

// ============ 事件数据类型 ============

export interface AgentMessageEvent {
  agentId: string;
  message: string;
  timestamp: number;
}

export interface UIMessageEvent {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface UIStreamEvent {
  id: string;
  chunk: string;
  isComplete: boolean;
}

export interface UICodeEvent {
  filePath: string;
  content?: string;
  line?: number;
  status: 'start' | 'update' | 'end';
}

export interface UIShellEvent {
  command: string;
  output?: string;
  exitCode?: number | null;
  status: 'start' | 'output' | 'end';
}

export interface WorkflowEvent {
  workflowId: string;
  nodeId?: string;
  nodeName?: string;
  status: 'start' | 'node_start' | 'node_end' | 'end' | 'error';
  error?: string;
}

// ============ EventBus 类 ============

/**
 * 事件总线实现
 */
class EventBusImpl {
  private subscriptions: Map<string, EventSubscription> = new Map();
  private eventStats: Record<string, number> = {};
  private totalEvents = 0;

  /**
   * 订阅事件
   */
  on<T>(event: string, callback: EventCallback<T>): () => void {
    const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    this.subscriptions.set(id, {
      id,
      event,
      callback: callback as EventCallback,
      once: false,
    });

    // 返回取消订阅函数
    return () => this.off(id);
  }

  /**
   * 订阅事件（别名）
   */
  subscribe<T>(event: string, callback: EventCallback<T>): () => void {
    return this.on(event, callback);
  }

  /**
   * 订阅一次性事件
   */
  once<T>(event: string, callback: EventCallback<T>): () => void {
    const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    this.subscriptions.set(id, {
      id,
      event,
      callback: callback as EventCallback,
      once: true,
    });

    return () => this.off(id);
  }

  /**
   * 取消订阅
   */
  off(id: string): void {
    this.subscriptions.delete(id);
  }

  /**
   * 发射事件
   */
  emit<T>(event: string, data?: T): void {
    this.totalEvents++;
    this.eventStats[event] = (this.eventStats[event] || 0) + 1;

    const toRemove: string[] = [];

    this.subscriptions.forEach((sub) => {
      if (sub.event === event) {
        try {
          sub.callback(data);
        } catch (error) {
          console.error(`Event callback error [${event}]:`, error);
        }

        if (sub.once) {
          toRemove.push(sub.id);
        }
      }
    });

    // 移除一次性订阅
    toRemove.forEach((id) => this.subscriptions.delete(id));
  }

  /**
   * 异步发射事件
   */
  async emitAsync<T>(event: string, data?: T): Promise<void> {
    this.totalEvents++;
    this.eventStats[event] = (this.eventStats[event] || 0) + 1;

    const promises: Promise<void>[] = [];
    const toRemove: string[] = [];

    this.subscriptions.forEach((sub) => {
      if (sub.event === event) {
        const result = sub.callback(data);
        if (result instanceof Promise) {
          promises.push(
            result.catch((error) => {
              console.error(`Event callback error [${event}]:`, error);
            })
          );
        }

        if (sub.once) {
          toRemove.push(sub.id);
        }
      }
    });

    await Promise.all(promises);
    toRemove.forEach((id) => this.subscriptions.delete(id));
  }

  /**
   * 清除所有订阅
   */
  clear(event?: string): void {
    if (event) {
      this.subscriptions.forEach((sub, id) => {
        if (sub.event === event) {
          this.subscriptions.delete(id);
        }
      });
    } else {
      this.subscriptions.clear();
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): EventStats {
    const eventsByType: Record<string, number> = { ...this.eventStats };
    return {
      totalEvents: this.totalEvents,
      totalListeners: this.subscriptions.size,
      eventsByType,
    };
  }

  /**
   * 检查是否有监听器
   */
  hasListeners(event: string): boolean {
    for (const sub of this.subscriptions.values()) {
      if (sub.event === event) return true;
    }
    return false;
  }
}

// ============ 全局实例 ============

let globalEventBus: EventBusImpl | null = null;

/**
 * 获取全局事件总线
 */
export function getEventBus(): EventBusImpl {
  if (!globalEventBus) {
    globalEventBus = new EventBusImpl();
  }
  return globalEventBus;
}

/**
 * 重置事件总线
 */
export function resetEventBus(): void {
  if (globalEventBus) {
    globalEventBus.clear();
  }
  globalEventBus = null;
}

// ============ 便捷函数 ============

/**
 * 订阅事件
 */
export function onEvent<T>(event: string, callback: EventCallback<T>): () => void {
  return getEventBus().on(event, callback);
}

/**
 * 订阅一次性事件
 */
export function onceEvent<T>(event: string, callback: EventCallback<T>): () => void {
  return getEventBus().once(event, callback);
}

/**
 * 发射事件
 */
export function emitEvent<T>(event: string, data?: T): void {
  getEventBus().emit(event, data);
}

/**
 * 异步发射事件
 */
export async function emitEventAsync<T>(event: string, data?: T): Promise<void> {
  return getEventBus().emitAsync(event, data);
}

// 导出单例
export const eventBus = new Proxy({} as EventBusImpl, {
  get(target, prop) {
    const bus = getEventBus();
    return bus[prop as keyof EventBusImpl];
  },
});