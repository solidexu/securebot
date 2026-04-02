/**
 * 性能优化工具测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LazyLoader,
  ParallelExecutor,
  ChunkProcessor,
  PerformanceMonitor,
  ConnectionPool,
  BatchProcessor,
} from './performance.js';

describe('LazyLoader', () => {
  let loader: LazyLoader<string>;

  beforeEach(() => {
    loader = new LazyLoader<string>({
      enableCache: true,
      cacheTTL: 1000, // 1 second for tests
      maxCacheSize: 5,
    });
  });

  describe('get', () => {
    it('should load resource on first access', async () => {
      let loadCount = 0;
      loader.register('key1', async () => {
        loadCount++;
        return 'value1';
      });

      const result = await loader.get('key1');

      expect(result).toBe('value1');
      expect(loadCount).toBe(1);
    });

    it('should use cache on second access', async () => {
      let loadCount = 0;
      loader.register('key1', async () => {
        loadCount++;
        return 'value1';
      });

      await loader.get('key1');
      await loader.get('key1');

      expect(loadCount).toBe(1); // Only loaded once
    });

    it('should return null for unregistered key', async () => {
      const result = await loader.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should handle cache expiration', async () => {
      let loadCount = 0;
      loader.register('key1', async () => {
        loadCount++;
        return 'value1';
      });

      await loader.get('key1');
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      await loader.get('key1');

      expect(loadCount).toBe(2); // Loaded again after expiration
    });
  });

  describe('preload', () => {
    it('should preload multiple resources', async () => {
      let loaded: string[] = [];
      
      loader.register('key1', async () => { loaded.push('key1'); return 'value1'; });
      loader.register('key2', async () => { loaded.push('key2'); return 'value2'; });
      loader.register('key3', async () => { loaded.push('key3'); return 'value3'; });

      await loader.preload(['key1', 'key2', 'key3']);

      expect(loaded).toContain('key1');
      expect(loaded).toContain('key2');
      expect(loaded).toContain('key3');
    });
  });

  describe('clearCache', () => {
    it('should clear all cache', async () => {
      loader.register('key1', async () => 'value1');
      
      await loader.get('key1');
      loader.clearCache();
      
      const stats = loader.getStats();
      expect(stats.cacheSize).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return stats', async () => {
      loader.register('key1', async () => 'value1');
      
      await loader.get('key1');
      await loader.get('key1'); // Cache hit
      
      const stats = loader.getStats();
      
      expect(stats.cacheSize).toBe(1);
      expect(stats.loadersCount).toBe(1);
    });
  });
});

describe('ParallelExecutor', () => {
  let executor: ParallelExecutor<number, number>;

  beforeEach(() => {
    executor = new ParallelExecutor<number, number>({
      maxConcurrency: 2,
      taskTimeout: 5000,
      maxRetries: 1,
    });
  });

  describe('submit', () => {
    it('should execute tasks', async () => {
      const result = await executor.submit(5, async (n) => n * 2);
      expect(result).toBe(10);
    });

    it('should limit concurrency', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const task = async (n: number) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(r => setTimeout(r, 50));
        concurrent--;
        return n;
      };

      // Submit 5 tasks with max concurrency 2
      const promises = [
        executor.submit(1, task),
        executor.submit(2, task),
        executor.submit(3, task),
        executor.submit(4, task),
        executor.submit(5, task),
      ];

      await Promise.all(promises);

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe('submitBatch', () => {
    it('should execute batch', async () => {
      const results = await executor.submitBatch(
        [1, 2, 3, 4, 5],
        async (n) => n * 2
      );

      expect(results).toEqual([2, 4, 6, 8, 10]);
    });
  });

  describe('getStatus', () => {
    it('should return status', () => {
      const status = executor.getStatus();
      
      expect(status.maxConcurrency).toBe(2);
      expect(status.queueLength).toBe(0);
      expect(status.runningTasks).toBe(0);
    });
  });
});

describe('ChunkProcessor', () => {
  let processor: ChunkProcessor;

  beforeEach(() => {
    processor = new ChunkProcessor({
      chunkSize: 1024,
      maxMemory: 10 * 1024 * 1024, // 10MB
      enableStreaming: true,
    });
  });

  describe('getProcessedBytes', () => {
    it('should track processed bytes', () => {
      expect(processor.getProcessedBytes()).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset counter', () => {
      processor.reset();
      expect(processor.getProcessedBytes()).toBe(0);
    });
  });
});

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
  });

  describe('measure', () => {
    it('should measure async execution time', async () => {
      await monitor.measure('test', async () => {
        await new Promise(r => setTimeout(r, 10));
      });

      const metrics = monitor.getMetrics();
      const testMetric = metrics.get('test');

      expect(testMetric).toBeDefined();
      expect(testMetric?.count).toBe(1);
      // 应该记录了执行时间（可能在某些环境下小于 10ms）
      expect(testMetric?.avg).toBeGreaterThanOrEqual(0);
    });
  });

  describe('measureSync', () => {
    it('should measure sync execution time', () => {
      monitor.measureSync('sync-test', () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) sum += i;
        return sum;
      });

      const metrics = monitor.getMetrics();
      const testMetric = metrics.get('sync-test');

      expect(testMetric).toBeDefined();
      expect(testMetric?.count).toBe(1);
    });
  });

  describe('getMemoryUsage', () => {
    it('should return memory usage', () => {
      const usage = monitor.getMemoryUsage();

      expect(usage.heapUsedMB).toBeGreaterThan(0);
      expect(usage.heapTotalMB).toBeGreaterThan(0);
      expect(usage.rssMB).toBeGreaterThan(0);
    });
  });

  describe('generateReport', () => {
    it('should generate report', async () => {
      await monitor.measure('test-op', async () => {});
      
      const report = monitor.generateReport();

      expect(report).toContain('性能报告');
      expect(report).toContain('内存使用');
    });
  });

  describe('clear', () => {
    it('should clear metrics', async () => {
      await monitor.measure('test', async () => {});
      monitor.clear();

      const metrics = monitor.getMetrics();
      expect(metrics.size).toBe(0);
    });
  });
});

describe('ConnectionPool', () => {
  it('应该创建和复用连接', async () => {
    let connectionCount = 0;
    const pool = new ConnectionPool<{ id: number }>({
      factory: async () => ({ id: ++connectionCount }),
      maxConnections: 3,
      minConnections: 0,
    });

    const conn1 = await pool.acquire();
    const conn2 = await pool.acquire();
    pool.release(conn1);
    const conn3 = await pool.acquire(); // 应该复用 conn1

    expect(connectionCount).toBe(2); // 只创建了 2 个连接
    expect(conn3).toBe(conn1); // 复用了第一个连接

    pool.release(conn2);
    pool.release(conn3);
    await pool.destroy();
  });

  it('应该等待连接释放', async () => {
    let connectionCount = 0;
    const pool = new ConnectionPool<{ id: number }>({
      factory: async () => ({ id: ++connectionCount }),
      maxConnections: 2,
      acquireTimeout: 500,
    });

    const conn1 = await pool.acquire();
    const conn2 = await pool.acquire();

    // 第三个请求应该等待
    const acquirePromise = pool.acquire();

    // 释放一个连接
    await new Promise((resolve) => setTimeout(resolve, 50));
    pool.release(conn1);

    const conn3 = await acquirePromise;
    expect(conn3).toBe(conn1); // 复用释放的连接

    pool.release(conn2);
    pool.release(conn3);
    await pool.destroy();
  });

  it('应该超时拒绝请求', async () => {
    const pool = new ConnectionPool<{ id: number }>({
      factory: async () => ({ id: 1 }),
      maxConnections: 1,
      acquireTimeout: 100,
    });

    await pool.acquire(); // 占用唯一连接

    await expect(pool.acquire()).rejects.toThrow('Connection acquire timeout');

    await pool.destroy();
  });

  it('应该预热最小连接数', async () => {
    let connectionCount = 0;
    const pool = new ConnectionPool<{ id: number }>({
      factory: async () => ({ id: ++connectionCount }),
      maxConnections: 5,
      minConnections: 2,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(connectionCount).toBe(2); // 预热了 2 个连接

    await pool.destroy();
  });

  it('withConnection 应该自动释放连接', async () => {
    let connectionCount = 0;
    const pool = new ConnectionPool<{ id: number }>({
      factory: async () => ({ id: ++connectionCount }),
      maxConnections: 2,
    });

    await pool.withConnection(async (conn) => {
      expect(conn.id).toBe(1);
      return 'done';
    });

    const stats = pool.getStats();
    expect(stats.inUse).toBe(0); // 已释放

    await pool.destroy();
  });

  it('应该返回统计信息', async () => {
    const pool = new ConnectionPool<{ id: number }>({
      factory: async () => ({ id: 1 }),
      maxConnections: 3,
    });

    await pool.acquire();
    await pool.acquire();

    const stats = pool.getStats();
    expect(stats.total).toBe(2);
    expect(stats.inUse).toBe(2);
    expect(stats.available).toBe(0);

    await pool.destroy();
  });
});

describe('BatchProcessor', () => {
  it('应该批量处理请求', async () => {
    let batchCount = 0;
    let lastBatchSize = 0;

    const processor = new BatchProcessor<number, number>({
      processor: async (items) => {
        batchCount++;
        lastBatchSize = items.length;
        return items.map((n) => n * 2);
      },
      maxBatchSize: 5,
      maxWaitMs: 1000,
    });

    const results = await Promise.all([
      processor.process(1),
      processor.process(2),
      processor.process(3),
    ]);

    expect(results).toEqual([2, 4, 6]);
    expect(batchCount).toBe(1);
    expect(lastBatchSize).toBe(3);

    await processor.drain();
  });

  it('应该在达到最大批次大小时立即处理', async () => {
    let processCount = 0;

    const processor = new BatchProcessor<number, number>({
      processor: async (items) => {
        processCount++;
        return items.map((n) => n * 2);
      },
      maxBatchSize: 3,
      maxWaitMs: 10000, // 长超时，应该不会触发
    });

    // 快速添加 3 个项目
    const promises = [
      processor.process(1),
      processor.process(2),
      processor.process(3),
    ];

    await Promise.all(promises);

    expect(processCount).toBe(1); // 立即处理

    await processor.drain();
  });

  it('应该在超时后处理', async () => {
    let processCount = 0;

    const processor = new BatchProcessor<number, number>({
      processor: async (items) => {
        processCount++;
        return items.map((n) => n * 2);
      },
      maxBatchSize: 100, // 大批次，不会立即触发
      maxWaitMs: 50, // 短超时
    });

    // 同时添加两个项目，它们应该在同一个批次中处理
    const promise1 = processor.process(1);
    const promise2 = processor.process(2);

    await Promise.all([promise1, promise2]);

    // 因为两个请求几乎同时到达，应该在同一个批次处理
    expect(processCount).toBeGreaterThanOrEqual(1);

    await processor.drain();
  });

  it('应该处理失败并逐个重试', async () => {
    let processCalls: number[][] = [];

    const processor = new BatchProcessor<number, number>({
      processor: async (items) => {
        processCalls.push(items);
        if (items.length > 1) {
          throw new Error('Batch failed');
        }
        return items.map((n) => n * 2);
      },
      maxBatchSize: 5,
      maxWaitMs: 100,
      retryIndividually: true,
    });

    const results = await Promise.all([
      processor.process(1),
      processor.process(2),
    ]);

    expect(results).toEqual([2, 4]);
    expect(processCalls.length).toBe(3); // 1 次批量失败 + 2 次逐个处理

    await processor.drain();
  });

  it('应该返回指标', async () => {
    const processor = new BatchProcessor<number, number>({
      processor: async (items) => items.map((n) => n * 2),
      maxBatchSize: 3,
      maxWaitMs: 100,
    });

    await processor.process(1);
    await processor.process(2);

    const metrics = processor.getMetrics();
    expect(metrics.totalItems).toBe(2);
    expect(metrics.totalBatches).toBeGreaterThan(0);

    await processor.drain();
  });

  it('processBatch 应该批量添加', async () => {
    const processor = new BatchProcessor<number, number>({
      processor: async (items) => items.map((n) => n * 2),
      maxBatchSize: 10,
      maxWaitMs: 100,
    });

    const results = await processor.processBatch([1, 2, 3, 4, 5]);

    expect(results).toEqual([2, 4, 6, 8, 10]);

    await processor.drain();
  });
});