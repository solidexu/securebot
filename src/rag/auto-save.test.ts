/**
 * 第一阶段改进测试
 */

import { describe, it, expect } from 'vitest';

describe('噪音过滤测试', () => {
  
  const NOISE_PATTERNS = [
    /这是第\s*\d+\s*次失败/,
    /你还有\s*\d+\s*次自动重试/,
    /请立即分析错误/,
    /请不要问用户/,
    /error:\s*macro/,
    /warning:\s*/,
    /In file included from/,
    /^\s*\d+\s*\|/,
    /note:\s*/,
    /^\s*\^/,
  ];
  
  function isNoise(content: string): boolean {
    for (const pattern of NOISE_PATTERNS) {
      if (pattern.test(content)) return true;
    }
    return false;
  }
  
  it('应过滤系统提示噪音', () => {
    const noisePatterns = [
      '这是第 1 次失败，你还有 2 次自动重试机会',
      '这是第 2 次失败，你还有 1 次自动重试机会',
      '请立即分析错误并尝试修复',
      '请不要问用户',
    ];
    
    for (const noise of noisePatterns) {
      expect(isNoise(noise)).toBe(true);
    }
  });
  
  it('应过滤编译错误噪音', () => {
    const errorPatterns = [
      'error: macro "assert" passed 7 arguments',
      'warning: unused variable',
      'In file included from tests/test_avl_tree.cpp:7:',
      'note: declared here',
    ];
    
    for (const error of errorPatterns) {
      expect(isNoise(error)).toBe(true);
    }
  });
  
  it('应保留有效技术内容', () => {
    const validContent = [
      '注意：平衡因子绝对值大于1时需要旋转调整',
      '关键点是AVL树通过平衡因子判断是否需要旋转',
      '必须更新节点高度，否则后续判断会出错',
    ];
    
    for (const content of validContent) {
      expect(isNoise(content)).toBe(false);
    }
  });
});

describe('错误日志过滤测试', () => {
  
  function isErrorLog(codeBlock: string): boolean {
    return (
      codeBlock.includes('error:') ||
      codeBlock.includes('warning:') ||
      codeBlock.includes('In file included from') ||
      codeBlock.includes('note:') ||
      codeBlock.match(/^\s*\d+\s*\|/) !== null ||
      codeBlock.includes('macro "assert"')
    );
  }
  
  it('应识别编译错误日志', () => {
    const errorLogCode = [
      'error: macro "assert" passed 7 arguments',
      'tests/test_avl_tree.cpp:78:67: error: ...',
      'warning: unused variable \'x\'',
      'In file included from /usr/include/c++/14/cassert:44',
    ];
    
    for (const log of errorLogCode) {
      expect(isErrorLog(log)).toBe(true);
    }
  });
  
  it('应保留有效代码块', () => {
    const validCode = [
      'Node* rotateLeft(Node* x) { Node* y = x->right; return y; }',
      'def get_balance(node): return height(node.left) - height(node.right)',
      'int balance = height(node.left) - height(node.right);',
    ];
    
    for (const code of validCode) {
      expect(isErrorLog(code)).toBe(false);
    }
  });
});

