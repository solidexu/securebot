/**
 * LRU 缓存实现
 * 
 * 用于记忆系统缓存优化
 */

/**
 * LRU 缓存
 */
export class LRUCache<K, V> {
  private cache: Map<K, V> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  /**
   * 获取值
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // 移到最后（最近使用）
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  /**
   * 设置值
   */
  set(key: K, value: V): void {
    // 如果已存在，先删除
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    // 添加到末尾
    this.cache.set(key, value);
    
    // 如果超过最大大小，删除最旧的
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  /**
   * 检查是否存在
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * 删除值
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取大小
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * 获取所有键
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * 获取所有值
   */
  values(): IterableIterator<V> {
    return this.cache.values();
  }

  /**
   * 获取所有条目
   */
  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }

  /**
   * 遍历
   */
  forEach(callback: (value: V, key: K) => void): void {
    this.cache.forEach(callback);
  }

  /**
   * 迭代器
   */
  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.cache.entries();
  }
}

/**
 * 带过期时间的缓存
 */
export class ExpiringCache<K, V> {
  private cache: Map<K, { value: V; expiresAt: number }> = new Map();
  private maxSize: number;
  private defaultTTL: number; // 默认过期时间（毫秒）

  constructor(maxSize: number = 100, defaultTTL: number = 60000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  /**
   * 获取值
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.value;
  }

  /**
   * 设置值
   */
  set(key: K, value: V, ttl?: number): void {
    // 清理过期条目
    this.cleanup();
    
    // 如果超过最大大小，删除最旧的
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl ?? this.defaultTTL),
    });
  }

  /**
   * 检查是否存在
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * 删除值
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取大小
   */
  get size(): number {
    this.cleanup();
    return this.cache.size;
  }

  /**
   * 清理过期条目
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * 简单的记忆搜索结果缓存
 */
export class SearchCache {
  private cache: ExpiringCache<string, unknown[]>;
  
  constructor(maxSize: number = 50, ttl: number = 30000) {
    this.cache = new ExpiringCache(maxSize, ttl);
  }

  /**
   * 生成缓存键
   */
  private generateKey(query: string, options?: Record<string, unknown>): string {
    const optionsStr = options ? JSON.stringify(options) : '';
    return `${query}:${optionsStr}`;
  }

  /**
   * 获取搜索结果
   */
  get<T>(query: string, options?: Record<string, unknown>): T[] | undefined {
    const key = this.generateKey(query, options);
    return this.cache.get(key) as T[] | undefined;
  }

  /**
   * 设置搜索结果
   */
  set<T>(query: string, result: T[], options?: Record<string, unknown>): void {
    const key = this.generateKey(query, options);
    this.cache.set(key, result);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }
}