/**
 * 分布式追踪模块
 * 
 * 提供跨服务的请求追踪能力
 */

import { v4 as uuidv4 } from 'uuid';
import { getLogger, Logger } from './logger.js';

// ============ 类型定义 ============

/**
 * 追踪上下文
 */
export interface TraceContext {
  /** 追踪 ID（整个请求链路唯一） */
  traceId: string;
  /** 当前 Span ID */
  spanId: string;
  /** 父 Span ID */
  parentSpanId?: string;
  /** 采样标记 */
  sampled?: boolean;
  /** Baggage（跨服务传递的元数据） */
  baggage?: Record<string, string>;
}

/**
 * Span 状态
 */
export type SpanStatus = 'started' | 'completed' | 'failed';

/**
 * Span 数据
 */
export interface SpanData {
  /** Span ID */
  spanId: string;
  /** 追踪 ID */
  traceId: string;
  /** 父 Span ID */
  parentSpanId?: string;
  /** Span 名称 */
  name: string;
  /** 开始时间（毫秒时间戳） */
  start: number;
  /** 结束时间（毫秒时间戳） */
  end?: number;
  /** 持续时间（毫秒） */
  duration?: number;
  /** Span 状态 */
  status: SpanStatus;
  /** 元数据 */
  metadata: Record<string, unknown>;
  /** 错误信息 */
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * 追踪配置
 */
export interface TracingConfig {
  /** 是否启用追踪 */
  enabled: boolean;
  /** 采样率 (0-1) */
  sampleRate: number;
  /** 最大 Span 数量 */
  maxSpans: number;
  /** Span 导出器 */
  exporter?: SpanExporter;
}

/**
 * Span 导出器接口
 */
export interface SpanExporter {
  /** 导出 Span */
  export(spans: SpanData[]): Promise<void> | void;
  /** 刷新缓冲区 */
  flush?(): Promise<void> | void;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: TracingConfig = {
  enabled: true,
  sampleRate: 1.0,
  maxSpans: 1000,
};

// ============ 追踪器 ============

/**
 * 分布式追踪器
 * 
 * 记录请求链路中的所有操作
 */
export class Tracer {
  private name: string;
  private config: TracingConfig;
  private spans: Map<string, SpanData> = new Map();
  private logger: Logger;
  private context?: TraceContext;

  constructor(name: string, config: Partial<TracingConfig> = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = getLogger(`tracer:${name}`);
  }

  /**
   * 开始新的追踪
   */
  startTrace(baggage?: Record<string, string>): TraceContext {
    const traceId = uuidv4();
    const spanId = uuidv4();
    const sampled = Math.random() < this.config.sampleRate;

    this.context = {
      traceId,
      spanId,
      sampled,
      baggage,
    };

    this.logger.debug('Trace started', { traceId, sampled });
    return this.context;
  }

  /**
   * 从上下文恢复追踪
   */
  continueTrace(context: TraceContext): void {
    this.context = context;
    this.logger.debug('Trace continued', { traceId: context.traceId });
  }

  /**
   * 获取当前上下文
   */
  getContext(): TraceContext | undefined {
    return this.context;
  }

  /**
   * 开始 Span
   */
  startSpan(name: string, parent?: TraceContext): TraceContext {
    if (!this.config.enabled) {
      return { traceId: '', spanId: '' };
    }

    const spanId = uuidv4();
    const traceId = parent?.traceId || this.context?.traceId || uuidv4();
    const parentSpanId = parent?.spanId || this.context?.spanId;

    const span: SpanData = {
      spanId,
      traceId,
      parentSpanId,
      name,
      start: Date.now(),
      status: 'started',
      metadata: {},
    };

    // 检查 Span 数量限制
    if (this.spans.size >= this.config.maxSpans) {
      this.evictOldSpans();
    }

    this.spans.set(spanId, span);

    const context: TraceContext = {
      traceId,
      spanId,
      parentSpanId,
      sampled: parent?.sampled ?? this.context?.sampled ?? true,
      baggage: parent?.baggage ?? this.context?.baggage,
    };

    this.logger.debug('Span started', { spanId, name, traceId });
    return context;
  }