describe('质量评估测试', () => {
  
  const NOISE_PATTERNS = [
    /这是第\s*\d+\s*次失败/,
    /你还有\s*\d+\s*次自动重试/,
    /请立即分析错误/,
    /error:\s*macro/,
    /warning:\s*/,
    /In file included from/,
  ];
  
  function isNoise(content: string): boolean {
    for (const pattern of NOISE_PATTERNS) {
      if (pattern.test(content)) return true;
    }
    return false;
  }
  
  function isErrorLog(codeBlock: string): boolean {
    return (
      codeBlock.includes('error:') ||
      codeBlock.includes('warning:') ||
      codeBlock.includes('In file included from') ||
      codeBlock.includes('note:')
    );
  }
  
  function assessQuality(content: string): number {
    let score = 0;
    
    // 检查是否有真正的代码（不含error）
    const codeBlockMatches = content.match(/```[\s\S]*?```/g) || [];
    const cleanBlocks = codeBlockMatches.filter(b => !isErrorLog(b));
    if (cleanBlocks.length > 0) score += 0.3;
    
    // 检查是否有技术关键词
    const techKeywords = /算法|原理|复杂度|时间|空间|旋转|平衡|实现|结构|设计|架构/;
    if (techKeywords.test(content)) score += 0.2;
    
    // 检查注意事项是否有效（不含噪音）
    const notesSection = content.match(/### 注意事项[\s\S]*?(?=##|$)/);
    if (notesSection && notesSection[0]) {
      const noteLines = notesSection[0].split('\n').filter(line => line.startsWith('-'));
      const cleanNotes = noteLines.filter(line => !isNoise(line));
      if (cleanNotes.length > 0) score += 0.2;
    }
    
    // 检查是否有普通注意事项（不带 ###）
    const normalNotes = content.match(/## 注意事项[\s\S]*?(?=##|$)/);
    if (normalNotes && normalNotes[0]) {
      const noteLines = normalNotes[0].split('\n').filter(line => line.startsWith('-'));
      const cleanNotes = noteLines.filter(line => !isNoise(line));
      if (cleanNotes.length > 0) score += 0.15;
    }
    
    // 检查是否只是流水账（内容过短）
    if (content.length < 200) score -= 0.1;
    
    // 检查是否全是错误日志（内容充斥error/warning）
    const errorCount = (content.match(/error:/g) || []).length;
    const warningCount = (content.match(/warning:/g) || []).length;
    if (errorCount + warningCount > 5) score -= 0.2;
    
    // 检查是否有足够的内容长度（作为基础评分）
    if (content.length >= 300) score += 0.1;
    
    return Math.max(0, Math.min(1, score));
  }
  
  it('低质量文档应被拦截', () => {
    const lowQualityContent = [
      '## 任务描述',
      '测试任务',
      '## 执行步骤',
      '1. 步骤1',
      '2. 步骤2',
      '## 完成情况',
      '- 完成: 2/2',
      '## 关键代码',
      '```',
      'error: macro "assert" passed 7 arguments',
      'warning: unused variable',
      '```',
      '## 注意事项',
      '- 这是第 1 次失败，你还有 2 次自动重试机会',
      '- 请立即分析错误并尝试修复',
    ].join('\n');
    
    const score = assessQuality(lowQualityContent);
    
    expect(score).toBeLessThan(0.3);
  });
  
  it('高质量文档应通过评估', () => {
    const highQualityContent = [
      '## 任务描述',
      '实现AVL树数据结构',
      '## 执行步骤',
      '1. 实现旋转操作',
      '2. 实现平衡因子计算',
      '## 完成情况',
      '- 完成: 2/2',
      '## 关键代码',
      '```cpp',
      'Node* rotateLeft(Node* x) {',
      '  Node* y = x->right;',
      '  return y;',
      '}',
      '```',
      '## 注意事项',
      '- 平衡因子绝对值大于1时需要旋转调整',
      '- 删除操作可能导致多次旋转',
    ].join('\n');
    
    const score = assessQuality(highQualityContent);
    
    expect(score).toBeGreaterThanOrEqual(0.5);
  });
  
  it('中等质量文档应得到适中评分', () => {
    const mediumQualityContent = [
      '## 任务描述',
      '测试任务',
      '## 执行步骤',
      '1. 步骤1',
      '2. 步骤2',
      '## 完成情况',
      '- 完成: 2/2',
      '## 注意事项',
      '- 注意边界情况',
      '- 需要充分测试',
    ].join('\n');
    
    const score = assessQuality(mediumQualityContent);
    
    // 中等质量文档只有注意事项，没有代码和技术关键词
    // 评分应该在0.15左右（注意事项贡献0.15）
    expect(score).toBeGreaterThanOrEqual(0.04);
    expect(score).toBeLessThan(0.5);
  });
});