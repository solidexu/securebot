/**
 * 中间件系统
 * 
 * 参考 LangGraph 的生命周期管理和 CrewAI 的 A2A 处理器模式
 */

import { AgentError, NodeExecutionError, TimeoutError } from './errors.js';
import { RetryPolicy, DEFAULT_RETRY_POLICY, runWithRetry, calculateBackoff, sleep } from './retry.js';

/**
 * 中间件上下文
 */
export interface MiddlewareContext {
  /** 节点 ID */
  nodeId: string;
  /** 节点名称 */
  nodeName: string;
  /** 输入数据 */
  input: unknown;
  /** 输出数据 */
  output?: unknown;
  /** 错误 */
  error?: Error;
  /** 执行时间（毫秒） */
  duration?: number;
  /** 重试次数 */
  attempts?: number;
  /** 元数据 */
  metadata: Record<string, unknown>;
  /** 追踪 ID */
  traceId?: string;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 中间件函数
 */
export type Middleware = (
  context: MiddlewareContext,
  next: () => Promise<void>
) => Promise<void>;

/**
 * 中间件管理器
 */
export class MiddlewareManager {
  private middlewares: Middleware[] = [];

  /**
   * 添加中间件
   */
  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * 清空中间件
   */
  clear(): this {
    this.middlewares = [];
    return this;
  }

  /**
   * 执行中间件链
   */
  async execute(
    context: MiddlewareContext,
    handler: () => Promise<unknown>
  ): Promise<unknown> {
    let index = 0;

    const next = async (): Promise<void> => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++];
        await middleware(context, next);
      } else {
        // 执行实际处理器
        context.output = await handler();
      }
    };

    try {
      await next();
      return context.output;
    } catch (error: any) {
      context.error = error;
      throw error;
    }
  }

  /**
   * 获取中间件数量
   */
  get count(): number {
    return this.middlewares.length;
  }
}

/**
 * 创建中间件上下文
 */
