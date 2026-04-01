/**
 * 生命周期钩子系统
 * 
 * 参考 LangGraph 的生命周期管理和 CrewAI Flow 的事件系统
 */

/**
 * 生命周期事件类型
 */
export type LifecycleEvent =
  // 图生命周期
  | 'graph:beforeStart'
  | 'graph:afterEnd'
  | 'graph:onError'
  | 'graph:onInterrupt'
  | 'graph:onCancel'
  // 节点生命周期
  | 'node:beforeExecute'
  | 'node:afterExecute'
  | 'node:onError'
  | 'node:onRetry'
  | 'node:onTimeout'
  // 边生命周期
  | 'edge:beforeTraverse'
  | 'edge:afterTraverse'
  | 'edge:onConditionFalse'
  // Handoff 生命周期
  | 'handoff:before'
  | 'handoff:after'
  // 心跳生命周期
  | 'heartbeat:onReceive'
  | 'heartbeat:onMissed'
  | 'heartbeat:onOffline'
  | 'heartbeat:onRecover';

/**
 * 生命周期事件数据
 */
export interface LifecycleEventData {
  /** 图 ID */
  graphId?: string;
  /** 节点 ID */
  nodeId?: string;
  /** 节点名称 */
  nodeName?: string;
  /** 边源节点 */
  sourceNodeId?: string;
  /** 边目标节点 */
  targetNodeId?: string;
  /** 线程 ID */
  threadId?: string;
  /** 输入数据 */
  input?: unknown;
  /** 输出数据 */
  output?: unknown;
  /** 错误 */
  error?: Error;
  /** 执行时间 */
  duration?: number;
  /** 重试次数 */
  attempt?: number;
  /** 条件结果 */
  conditionResult?: boolean;
  /** Handoff 消息 */
  message?: string;
  /** Agent ID（心跳相关） */
  agentId?: string;
  /** 任务 ID（心跳相关） */
  taskId?: string;
  /** 心跳计数 */
  heartbeatCount?: number;
  /** 最后心跳时间 */
  lastHeartbeat?: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 生命周期钩子函数
 */
export type LifecycleHook = (
  event: LifecycleEvent,
  data: LifecycleEventData
) => void | Promise<void>;

/**
 * 生命周期管理器
 */
export class LifecycleManager {
  private hooks: Map<LifecycleEvent, LifecycleHook[]> = new Map();
  private globalHooks: LifecycleHook[] = [];

  /**
   * 注册特定事件钩子
   */
  on(event: LifecycleEvent, hook: LifecycleHook): this {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }
    this.hooks.get(event)!.push(hook);
    return this;
  }

  /**
   * 注册全局钩子（所有事件）
   */
  onAll(hook: LifecycleHook): this {
    this.globalHooks.push(hook);
    return this;
  }

  /**
   * 移除特定事件钩子
   */
  off(event: LifecycleEvent, hook?: LifecycleHook): this {
    if (!hook) {
      this.hooks.delete(event);
    } else {
      const hooks = this.hooks.get(event);
      if (hooks) {
        const index = hooks.indexOf(hook);
        if (index >= 0) {
          hooks.splice(index, 1);
        }
      }
    }
    return this;
  }

  /**
   * 移除全局钩子
   */
  offAll(hook?: LifecycleHook): this {
    if (!hook) {
      this.globalHooks = [];
    } else {
      const index = this.globalHooks.indexOf(hook);
      if (index >= 0) {
        this.globalHooks.splice(index, 1);
      }
    }
    return this;
  }

  /**
   * 触发事件
   */
  async emit(event: LifecycleEvent, data: LifecycleEventData): Promise<void> {
    // 先执行全局钩子
    for (const hook of this.globalHooks) {
      await hook(event, data);
    }

    // 再执行特定事件钩子
    const hooks = this.hooks.get(event) || [];
    for (const hook of hooks) {
      await hook(event, data);
    }
  }

  /**
   * 同步触发（不等待异步钩子）
   */
  emitSync(event: LifecycleEvent, data: LifecycleEventData): void {
    // 执行全局钩子
    for (const hook of this.globalHooks) {
      const result = hook(event, data);
      if (result instanceof Promise) {
        // 异步钩子不等待
        result.catch(err => console.error(`Lifecycle hook error:`, err));
      }
    }

    // 执行特定事件钩子
    const hooks = this.hooks.get(event) || [];
    for (const hook of hooks) {
      const result = hook(event, data);
      if (result instanceof Promise) {
        result.catch(err => console.error(`Lifecycle hook error:`, err));
      }
    }
  }

  /**
   * 检查是否有钩子
   */
  hasHooks(event?: LifecycleEvent): boolean {
    if (event) {
      return this.hooks.has(event) && this.hooks.get(event)!.length > 0;
    }
    return this.globalHooks.length > 0 || this.hooks.size > 0;
  }

  /**
   * 获取钩子数量
   */
  getHookCount(event?: LifecycleEvent): number {
    if (event) {
      return this.hooks.get(event)?.length || 0;
    }
    let total = this.globalHooks.length;
    for (const hooks of this.hooks.values()) {
      total += hooks.length;
    }
    return total;
  }

  /**
   * 清空所有钩子
   */
  clear(): this {
    this.hooks.clear();
    this.globalHooks = [];
    return this;
  }
}

/**
 * 创建生命周期事件数据
 */
export function createLifecycleData(
  base: Partial<LifecycleEventData>
): LifecycleEventData {
  return {
    timestamp: Date.now(),
    ...base,
  };
}

// ============================================
// 内置钩子工厂
// ============================================

