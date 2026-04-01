# Agent 协作系统优化计划

基于 LangGraph、CrewAI、Swarm 等优秀框架的最佳实践分析

---

## 一、错误处理增强 (P0)

### 1.1 自定义错误类型

```typescript
// src/core/errors.ts

/** 基础错误类 */
export class AgentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

/** 节点执行错误 */
export class NodeExecutionError extends AgentError {
  constructor(
    public readonly nodeId: string,
    public readonly nodeName: string,
    cause: Error
  ) {
    super(
      `Node "${nodeName}" (${nodeId}) failed: ${cause.message}`,
      'NODE_EXECUTION_ERROR',
      { nodeId, nodeName, cause }
    );
  }
}

/** 图中断错误 */
export class GraphBubbleUp extends AgentError {
  constructor(public readonly reason: 'interrupt' | 'cancel' | 'timeout') {
    super(`Graph execution bubbled up: ${reason}`, 'GRAPH_BUBBLE_UP', { reason });
  }
}

/** 超时错误 */
export class TimeoutError extends AgentError {
  constructor(
    public readonly nodeId: string,
    public readonly timeoutMs: number
  ) {
    super(
      `Node "${nodeId}" timed out after ${timeoutMs}ms`,
      'TIMEOUT_ERROR',
      { nodeId, timeoutMs }
    );
  }
}

/** 重试耗尽错误 */
export class RetryExhaustedError extends AgentError {
  constructor(
    public readonly nodeId: string,
    public readonly attempts: number,
    public readonly lastError: Error
  ) {
    super(
      `Node "${nodeId}" failed after ${attempts} attempts: ${lastError.message}`,
      'RETRY_EXHAUSTED',
      { nodeId, attempts, lastError }
    );
  }
}
```

### 1.2 重试策略

```typescript
// src/core/retry.ts

/**
 * 重试策略
 */
export interface RetryPolicy {
  /** 最大尝试次数 */
  maxAttempts: number;
  /** 初始间隔（毫秒） */
  initialInterval: number;
  /** 最大间隔（毫秒） */
  maxInterval: number;
  /** 退避因子 */
  backoffFactor: number;
  /** 是否添加抖动 */
  jitter: boolean;
  /** 可重试的异常类型 */
  retryOn: (error: Error) => boolean;
}

/**
 * 默认重试策略
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialInterval: 1000,
  maxInterval: 30000,
  backoffFactor: 2,
  jitter: true,
  retryOn: (error) => {
    // 网络错误、超时错误可重试
    return error instanceof TimeoutError ||
           error.message.includes('ECONNRESET') ||
           error.message.includes('ETIMEDOUT');
  },
};

/**
 * 带重试的执行
 */
export async function runWithRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  context?: { nodeId?: string; logger?: Console }
): Promise<T> {
  let attempts = 0;
  let lastError: Error | undefined;

  while (attempts < policy.maxAttempts) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      attempts++;

      // 检查是否应该重试
      if (!policy.retryOn(error)) {
        throw error;
      }

      // 检查是否达到最大尝试次数
      if (attempts >= policy.maxAttempts) {
        throw new RetryExhaustedError(
          context?.nodeId || 'unknown',
          attempts,
          error
        );
      }

      // 计算等待时间（带退避和抖动）
      let interval = policy.initialInterval;
      interval = Math.min(
        policy.maxInterval,
        interval * Math.pow(policy.backoffFactor, attempts - 1)
      );
      if (policy.jitter) {
        interval = interval + Math.random() * interval * 0.5;
      }

      context?.logger?.warn(
        `Retrying after ${interval}ms (attempt ${attempts + 1}/${policy.maxAttempts}): ${error.message}`
      );

      await sleep(interval);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

---

## 二、中间件系统 (P1)

### 2.1 中间件接口

```typescript
// src/core/middleware.ts

/**
 * 中间件上下文
 */
export interface MiddlewareContext {
  /** 节点 ID */
  nodeId: string;
  /** 节点名称 */
  nodeName: string;
  /** 输入 */
  input: unknown;
  /** 输出 */
  output?: unknown;
  /** 错误 */
  error?: Error;
  /** 执行时间 */
  duration?: number;
  /** 元数据 */
  metadata: Record<string, unknown>;
}