export function createMiddlewareContext(
  nodeId: string,
  nodeName: string,
  input: unknown,
  metadata: Record<string, unknown> = {}
): MiddlewareContext {
  return {
    nodeId,
    nodeName,
    input,
    metadata,
    timestamp: Date.now(),
    traceId: `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  };
}

// ============================================
// 内置中间件
// ============================================

/**
 * 日志中间件
 */
export function loggingMiddleware(
  logger: {
    info: (msg: string, data?: Record<string, unknown>) => void;
    warn: (msg: string, data?: Record<string, unknown>) => void;
    error: (msg: string, data?: Record<string, unknown>) => void;
  } = console
): Middleware {
  return async (ctx, next) => {
    const start = Date.now();
    logger.info(`[Node ${ctx.nodeName}] Starting`, { nodeId: ctx.nodeId, input: ctx.input });

    try {
      await next();
      ctx.duration = Date.now() - start;
      logger.info(`[Node ${ctx.nodeName}] Completed`, {
        nodeId: ctx.nodeId,
        duration: ctx.duration,
        output: ctx.output,
      });
    } catch (error: any) {
      ctx.duration = Date.now() - start;
      ctx.error = error;
      logger.error(`[Node ${ctx.nodeName}] Failed`, {
        nodeId: ctx.nodeId,
        duration: ctx.duration,
        error: error.message,
      });
      throw error;
    }
  };
}

/**
 * 指标收集中间件
 */
export function metricsMiddleware(
  collector: {
    increment: (metric: string, value?: number, tags?: Record<string, string>) => void;
    gauge: (metric: string, value: number, tags?: Record<string, string>) => void;
    histogram: (metric: string, value: number, tags?: Record<string, string>) => void;
  }
): Middleware {
  return async (ctx, next) => {
    const start = Date.now();
    collector.increment('node.execution.started', 1, { node: ctx.nodeId });

    try {
      await next();
      const duration = Date.now() - start;
      
      collector.increment('node.execution.completed', 1, { node: ctx.nodeId });
      collector.histogram('node.execution.duration', duration, { node: ctx.nodeId });
      
      ctx.metadata.success = true;
      ctx.metadata.duration = duration;
    } catch (error: any) {
      const duration = Date.now() - start;
      
      collector.increment('node.execution.failed', 1, { node: ctx.nodeId });
      collector.histogram('node.execution.duration', duration, { node: ctx.nodeId });
      
      ctx.metadata.success = false;
      ctx.metadata.duration = duration;
      ctx.metadata.errorType = error.constructor.name;
      
      throw error;
    }
  };
}

/**
 * 超时中间件
 */
export function timeoutMiddleware(timeoutMs: number): Middleware {
  return async (ctx, next) => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new TimeoutError(ctx.nodeId, timeoutMs));
      }, timeoutMs);
    });

    try {
      await Promise.race([next(), timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
  };
}

/**
 * 重试中间件
 */
export function retryMiddleware(policy: RetryPolicy = DEFAULT_RETRY_POLICY): Middleware {
  return async (ctx, next) => {
    let attempts = 0;
    let lastError: Error | undefined;

    while (attempts < policy.maxAttempts) {
      try {
        // 清空上次输出
        ctx.output = undefined;
        ctx.error = undefined;
        
        await next();
        
        ctx.attempts = attempts + 1;
        return;
      } catch (error: any) {
        lastError = error;
        attempts++;

        // 检查是否应该重试
        if (!policy.retryOn(error)) {
          throw error;
        }

        // 检查是否达到最大尝试次数
        if (attempts >= policy.maxAttempts) {
          ctx.attempts = attempts;
          ctx.error = error;
          throw error;
        }

        // 计算等待时间
        const delay = calculateBackoff(attempts, policy);
        
        ctx.metadata.retryAttempts = attempts;
        ctx.metadata.retryDelay = delay;

        await sleep(delay);
      }
    }

    throw lastError;
  };
}

/**
 * 错误处理中间件
 */
export function errorHandlingMiddleware(
  handler: (error: Error, ctx: MiddlewareContext) => Promise<void> | void
): Middleware {
  return async (ctx, next) => {
    try {
      await next();
    } catch (error: any) {
      ctx.error = error;
      await handler(error, ctx);
      throw error;
    }
  };
}

/**
 * 追踪中间件
 */
export function tracingMiddleware(
  tracer: {
    startSpan: (name: string, parentTraceId?: string) => string;
    endSpan: (spanId: string, metadata?: Record<string, unknown>) => void;
    addEvent: (spanId: string, name: string, metadata?: Record<string, unknown>) => void;
  }
): Middleware {
  return async (ctx, next) => {
    const spanId = tracer.startSpan(ctx.nodeName, ctx.traceId);
    ctx.metadata.spanId = spanId;

    tracer.addEvent(spanId, 'start', { input: ctx.input });

    try {
      await next();
      tracer.endSpan(spanId, {
        output: ctx.output,
        duration: ctx.duration,
        success: true,
      });
    } catch (error: any) {
      tracer.endSpan(spanId, {
        error: error.message,
        duration: ctx.duration,
        success: false,
      });
      throw error;
    }
  };
}

/**
 * 缓存中间件（可选）
 */
export function cacheMiddleware(
  cache: {
    get: (key: string) => Promise<unknown | undefined>;
    set: (key: string, value: unknown, ttlMs?: number) => Promise<void>;
  },
  keyGenerator: (ctx: MiddlewareContext) => string,
  ttlMs?: number
): Middleware {
  return async (ctx, next) => {
    const cacheKey = keyGenerator(ctx);
    
    // 尝试从缓存获取
    const cached = await cache.get(cacheKey);
    if (cached !== undefined) {
      ctx.output = cached;
      ctx.metadata.fromCache = true;
      return;
    }

    // 执行实际处理
    await next();

    // 存入缓存
    if (ctx.output !== undefined) {
      await cache.set(cacheKey, ctx.output, ttlMs);
      ctx.metadata.cached = true;
    }
  };
}

/**
 * 速率限制中间件
 */
export function rateLimitMiddleware(
  limiter: {
    acquire: (key: string) => Promise<boolean>;
    release: (key: string) => void;
  },
  keyGenerator: (ctx: MiddlewareContext) => string
): Middleware {
  return async (ctx, next) => {
    const key = keyGenerator(ctx);
    
    const acquired = await limiter.acquire(key);
    if (!acquired) {
      throw new AgentError(
        'Rate limit exceeded',
        'RATE_LIMIT_EXCEEDED',
        { key }
      );
    }

    try {
      await next();
    } finally {
      limiter.release(key);
    }
  };
}