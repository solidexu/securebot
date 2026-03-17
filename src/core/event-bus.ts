/**
 * 事件总线 - 核心组件
 * 
 * 提供发布-订阅模式的事件分发机制
 * 支持中间件、异步处理、错误隔离
 */

import type { BaseEvent } from './events.js';

// ============ 类型定义 ============

/**
 * 事件处理器
 */
export type EventHandler<T = unknown> = (event: BaseEvent<T>) => void | Promise<void>;

/**
 * 事件中间件
 */
export type EventMiddleware = (event: BaseEvent) => BaseEvent | null | Promise<BaseEvent | null>;

/**
 * 错误处理器
 */
export type ErrorHandler = (error: Error, event: BaseEvent, handler: EventHandler) => void;

// ============ EventBus 实现 ============

/**
 * 事件总线
 * 
 * 使用方法：
 * ```ts
 * // 订阅事件
 * eventBus.subscribe('tool:call:success', async (event) => {
 *   console.log('Tool called:', event.payload.toolName);
 * });
 * 
 * // 发布事件
 * await eventBus.publish({
 *   type: 'tool:call:success',
 *   timestamp: new Date(),
 *   agentId: 'dev',
 *   sessionId: 'session-1',
 *   payload: { toolName: 'write', ... }
 * });
 * ```
 */
export class EventBus {
  /** 事件处理器映射 */
  private handlers: Map<string, Set<EventHandler>> = new Map();
  
  /** 中间件列表 */
  private middleware: EventMiddleware[] = [];
  
  /** 错误处理器 */
  private errorHandlers: ErrorHandler[] = [];
  
  /** 是否启用调试日志 */
  private debug: boolean = false;
  
  /** 事件历史（调试用） */
  private eventHistory: BaseEvent[] = [];
  
  /** 最大历史记录数 */
  private maxHistorySize: number = 100;

  /**
   * 订阅事件
   * @param eventType 事件类型
   * @param handler 事件处理器
   * @returns 取消订阅函数
   */
  subscribe<T>(eventType: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as EventHandler);
    
    // 返回取消订阅函数
    return () => {
      this.handlers.get(eventType)?.delete(handler as EventHandler);
    };
  }

  /**
   * 订阅一次性事件
   * @param eventType 事件类型
   * @param handler 事件处理器
   */
  once<T>(eventType: string, handler: EventHandler<T>): void {
    const wrapper: EventHandler<T> = async (event) => {
      this.unsubscribe(eventType, wrapper as EventHandler);
      await handler(event);
    };
    this.subscribe(eventType, wrapper);
  }

  /**
   * 取消订阅
   */
  unsubscribe<T>(eventType: string, handler: EventHandler<T>): void {
    this.handlers.get(eventType)?.delete(handler as EventHandler);
  }

  /**
   * 发布事件
   * @param event 事件对象
   */
  async publish<T>(event: BaseEvent<T>): Promise<void> {
    // 记录事件历史
    if (this.debug) {
      this.eventHistory.push(event);
      if (this.eventHistory.length > this.maxHistorySize) {
        this.eventHistory.shift();
      }
      console.log(`[EventBus] 📤 ${event.type}`, event);
    }

    // 执行中间件
    let processedEvent: BaseEvent | null = event;
    for (const mw of this.middleware) {
      try {
        if (!processedEvent) break;
        processedEvent = await mw(processedEvent);
        if (!processedEvent) {
          if (this.debug) {
            console.log(`[EventBus] 🛑 Event blocked by middleware: ${event.type}`);
          }
          return; // 中间件阻止事件
        }
      } catch (error) {
        console.error(`[EventBus] Middleware error:`, error);
      }
    }

    // 如果中间件返回 null，停止处理
    if (!processedEvent) {
      return;
    }

    // 获取该事件类型的所有处理器
    const handlers = this.handlers.get(event.type);
    if (!handlers || handlers.size === 0) {
      if (this.debug) {
        console.log(`[EventBus] ⚠️ No handlers for: ${event.type}`);
      }
      return;
    }

    // 并行执行所有处理器（错误隔离）
    const results = await Promise.allSettled(
      Array.from(handlers).map(async (handler) => {
        try {
          await handler(processedEvent!);
        } catch (error) {
          // 调用错误处理器
          this.handleError(error as Error, processedEvent!, handler);
          throw error;
        }
      })
    );

    // 记录错误
    if (this.debug) {
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          console.error(`[EventBus] Handler ${i} error:`, result.reason);
        }
      });
    }
  }

  /**
   * 同步发布事件（不等待处理器完成）
   */
  publishSync<T>(event: BaseEvent<T>): void {
    this.publish(event).catch((error) => {
      console.error(`[EventBus] Async publish error:`, error);
    });
  }

  /**
   * 添加中间件
   */
  use(middleware: EventMiddleware): void {
    this.middleware.push(middleware);
  }

  /**
   * 添加错误处理器
   */
  onError(handler: ErrorHandler): void {
    this.errorHandlers.push(handler);
  }

  /**
   * 启用调试模式
   */
  setDebug(enabled: boolean): void {
    this.debug = enabled;
  }

  /**
   * 获取事件历史
   */
  getHistory(): BaseEvent[] {
    return [...this.eventHistory];
  }

  /**
   * 清除所有处理器
   */
  clear(): void {
    this.handlers.clear();
    this.middleware = [];
    this.errorHandlers = [];
    this.eventHistory = [];
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    eventTypes: number;
    totalHandlers: number;
    handlersByType: Record<string, number>;
  } {
    const handlersByType: Record<string, number> = {};
    let totalHandlers = 0;
    
    for (const [type, handlers] of this.handlers) {
      handlersByType[type] = handlers.size;
      totalHandlers += handlers.size;
    }

    return {
      eventTypes: this.handlers.size,
      totalHandlers,
      handlersByType,
    };
  }

  /**
   * 内部错误处理
   */
  private handleError(error: Error, event: BaseEvent, handler: EventHandler): void {
    if (this.errorHandlers.length === 0) {
      console.error(`[EventBus] Handler error for ${event.type}:`, error);
      return;
    }

    for (const errorHandler of this.errorHandlers) {
      try {
        errorHandler(error, event, handler);
      } catch (e) {
        console.error(`[EventBus] Error handler failed:`, e);
      }
    }
  }
}

// ============ 单例实例 ============

/**
 * 全局事件总线实例
 */
export const eventBus = new EventBus();

/**
 * 获取事件总线实例
 */
export function getEventBus(): EventBus {
  return eventBus;
}

/**
 * 重置事件总线（用于测试）
 */
export function resetEventBus(): void {
  eventBus.clear();
}