/**
 * YAML 解析缓存测试（简化版）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { clearYamlCache, getYamlCacheStats } from './parser.js';

describe('YAML Parser Cache', () => {
  beforeEach(() => {
    clearYamlCache();
  });
  
  it('should start with empty cache', () => {
    const stats = getYamlCacheStats();
    expect(stats.size).toBe(0);
    expect(stats.maxSize).toBe(50);
  });
  
  it('should clear cache on demand', () => {
    clearYamlCache();
    const stats = getYamlCacheStats();
    expect(stats.size).toBe(0);
  });
  
  it('should have correct max size', () => {
    const stats = getYamlCacheStats();
    expect(stats.maxSize).toBe(50);
  });
  
  it('should return stats object', () => {
    const stats = getYamlCacheStats();
    expect(stats).toHaveProperty('size');
    expect(stats).toHaveProperty('maxSize');
  });
});