/**
 * 日志钩子
 */
export function createLoggingHook(
  logger: {
    info: (msg: string, data?: Record<string, unknown>) => void;
    warn: (msg: string, data?: Record<string, unknown>) => void;
    error: (msg: string, data?: Record<string, unknown>) => void;
  } = console
): LifecycleHook {
  return (event, data) => {
    const prefix = `[Lifecycle ${event}]`;
    const logData = { ...data, error: data.error?.message };

    if (event.includes('Error') || event.includes('onError')) {
      logger.error(prefix, logData);
    } else if (event.includes('onRetry') || event.includes('onTimeout') || event.includes('onMissed')) {
      logger.warn(prefix, logData);
    } else {
      logger.info(prefix, logData);
    }
  };
}

/**
 * 指标收集钩子
 */
export function createMetricsHook(
  collector: {
    increment: (metric: string, value?: number, tags?: Record<string, string>) => void;
    gauge: (metric: string, value: number, tags?: Record<string, string>) => void;
    histogram: (metric: string, value: number, tags?: Record<string, string>) => void;
  }
): LifecycleHook {
  return (event, data) => {
    const tags: Record<string, string> = {};
    if (data.nodeId) tags.node = data.nodeId;
    if (data.graphId) tags.graph = data.graphId;
    if (data.agentId) tags.agent = data.agentId;

    switch (event) {
      case 'graph:beforeStart':
        collector.increment('graph.started', 1, tags);
        break;
      case 'graph:afterEnd':
        collector.increment('graph.completed', 1, tags);
        if (data.duration) collector.histogram('graph.duration', data.duration, tags);
        break;
      case 'graph:onError':
        collector.increment('graph.failed', 1, tags);
        break;
      case 'node:beforeExecute':
        collector.increment('node.started', 1, tags);
        break;
      case 'node:afterExecute':
        collector.increment('node.completed', 1, tags);
        if (data.duration) collector.histogram('node.duration', data.duration, tags);
        break;
      case 'node:onError':
        collector.increment('node.failed', 1, tags);
        break;
      case 'node:onRetry':
        collector.increment('node.retries', 1, tags);
        break;
      case 'handoff:before':
        collector.increment('handoff.started', 1, tags);
        break;
      case 'heartbeat:onMissed':
        collector.increment('heartbeat.missed', 1, tags);
        break;
      case 'heartbeat:onOffline':
        collector.increment('heartbeat.offline', 1, tags);
        break;
    }
  };
}

/**
 * 通知钩子（用于发送告警）
 */
export function createNotificationHook(
  notifier: {
    send: (message: string, level: 'info' | 'warn' | 'error') => Promise<void>;
  },
  events: LifecycleEvent[] = ['graph:onError', 'node:onError', 'heartbeat:onOffline']
): LifecycleHook {
  return async (event, data) => {
    if (!events.includes(event)) return;

    let level: 'info' | 'warn' | 'error' = 'info';
    let message = '';

    switch (event) {
      case 'graph:onError':
        level = 'error';
        message = `Graph ${data.graphId} failed: ${data.error?.message}`;
        break;
      case 'node:onError':
        level = 'error';
        message = `Node ${data.nodeName} (${data.nodeId}) failed: ${data.error?.message}`;
        break;
      case 'node:onTimeout':
        level = 'warn';
        message = `Node ${data.nodeName} (${data.nodeId}) timed out after ${data.duration}ms`;
        break;
      case 'heartbeat:onOffline':
        level = 'error';
        message = `Agent ${data.agentId} is offline (missed ${data.heartbeatCount} heartbeats)`;
        break;
      case 'heartbeat:onRecover':
        level = 'info';
        message = `Agent ${data.agentId} recovered`;
        break;
    }

    if (message) {
      await notifier.send(message, level);
    }
  };
}

/**
 * 追踪钩子
 */
export function createTracingHook(
  tracer: {
    startSpan: (name: string, parentTraceId?: string) => string;
    endSpan: (spanId: string, metadata?: Record<string, unknown>) => void;
    addEvent: (spanId: string, name: string, metadata?: Record<string, unknown>) => void;
  }
): LifecycleHook {
  const spans = new Map<string, string>();

  return async (event, data) => {
    const spanKey = data.nodeId || data.graphId || '';

    switch (event) {
      case 'graph:beforeStart':
        const graphSpan = tracer.startSpan(`graph:${data.graphId}`, data.threadId);
        spans.set(spanKey, graphSpan);
        tracer.addEvent(graphSpan, 'start', { input: data.input });
        break;
      case 'graph:afterEnd':
        const graphSpanId = spans.get(spanKey);
        if (graphSpanId) {
          tracer.endSpan(graphSpanId, { output: data.output, duration: data.duration });
          spans.delete(spanKey);
        }
        break;
      case 'node:beforeExecute':
        const nodeSpan = tracer.startSpan(`node:${data.nodeName}`, spans.get(data.graphId || ''));
        spans.set(spanKey, nodeSpan);
        tracer.addEvent(nodeSpan, 'start', { input: data.input });
        break;
      case 'node:afterExecute':
        const nodeSpanId = spans.get(spanKey);
        if (nodeSpanId) {
          tracer.endSpan(nodeSpanId, { output: data.output, duration: data.duration });
          spans.delete(spanKey);
        }
        break;
      case 'node:onError':
        const errorSpanId = spans.get(spanKey);
        if (errorSpanId) {
          tracer.endSpan(errorSpanId, { error: data.error?.message, duration: data.duration });
          spans.delete(spanKey);
        }
        break;
    }
  };
}