/**
 * 中间件接口
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

  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  async execute(context: MiddlewareContext, handler: () => Promise<unknown>): Promise<unknown> {
    let index = 0;

    const next = async (): Promise<void> => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++];
        await middleware(context, next);
      } else {
        context.output = await handler();
      }
    };

    await next();
    return context.output;
  }
}
```

### 2.2 内置中间件

```typescript
// src/core/middlewares/index.ts

/** 日志中间件 */
export const loggingMiddleware: Middleware = async (ctx, next) => {
  console.log(`[Node ${ctx.nodeName}] Starting execution`);
  const start = Date.now();
  
  try {
    await next();
    ctx.duration = Date.now() - start;
    console.log(`[Node ${ctx.nodeName}] Completed in ${ctx.duration}ms`);
  } catch (error: any) {
    ctx.error = error;
    ctx.duration = Date.now() - start;
    console.error(`[Node ${ctx.nodeName}] Failed after ${ctx.duration}ms: ${error.message}`);
    throw error;
  }
};

/** 指标收集中间件 */
export const metricsMiddleware: Middleware = async (ctx, next) => {
  const start = Date.now();
  
  try {
    await next();
    ctx.metadata.success = true;
  } catch (error: any) {
    ctx.metadata.success = false;
    throw error;
  } finally {
    ctx.metadata.duration = Date.now() - start;
  }
};

/** 超时中间件 */
export const timeoutMiddleware = (timeoutMs: number): Middleware => {
  return async (ctx, next) => {
    let timeoutId: NodeJS.Timeout;
    
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
};

/** 重试中间件 */
export const retryMiddleware = (policy: RetryPolicy): Middleware => {
  return async (ctx, next) => {
    await runWithRetry(next, policy, { nodeId: ctx.nodeId });
  };
};
```

---

## 三、生命周期钩子 (P1)

### 3.1 生命周期类型

```typescript
// src/core/lifecycle.ts

/**
 * 生命周期事件
 */
export type LifecycleEvent =
  | 'graph:beforeStart'
  | 'graph:afterEnd'
  | 'graph:onError'
  | 'node:beforeExecute'
  | 'node:afterExecute'
  | 'node:onError'
  | 'edge:beforeTraverse'
  | 'edge:afterTraverse';

/**
 * 生命周期钩子
 */
export type LifecycleHook = (
  event: LifecycleEvent,
  context: Record<string, unknown>
) => void | Promise<void>;

/**
 * 生命周期管理器
 */
export class LifecycleManager {
  private hooks: Map<LifecycleEvent, LifecycleHook[]> = new Map();

  on(event: LifecycleEvent, hook: LifecycleHook): this {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }
    this.hooks.get(event)!.push(hook);
    return this;
  }

  async emit(event: LifecycleEvent, context: Record<string, unknown>): Promise<void> {
    const hooks = this.hooks.get(event) || [];
    for (const hook of hooks) {
      await hook(event, context);
    }
  }
}
```

---

## 四、配置验证 (P1)

### 4.1 Schema 验证

```typescript
// src/core/validation.ts
import { z } from 'zod';

/**
 * Agent 配置 Schema
 */
export const AgentConfigSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(1).max(128),
  role: z.string().min(1).max(256),
  systemPrompt: z.string().min(1),
  tools: z.array(z.string()).optional(),
  model: z.object({
    provider: z.string(),
    name: z.string(),
    params: z.record(z.unknown()).optional(),
  }).optional(),
  behavior: z.object({
    isAsync: z.boolean().optional(),
    timeout: z.number().positive().optional(),
    retryPolicy: z.object({
      maxAttempts: z.number().int().positive(),
      initialInterval: z.number().positive(),
      maxInterval: z.number().positive(),
      backoffFactor: z.number().positive(),
      jitter: z.boolean(),
    }).optional(),
  }).optional(),
});

/**
 * 图配置 Schema
 */
export const GraphConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  executionMode: z.enum(['lightweight', 'langgraph']),
  entryPoint: z.string(),
  nodes: z.array(AgentConfigSchema).min(1),
  edges: z.array(z.object({
    source: z.string(),
    target: z.string(),
    type: z.enum(['direct', 'conditional']),
    condition: z.object({
      keywords: z.array(z.string()).optional(),
      expression: z.string().optional(),
    }).optional(),
  })),
});