  /**
   * 结束 Span
   */
  endSpan(spanId: string, error?: Error): void {
    if (!this.config.enabled) {
      return;
    }

    const span = this.spans.get(spanId);
    if (!span) {
      this.logger.warn('Span not found', { spanId });
      return;
    }

    span.end = Date.now();
    span.duration = span.end - span.start;
    span.status = error ? 'failed' : 'completed';

    if (error) {
      span.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    this.logger.debug('Span ended', {
      spanId,
      name: span.name,
      duration: span.duration,
      status: span.status,
    });

    // 导出 Span
    if (this.config.exporter) {
      this.config.exporter.export([span]);
    }
  }

  /**
   * 在 Span 中执行操作
   */
  async withSpan<T>(name: string, fn: (context: TraceContext) => Promise<T>, parent?: TraceContext): Promise<T> {
    const context = this.startSpan(name, parent);
    try {
      const result = await fn(context);
      this.endSpan(context.spanId);
      return result;
    } catch (error) {
      this.endSpan(context.spanId, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * 同步执行 Span
   */
  withSpanSync<T>(name: string, fn: (context: TraceContext) => T, parent?: TraceContext): T {
    const context = this.startSpan(name, parent);
    try {
      const result = fn(context);
      this.endSpan(context.spanId);
      return result;
    } catch (error) {
      this.endSpan(context.spanId, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * 添加 Span 元数据
   */
  addSpanMetadata(spanId: string, key: string, value: unknown): void {
    const span = this.spans.get(spanId);
    if (span) {
      span.metadata[key] = value;
    }
  }

  /**
   * 获取 Span
   */
  getSpan(spanId: string): SpanData | undefined {
    return this.spans.get(spanId);
  }

  /**
   * 获取所有 Span
   */
  getSpans(): SpanData[] {
    return Array.from(this.spans.values());
  }

  /**
   * 获取追踪树
   */
  getTraceTree(): Map<string, SpanData[]> {
    const tree = new Map<string, SpanData[]>();

    for (const span of this.spans.values()) {
      const parentKey = span.parentSpanId || 'root';
      if (!tree.has(parentKey)) {
        tree.set(parentKey, []);
      }
      tree.get(parentKey)!.push(span);
    }

    return tree;
  }

  /**
   * 清除所有 Span
   */
  clear(): void {
    this.spans.clear();
    this.context = undefined;
  }

  /**
   * 导出所有 Span
   */
  async export(): Promise<void> {
    if (this.config.exporter) {
      await this.config.exporter.export(this.getSpans());
    }
  }

  /**
   * 刷新导出缓冲区
   */
  async flush(): Promise<void> {
    if (this.config.exporter?.flush) {
      await this.config.exporter.flush();
    }
  }

  /**
   * 清理旧的 Span
   */
  private evictOldSpans(): void {
    // 按开始时间排序，移除最旧的 10%
    const entries = Array.from(this.spans.entries())
      .sort((a, b) => a[1].start - b[1].start);

    const toRemove = Math.floor(this.config.maxSpans * 0.1);
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      this.spans.delete(entries[i][0]);
    }

    this.logger.debug('Evicted old spans', { count: toRemove });
  }
}

// ============ 内置导出器 ============

/**
 * 控制台导出器
 */
export class ConsoleExporter implements SpanExporter {
  export(spans: SpanData[]): void {
    for (const span of spans) {
      console.log(JSON.stringify({
        type: 'span',
        ...span,
      }));
    }
  }
}

/**
 * 批量导出器
 */
export class BatchExporter implements SpanExporter {
  private buffer: SpanData[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(
    private delegate: SpanExporter,
    private batchSize: number = 100,
    private flushIntervalMs: number = 5000
  ) {
    this.flushInterval = setInterval(() => this.flush(), flushIntervalMs);
  }

  export(spans: SpanData[]): void {
    this.buffer.push(...spans);
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const spans = this.buffer.splice(0, this.buffer.length);
    await this.delegate.export(spans);
  }

  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush();
  }
}

// ============ 全局追踪器 ============

let globalTracer: Tracer | null = null;

/**
 * 获取全局追踪器
 */
export function getTracer(name?: string): Tracer {
  if (!globalTracer) {
    globalTracer = new Tracer(name || 'default');
  }
  return globalTracer;
}

/**
 * 配置全局追踪器
 */
export function configureTracer(config: Partial<TracingConfig>): void {
  globalTracer = new Tracer('default', config);
}

/**
 * 便捷方法：在追踪中执行
 */
export async function traced<T>(name: string, fn: (context: TraceContext) => Promise<T>): Promise<T> {
  return getTracer().withSpan(name, fn);
}