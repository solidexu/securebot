/**
 * 追踪模块测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Tracer,
  TraceContext,
  ConsoleExporter,
  BatchExporter,
  getTracer,
  configureTracer,
  traced,
} from './tracing.js';

describe('Tracer', () => {
  let tracer: Tracer;
  let mockExporter: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockExporter = vi.fn();
    tracer = new Tracer('test', {
      exporter: { export: mockExporter },
      enabled: true,
      sampleRate: 1.0,
    });
  });

  afterEach(() => {
    tracer.clear();
  });

  describe('追踪管理', () => {
    it('应该开始新的追踪', () => {
      const context = tracer.startTrace();

      expect(context.traceId).toBeDefined();
      expect(context.spanId).toBeDefined();
      expect(context.sampled).toBe(true);
    });

    it('应该携带 baggage', () => {
      const context = tracer.startTrace({ userId: 'user-123' });

      expect(context.baggage).toBeDefined();
      expect(context.baggage?.userId).toBe('user-123');
    });

    it('应该从上下文恢复追踪', () => {
      const context: TraceContext = {
        traceId: 'trace-123',
        spanId: 'span-456',
        sampled: true,
      };

      tracer.continueTrace(context);
      const current = tracer.getContext();

      expect(current?.traceId).toBe('trace-123');
      expect(current?.spanId).toBe('span-456');
    });
  });

  describe('Span 管理', () => {
    it('应该开始和结束 Span', () => {
      const context = tracer.startSpan('test-span');

      expect(context.traceId).toBeDefined();
      expect(context.spanId).toBeDefined();

      tracer.endSpan(context.spanId);

      const span = tracer.getSpan(context.spanId);
      expect(span?.status).toBe('completed');
      expect(span?.duration).toBeDefined();
    });

    it('应该记录失败 Span', () => {
      const context = tracer.startSpan('failing-span');
      const error = new Error('span failed');

      tracer.endSpan(context.spanId, error);

      const span = tracer.getSpan(context.spanId);
      expect(span?.status).toBe('failed');
      expect(span?.error).toBeDefined();
      expect(span?.error?.message).toBe('span failed');
    });

    it('应该建立父子关系', () => {
      const parent = tracer.startSpan('parent');
      const child = tracer.startSpan('child', parent);

      tracer.endSpan(parent.spanId);
      tracer.endSpan(child.spanId);

      const childSpan = tracer.getSpan(child.spanId);
      expect(childSpan?.parentSpanId).toBe(parent.spanId);
      expect(childSpan?.traceId).toBe(parent.traceId);
    });

    it('应该添加元数据', () => {
      const context = tracer.startSpan('metadata-span');
      tracer.addSpanMetadata(context.spanId, 'key', 'value');
      tracer.endSpan(context.spanId);

      const span = tracer.getSpan(context.spanId);
      expect(span?.metadata.key).toBe('value');
    });
  });

  describe('withSpan', () => {
    it('应该自动管理 Span 生命周期', async () => {
      const result = await tracer.withSpan('auto-span', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'done';
      });

      expect(result).toBe('done');
      const spans = tracer.getSpans();
      expect(spans.length).toBeGreaterThan(0);
      expect(spans[0].status).toBe('completed');
    });

    it('应该记录失败 Span', async () => {
      try {
        await tracer.withSpan('failing-auto-span', async () => {
          throw new Error('operation failed');
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }

      const spans = tracer.getSpans();
      expect(spans[0].status).toBe('failed');
      expect(spans[0].error).toBeDefined();
    });

    it('withSpanSync 应该支持同步操作', () => {
      const result = tracer.withSpanSync('sync-span', () => {
        return 'sync-result';
      });

      expect(result).toBe('sync-result');
      const spans = tracer.getSpans();
      expect(spans[0].status).toBe('completed');
    });
  });

  describe('导出', () => {
    it('应该导出 Span', () => {
      const context = tracer.startSpan('export-span');
      tracer.endSpan(context.spanId);

      expect(mockExporter).toHaveBeenCalled();
      const exportedSpans = mockExporter.mock.calls[0][0];
      expect(exportedSpans.length).toBe(1);
      expect(exportedSpans[0].spanId).toBe(context.spanId);
    });
  });

  describe('追踪树', () => {
    it('应该构建追踪树', () => {
      const parent = tracer.startSpan('parent');
      const child1 = tracer.startSpan('child1', parent);
      const child2 = tracer.startSpan('child2', parent);

      tracer.endSpan(child1.spanId);
      tracer.endSpan(child2.spanId);
      tracer.endSpan(parent.spanId);

      const tree = tracer.getTraceTree();
      expect(tree.has(parent.spanId)).toBe(true);
      expect(tree.get(parent.spanId)?.length).toBe(2);
    });
  });

  describe('采样', () => {
    it('应该根据采样率决定是否采样', () => {
      const sampledTracer = new Tracer('sampled', { sampleRate: 0 });
      const context = sampledTracer.startTrace();

      expect(context.sampled).toBe(false);
    });
  });

  describe('Span 数量限制', () => {
    it('应该限制最大 Span 数量', () => {
      const limitedTracer = new Tracer('limited', { maxSpans: 10 });

      for (let i = 0; i < 20; i++) {
        const ctx = limitedTracer.startSpan(`span-${i}`);
        limitedTracer.endSpan(ctx.spanId);
      }

      const spans = limitedTracer.getSpans();
      expect(spans.length).toBeLessThanOrEqual(10);
    });
  });

  describe('禁用追踪', () => {
    it('禁用时不应记录 Span', () => {
      const disabledTracer = new Tracer('disabled', { enabled: false });
      const context = disabledTracer.startSpan('disabled-span');
      disabledTracer.endSpan(context.spanId);

      const spans = disabledTracer.getSpans();
      expect(spans.length).toBe(0);
    });
  });
});

describe('ConsoleExporter', () => {
  it('应该输出到控制台', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exporter = new ConsoleExporter();

    exporter.export([
      {
        spanId: 'span-1',
        traceId: 'trace-1',
        name: 'test',
        start: Date.now(),
        status: 'completed',
        metadata: {},
      },
    ]);

    expect(consoleSpy).toHaveBeenCalled();
    const output = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(output.type).toBe('span');
    expect(output.spanId).toBe('span-1');

    consoleSpy.mockRestore();
  });
});

describe('BatchExporter', () => {
  it('应该批量导出', async () => {
    const mockDelegate = vi.fn();
    const exporter = new BatchExporter(
      { export: mockDelegate },
      3, // batchSize
      1000 // flushIntervalMs
    );

    // 添加少于 batchSize 的项，不立即导出
    exporter.export([{ spanId: 'span-1', traceId: 'trace-1', name: 'test', start: Date.now(), status: 'completed', metadata: {} }]);
    exporter.export([{ spanId: 'span-2', traceId: 'trace-2', name: 'test', start: Date.now(), status: 'completed', metadata: {} }]);

    expect(mockDelegate).not.toHaveBeenCalled();

    // 达到 batchSize，立即导出
    exporter.export([{ spanId: 'span-3', traceId: 'trace-3', name: 'test', start: Date.now(), status: 'completed', metadata: {} }]);

    expect(mockDelegate).toHaveBeenCalled();
    expect(mockDelegate.mock.calls[0][0].length).toBe(3);

    exporter.stop();
  });

  it('应该定期刷新', async () => {
    const mockDelegate = vi.fn();
    const exporter = new BatchExporter(
      { export: mockDelegate },
      100, // batchSize
      50 // flushIntervalMs (短间隔便于测试)
    );

    exporter.export([{ spanId: 'span-1', traceId: 'trace-1', name: 'test', start: Date.now(), status: 'completed', metadata: {} }]);

    // 等待刷新
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockDelegate).toHaveBeenCalled();

    exporter.stop();
  });
});

describe('全局追踪器', () => {
  beforeEach(() => {
    configureTracer({ enabled: true, sampleRate: 1.0 });
  });

  it('getTracer 应该返回全局追踪器', () => {
    const tracer1 = getTracer();
    const tracer2 = getTracer();

    expect(tracer1).toBe(tracer2);
  });

  it('traced 应该创建 Span', async () => {
    const result = await traced('test-operation', async () => {
      return 'traced-result';
    });

    expect(result).toBe('traced-result');
    const tracer = getTracer();
    const spans = tracer.getSpans();
    expect(spans.length).toBeGreaterThan(0);
  });
});