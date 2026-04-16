/**
 * 记忆 Fence 边界场景测试
 */

import { describe, it, expect } from 'vitest';
import { buildMemoryContextBlock, sanitizeMemoryContext, hasMemoryFence, extractMemoryFence } from './memory-fence.js';

describe('Memory Fence Edge Cases', () => {
  it('should handle empty content', () => {
    const result = buildMemoryContextBlock('');
    expect(result).toBe('');
  });
  
  it('should handle very long content', () => {
    const longContent = '这是测试内容 '.repeat(1000);
    const result = buildMemoryContextBlock(longContent);
    expect(result.length).toBeGreaterThan(7000);
    expect(result).toContain('<memory-context>');
  });
  
  it('should handle special characters', () => {
    const specialContent = '特殊字符：<tag>test</tag>';
    const result = buildMemoryContextBlock(specialContent);
    expect(result).toContain('<tag>');
  });
  
  it('should handle unicode content', () => {
    const unicodeContent = '你好世界 🌍 🎉';
    const result = buildMemoryContextBlock(unicodeContent);
    expect(result).toContain('你好世界');
    expect(result).toContain('🎉');
  });
  
  it('should sanitize memory fence correctly', () => {
    const content = '测试 <memory-context>内容</memory-context> 更多';
    const result = sanitizeMemoryContext(content);
    expect(result).not.toContain('<memory-context>');
  });
  
  it('should detect memory fence presence', () => {
    expect(hasMemoryFence('<memory-context>内容</memory-context>')).toBe(true);
    expect(hasMemoryFence('普通内容')).toBe(false);
  });
  
  it('should extract memory fence content', () => {
    const content = '前置<memory-context>提取内容</memory-context>后置';
    const result = extractMemoryFence(content);
    expect(result).toBe('提取内容');
  });
  
  it('should handle whitespace-only content', () => {
    const result = buildMemoryContextBlock('   ');
    expect(result).toBe('');
  });
});
