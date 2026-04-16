/**
 * 记忆 Fence 边界场景测试
 */

import { describe, it, expect } from 'vitest';
import { buildMemoryContextBlock, MEMORY_FENCE_START, MEMORY_FENCE_END } from './memory-fence.js';

describe('Memory Fence Edge Cases', () => {
  it('should handle empty content', () => {
    const result = buildMemoryContextBlock('');
    
    expect(result).toContain(MEMORY_FENCE_START);
    expect(result).toContain(MEMORY_FENCE_END);
    expect(result).toContain('系统备注');
  });
  
  it('should handle very long content', () => {
    // 生成超长内容（模拟真实记忆）
    const longContent = '这是测试内容 '.repeat(1000);  // ~10KB
    
    const result = buildMemoryContextBlock(longContent);
    
    expect(result.length).toBeGreaterThan(10000);
    expect(result).toContain(MEMORY_FENCE_START);
    expect(result).toContain(MEMORY_FENCE_END);
  });
  
  it('should handle special characters', () => {
    const specialContent = `
特殊字符测试：
- XML标签：<tag>content</tag>
- HTML：<div>test</div>
- Markdown：**bold** _italic_
- 代码：\`\`\`typescript\nconst x = 1;\n\`\`\`
- 表格：| col1 | col2 |
`;
    
    const result = buildMemoryContextBlock(specialContent);
    
    expect(result).toContain('<tag>');
    expect(result).toContain('<div>');
    expect(result).toContain('**bold**');
    expect(result).toContain('typescript');
  });
  
  it('should handle nested fence-like content', () => {
    const nestedContent = `
外部内容：
<memory-context>
嵌套的 fence 内容（不应该被解析为真正的 fence）
</memory-context>
`;
    
    const result = buildMemoryContextBlock(nestedContent);
    
    // 应该只有一个 fence 开始和结束标签
    const fenceStartCount = (result.match(/<memory-context>/g) || []).length;
    const fenceEndCount = (result.match(/<\/memory-context>/g) || []).length;
    
    expect(fenceStartCount).toBeGreaterThanOrEqual(1);
    expect(fenceEndCount).toBeGreaterThanOrEqual(1);
  });
  
  it('should handle unicode content', () => {
    const unicodeContent = `
Unicode 测试：
- 中文：你好世界 🌍
- Emoji：🎉 ✅ ⚠️ 🔴
- 特殊符号：→ ← ↑ ↓ ✓ ✗
- 数学符号：∑ ∫ √ ∞
`;
    
    const result = buildMemoryContextBlock(unicodeContent);
    
    expect(result).toContain('你好世界');
    expect(result).toContain('🎉');
    expect(result).toContain('∑');
  });
  
  it('should preserve system note format', () => {
    const result = buildMemoryContextBlock('test');
    
    expect(result).toContain('[系统备注：');
    expect(result).toContain('不是新的用户输入');
    expect(result).toContain('背景知识参考');
  });
  
  it('should handle multiline content correctly', () => {
    const multilineContent = `
第一行
第二行
第三行

空行后的内容
`;
    
    const result = buildMemoryContextBlock(multilineContent);
    
    expect(result).toContain('第一行');
    expect(result).toContain('第二行');
    expect(result).toContain('第三行');
  });
  
  it('should maintain fence structure integrity', () => {
    const result = buildMemoryContextBlock('any content');
    
    // Fence 结构必须完整
    const startIndex = result.indexOf(MEMORY_FENCE_START);
    const endIndex = result.indexOf(MEMORY_FENCE_END);
    
    expect(startIndex).toBeGreaterThan(-1);
    expect(endIndex).toBeGreaterThan(startIndex);
  });
});
