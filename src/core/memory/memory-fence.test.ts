/**
 * 记忆 Fence 测试
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeMemoryContext,
  buildMemoryContextBlock,
  hasMemoryFence,
  extractMemoryFence,
  MEMORY_FENCE_TAG,
} from './memory-fence.js';

describe('Memory Fence', () => {
  describe('sanitizeMemoryContext', () => {
    it('should remove existing fence tags', () => {
      const input = '<memory-context>test</memory-context>';
      const result = sanitizeMemoryContext(input);
      expect(result).toBe('test');
    });

    it('should handle nested fence tags', () => {
      const input = '<memory-context><memory-context>inner</memory-context></memory-context>';
      const result = sanitizeMemoryContext(input);
      expect(result).toBe('inner');
    });

    it('should return empty string for empty input', () => {
      expect(sanitizeMemoryContext('')).toBe('');
      expect(sanitizeMemoryContext(null as any)).toBe('');
    });

    it('should preserve content without fence tags', () => {
      const input = 'Normal content without tags';
      const result = sanitizeMemoryContext(input);
      expect(result).toBe(input);
    });
  });

  describe('buildMemoryContextBlock', () => {
    it('should wrap content in fence tags', () => {
      const content = 'User profile: John Doe';
      const result = buildMemoryContextBlock(content);
      
      expect(result).toContain('<memory-context>');
      expect(result).toContain('</memory-context>');
      expect(result).toContain('系统备注');
      expect(result).toContain(content);
    });

    it('should sanitize content before wrapping', () => {
      const content = '<memory-context>existing</memory-context> new content';
      const result = buildMemoryContextBlock(content);
      
      // 应该只有一个 fence 块（外层）
      expect(result).toContain('<memory-context>');
      expect(result).not.toContain('<memory-context>existing</memory-context>');
    });

    it('should return empty string for empty content', () => {
      expect(buildMemoryContextBlock('')).toBe('');
      expect(buildMemoryContextBlock(null as any)).toBe('');
      expect(buildMemoryContextBlock('   ')).toBe('');
    });

    it('should include system note about background data', () => {
      const result = buildMemoryContextBlock('test content');
      expect(result).toContain('不是新的用户输入');
      expect(result).toContain('背景知识');
    });
  });

  describe('hasMemoryFence', () => {
    it('should detect fence tags', () => {
      expect(hasMemoryFence('<memory-context>test</memory-context>')).toBe(true);
      expect(hasMemoryFence('no fence')).toBe(false);
    });
  });

  describe('extractMemoryFence', () => {
    it('should extract fence content', () => {
      const input = '<memory-context>extracted content</memory-context>';
      const result = extractMemoryFence(input);
      expect(result).toBe('extracted content');
    });

    it('should return null for no fence', () => {
      expect(extractMemoryFence('no fence')).toBe(null);
    });
  });

  describe('MEMORY_FENCE_TAG', () => {
    it('should export tag name', () => {
      expect(MEMORY_FENCE_TAG).toBe('memory-context');
    });
  });
});
