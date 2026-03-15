/**
 * 性能优化工具
 * 
 * 提供懒加载、并行执行、分块处理等优化功能
 */

import { existsSync, statSync, createReadStream, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ============ 类型定义 ============

/**
 * 懒加载器配置
 */
export interface LazyLoaderConfig {
  /** 是否启用缓存 */
  enableCache: boolean;
  /** 缓存过期时间（毫秒） */
  cacheTTL: number;
  /** 最大缓存条目 */
  maxCacheSize: number;
}

/**
 * 并行执行配置
 */
export interface ParallelExecutorConfig {
  /** 最大并发数 */
  maxConcurrency: number;
  /** 单个任务超时（毫秒） */
  taskTimeout: number;
  /** 失败重试次数 */
  maxRetries: number;
}

/**
 * 分块处理配置
 */
export interface ChunkProcessorConfig {
  /** 块大小（字节） */
  chunkSize: number;
  /** 最大内存占用（字节） */
  maxMemory: number;
  /** 是否启用流式处理 */
  enableStreaming: boolean;
}

/**
 * 性能监控数据
 */
export interface PerformanceMetrics {
  /** 内存使用（MB） */
  memoryUsageMB: number;
  /** 缓存命中率 */
  cacheHitRate: number;
  /** 平均执行时间（毫秒） */
  avgExecutionTime: number;
  /** 并发任务数 */
  concurrentTasks: number;
  /** 处理的字节数 */
  bytesProcessed: number;
}

// ============ 默认配置 ============

const DEFAULT_LAZY_CONFIG: LazyLoaderConfig = {
  enableCache: true,
  cacheTTL: 5 * 60 * 1000, // 5 分钟
  maxCacheSize: 100,
};

const DEFAULT_PARALLEL_CONFIG: ParallelExecutorConfig = {
  maxConcurrency: 4,
  taskTimeout: 30000, // 30 秒
  maxRetries: 2,
};

const DEFAULT_CHUNK_CONFIG: ChunkProcessorConfig = {
  chunkSize: 64 * 1024, // 64KB
  maxMemory: 100 * 1024 * 1024, // 100MB
  enableStreaming: true,
};

// ============ 懒加载器 ============

/**
 * 懒加载缓存项
 */
interface CacheEntry<T> {
  data: T;
  loadedAt: number;
  accessCount: number;
}

/**
 * 懒加载器
 * 
 * 延迟加载资源，支持缓存和自动清理
 */
export class LazyLoader<T> {
  private config: LazyLoaderConfig;
  private cache: Map<string, CacheEntry<T>> = new Map();
  private loaders: Map<string, () => Promise<T>> = new Map();
  private loading: Map<string, Promise<T>> = new Map();

  constructor(config: Partial<LazyLoaderConfig> = {}) {
    this.config = { ...DEFAULT_LAZY_CONFIG, ...config };
  }

  /**
   * 注册加载器
   */
  register(key: string, loader: () => Promise<T>): void {
    this.loaders.set(key, loader);
  }

  /**
   * 获取资源（懒加载）
   */
  async get(key: string): Promise<T | null> {
    // 检查缓存
    if (this.config.enableCache) {
      const cached = this.cache.get(key);
      if (cached) {
        // 检查是否过期
        if (Date.now() - cached.loadedAt < this.config.cacheTTL) {
          cached.accessCount++;
          return cached.data;
        }
        // 过期，删除缓存
        this.cache.delete(key);
      }
    }

    // 检查是否正在加载
    const loading = this.loading.get(key);
    if (loading) {
      return loading;
    }

    // 获取加载器
    const loader = this.loaders.get(key);
    if (!loader) {
      return null;
    }

    // 开始加载
    const promise = loader();
    this.loading.set(key, promise);

    try {
      const data = await promise;

      // 缓存结果
      if (this.config.enableCache) {
        this.cache.set(key, {
          data,
          loadedAt: Date.now(),
          accessCount: 1,
        });

        // 清理超出的缓存
        this.cleanupCache();
      }

      return data;
    } finally {
      this.loading.delete(key);
    }
  }

  /**
   * 预加载资源
   */
  async preload(keys: string[]): Promise<void> {
    await Promise.all(keys.map(key => this.get(key)));
  }

  /**
   * 清除缓存
   */
  clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * 清理超出限制的缓存
   */
  private cleanupCache(): void {
    if (this.cache.size <= this.config.maxCacheSize) {
      return;
    }

    // 按访问次数排序，移除访问最少的
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].accessCount - b[1].accessCount);

    const toRemove = entries.slice(0, entries.length - this.config.maxCacheSize);
    for (const [key] of toRemove) {
      this.cache.delete(key);
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(): {
    cacheSize: number;
    loadersCount: number;
    loadingCount: number;
    hitRate: number;
  } {
    let totalAccess = 0;
    let cacheHits = 0;

    for (const entry of this.cache.values()) {
      totalAccess += entry.accessCount;
      if (entry.accessCount > 1) {
        cacheHits += entry.accessCount - 1;
      }
    }

    return {
      cacheSize: this.cache.size,
      loadersCount: this.loaders.size,
      loadingCount: this.loading.size,
      hitRate: totalAccess > 0 ? cacheHits / totalAccess : 0,
    };
  }
}

// ============ 并行执行器 ============

/**
 * 任务队列项
 */
interface TaskItem<T, R> {
  id: string;
  input: T;
  execute: (input: T) => Promise<R>;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
  retries: number;
}

/**
 * 并行执行器
 * 
 * 限制并发数的并行任务执行
 */
export class ParallelExecutor<T, R> {
  private config: ParallelExecutorConfig;
  private queue: TaskItem<T, R>[] = [];
  private running: number = 0;
  private taskId: number = 0;

  constructor(config: Partial<ParallelExecutorConfig> = {}) {
    this.config = { ...DEFAULT_PARALLEL_CONFIG, ...config };
  }

  /**
   * 提交任务
   */
  async submit(input: T, executor: (input: T) => Promise<R>): Promise<R> {
    return new Promise((resolve, reject) => {
      const task: TaskItem<T, R> = {
        id: `task-${++this.taskId}`,
        input,
        execute: executor,
        resolve,
        reject,
        retries: 0,
      };

      this.queue.push(task);
      this.processQueue();
    });
  }

  /**
   * 批量提交
   */
  async submitBatch(inputs: T[], executor: (input: T) => Promise<R>): Promise<R[]> {
    return Promise.all(inputs.map(input => this.submit(input, executor)));
  }

  /**
   * 处理队列
   */
  private processQueue(): void {
    while (this.running < this.config.maxConcurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;

      this.running++;
      this.executeTask(task);
    }
  }

  /**
   * 执行任务
   */
  private async executeTask(task: TaskItem<T, R>): Promise<void> {
    try {
      const result = await this.withTimeout(
        task.execute(task.input),
        this.config.taskTimeout
      );
      task.resolve(result);
    } catch (error) {
      // 重试
      if (task.retries < this.config.maxRetries) {
        task.retries++;
        this.queue.unshift(task);
      } else {
        task.reject(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      this.running--;
      this.processQueue();
    }
  }

  /**
   * 超时包装
   */
  private withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Task timeout'));
      }, timeout);

      promise
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * 获取状态
   */
  getStatus(): {
    queueLength: number;
    runningTasks: number;
    maxConcurrency: number;
  } {
    return {
      queueLength: this.queue.length,
      runningTasks: this.running,
      maxConcurrency: this.config.maxConcurrency,
    };
  }
}

// ============ 分块处理器 ============

/**
 * 分块处理器
 * 
 * 大文件分块处理，支持流式处理
 */
export class ChunkProcessor {
  private config: ChunkProcessorConfig;
  private processedBytes: number = 0;

  constructor(config: Partial<ChunkProcessorConfig> = {}) {
    this.config = { ...DEFAULT_CHUNK_CONFIG, ...config };
  }

  /**
   * 分块读取文件
   */
  async *readFileChunks(
    filePath: string,
    options?: {
      encoding?: BufferEncoding;
      start?: number;
      end?: number;
    }
  ): AsyncGenerator<string | Buffer> {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = statSync(filePath);
    const fileSize = stats.size;
    const chunkSize = this.config.chunkSize;

    const start = options?.start ?? 0;
    const end = options?.end ?? fileSize;

    if (end - start > this.config.maxMemory) {
      console.warn(`Warning: Processing large file (${Math.floor((end - start) / 1024 / 1024)}MB)`);
    }

    const stream = createReadStream(filePath, {
      start,
      end,
      highWaterMark: chunkSize,
      encoding: options?.encoding,
    });

    let bytesRead = 0;

    for await (const chunk of stream) {
      bytesRead += (chunk as Buffer).length ?? (chunk as string).length;
      this.processedBytes += bytesRead;
      yield chunk;
    }
  }

  /**
   * 分块处理文件
   */
  async processFile(
    filePath: string,
    processor: (chunk: string | Buffer, offset: number) => Promise<void>,
    options?: {
      encoding?: BufferEncoding;
    }
  ): Promise<{ totalBytes: number; chunksProcessed: number }> {
    let offset = 0;
    let chunksProcessed = 0;

    for await (const chunk of this.readFileChunks(filePath, options)) {
      await processor(chunk, offset);
      offset += (chunk as Buffer).length ?? (chunk as string).length;
      chunksProcessed++;
    }

    return {
      totalBytes: offset,
      chunksProcessed,
    };
  }

  /**
   * 流式复制文件
   */
  async copyFile(
    sourcePath: string,
    targetPath: string,
    onProgress?: (bytesCopied: number, totalBytes: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const stats = statSync(sourcePath);
      const totalBytes = stats.size;
      let bytesCopied = 0;

      const source = createReadStream(sourcePath, {
        highWaterMark: this.config.chunkSize,
      });

      const target = createWriteStream(targetPath);

      source.on('data', (chunk: Buffer) => {
        bytesCopied += chunk.length;
        this.processedBytes += chunk.length;
        onProgress?.(bytesCopied, totalBytes);
      });

      source.on('error', reject);
      target.on('error', reject);
      target.on('finish', resolve);

      source.pipe(target);
    });
  }

  /**
   * 获取处理的字节数
   */
  getProcessedBytes(): number {
    return this.processedBytes;
  }

  /**
   * 重置计数
   */
  reset(): void {
    this.processedBytes = 0;
  }
}

