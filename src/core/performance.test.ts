/**
 * 性能优化工具测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LazyLoader,
  ParallelExecutor,
  ChunkProcessor,
  PerformanceMonitor,
  getPerformanceMonitor,
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
      expect(testMetric?.avg).toBeGreaterThanOrEqual(10);
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