/**
 * 验证配置
 */
export function validateGraphConfig(config: unknown): z.SafeParseReturnType<unknown, any> {
  return GraphConfigSchema.safeParse(config);
}
```

---

## 五、性能优化 (P2)

### 5.1 连接池

```typescript
// src/core/pool.ts

/**
 * 连接池
 */
export class ConnectionPool<T> {
  private pool: T[] = [];
  private waiting: Array<(conn: T) => void> = [];

  constructor(
    private factory: () => Promise<T>,
    private maxConnections: number = 10
  ) {}

  async acquire(): Promise<T> {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }

    if (this.waiting.length < this.maxConnections) {
      return this.factory();
    }

    // 等待连接释放
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(conn: T): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      next(conn);
    } else {
      this.pool.push(conn);
    }
  }
}
```

### 5.2 批处理

```typescript
// src/core/batch.ts

/**
 * 批处理器
 */
export class BatchProcessor<T, R> {
  private queue: Array<{ item: T; resolve: (result: R) => void; reject: (error: Error) => void }> = [];
  private timeoutId: NodeJS.Timeout | null = null;

  constructor(
    private processor: (items: T[]) => Promise<R[]>,
    private options: {
      maxBatchSize: number;
      maxWaitMs: number;
    }
  ) {}

  async process(item: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.queue.push({ item, resolve, reject });

      if (this.queue.length >= this.options.maxBatchSize) {
        this.flush();
      } else if (!this.timeoutId) {
        this.timeoutId = setTimeout(() => this.flush(), this.options.maxWaitMs);
      }
    });
  }

  private async flush(): Promise<void> {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    const batch = this.queue.splice(0, this.queue.length);
    if (batch.length === 0) return;

    try {
      const results = await this.processor(batch.map(b => b.item));
      batch.forEach((b, i) => b.resolve(results[i]));
    } catch (error: any) {
      batch.forEach(b => b.reject(error));
    }
  }
}
```

---

## 六、可观测性 (P2)

### 6.1 结构化日志

```typescript
// src/core/logger.ts

/**
 * 日志级别
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 结构化日志
 */
export class Logger {
  constructor(private context: string) {}

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...data,
    };
    console.log(JSON.stringify(entry));
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log('error', message, {
      ...data,
      error: error ? { name: error.name, message: error.message, stack: error.stack } : undefined,
    });
  }
}
```

### 6.2 追踪

```typescript
// src/core/tracing.ts

/**
 * 追踪上下文
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

/**
 * 追踪器
 */
export class Tracer {
  private spans: Map<string, { start: number; end?: number; metadata: Record<string, unknown> }> = new Map();

  startSpan(name: string, parent?: TraceContext): TraceContext {
    const spanId = crypto.randomUUID();
    this.spans.set(spanId, { start: Date.now(), metadata: { name } });
    return { traceId: parent?.traceId || spanId, spanId, parentSpanId: parent?.spanId };
  }

  endSpan(spanId: string): void {
    const span = this.spans.get(spanId);
    if (span) {
      span.end = Date.now();
    }
  }

  getSpan(spanId: string): { duration: number; metadata: Record<string, unknown> } | undefined {
    const span = this.spans.get(spanId);
    if (!span || !span.end) return undefined;
    return { duration: span.end - span.start, metadata: span.metadata };
  }
}
```

---

## 七、优化实施计划

| 优化项 | 优先级 | 预计工时 | 依赖 | 状态 |
|--------|--------|----------|------|------|
| 错误类型定义 | P0 | 1h | 无 | ✅ 完成 |
| 重试策略 | P0 | 2h | 错误类型 | ✅ 完成 |
| 中间件系统 | P1 | 3h | 错误类型 | ✅ 完成 |
| 生命周期钩子 | P1 | 2h | 无 | ✅ 完成 |
| 配置验证 | P1 | 1h | zod | ✅ 完成 |
| 性能优化 | P2 | 4h | 无 | 🔲 待实施 |
| 可观测性 | P2 | 2h | 无 | 🔲 待实施 |

---

*基于 LangGraph、CrewAI、Swarm 最佳实践*
*日期: 2026-04-01*