// ============ 性能监控 ============

/**
 * 性能监控器
 */
export class PerformanceMonitor {
  private metrics: Map<string, { total: number; count: number; max: number; min: number }> = new Map();
  private startTime: number = Date.now();

  /**
   * 记录执行时间
   */
  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      const elapsed = Date.now() - start;
      this.record(name, elapsed);
    }
  }

  /**
   * 同步测量
   */
  measureSync<T>(name: string, fn: () => T): T {
    const start = Date.now();
    try {
      return fn();
    } finally {
      const elapsed = Date.now() - start;
      this.record(name, elapsed);
    }
  }

  /**
   * 记录指标
   */
  private record(name: string, elapsed: number): void {
    const current = this.metrics.get(name);
    if (current) {
      current.total += elapsed;
      current.count++;
      current.max = Math.max(current.max, elapsed);
      current.min = Math.min(current.min, elapsed);
    } else {
      this.metrics.set(name, {
        total: elapsed,
        count: 1,
        max: elapsed,
        min: elapsed,
      });
    }
  }

  /**
   * 获取指标
   */
  getMetrics(): Map<string, {
    avg: number;
    count: number;
    max: number;
    min: number;
    total: number;
  }> {
    const result = new Map();
    for (const [name, data] of this.metrics) {
      result.set(name, {
        avg: data.total / data.count,
        count: data.count,
        max: data.max,
        min: data.min,
        total: data.total,
      });
    }
    return result;
  }

  /**
   * 获取内存使用
   */
  getMemoryUsage(): {
    heapUsedMB: number;
    heapTotalMB: number;
    externalMB: number;
    rssMB: number;
  } {
    const usage = process.memoryUsage();
    return {
      heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
      heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
      externalMB: Math.round(usage.external / 1024 / 1024 * 100) / 100,
      rssMB: Math.round(usage.rss / 1024 / 1024 * 100) / 100,
    };
  }

  /**
   * 获取运行时间
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * 生成报告
   */
  generateReport(): string {
    const lines: string[] = ['# 性能报告\n'];
    
    lines.push('## 运行时间');
    lines.push(`- ${Math.floor(this.getUptime() / 1000)} 秒\n`);

    lines.push('## 内存使用');
    const mem = this.getMemoryUsage();
    lines.push(`- 堆内存: ${mem.heapUsedMB}MB / ${mem.heapTotalMB}MB`);
    lines.push(`- RSS: ${mem.rssMB}MB`);
    lines.push(`- 外部: ${mem.externalMB}MB\n`);

    lines.push('## 执行统计');
    const metrics = this.getMetrics();
    if (metrics.size === 0) {
      lines.push('- 暂无数据\n');
    } else {
      lines.push('| 操作 | 次数 | 平均(ms) | 最大(ms) | 最小(ms) |');
      lines.push('|------|------|----------|----------|----------|');
      for (const [name, data] of metrics) {
        lines.push(`| ${name} | ${data.count} | ${data.avg.toFixed(2)} | ${data.max} | ${data.min} |`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 清除指标
   */
  clear(): void {
    this.metrics.clear();
  }
}

// ============ 全局实例 ============

let globalMonitor: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!globalMonitor) {
    globalMonitor = new PerformanceMonitor();
  }
  return globalMonitor;
}