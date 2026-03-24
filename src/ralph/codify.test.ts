/**
 * Codify 系统测试
 */

import { describe, it, expect } from 'vitest';
import { PatternCodifier } from './codify.js';
import type { SuccessPattern } from './codify.js';

describe('PatternCodifier', () => {
  describe('classifyTask', () => {
    it('should classify API tasks', () => {
      // 通过反射访问私有方法
      const codifier = new PatternCodifier({} as any, { enabled: false });
      const classify = (codifier as any).classifyTask.bind(codifier);
      
      expect(classify('实现用户登录 API 接口')).toBe('api-development');
      expect(classify('开发 RESTful API')).toBe('api-development');
    });
    
    it('should classify testing tasks', () => {
      const codifier = new PatternCodifier({} as any, { enabled: false });
      const classify = (codifier as any).classifyTask.bind(codifier);
      
      expect(classify('编写单元测试')).toBe('testing');
      expect(classify('添加集成测试')).toBe('testing');
    });
    
    it('should classify UI tasks', () => {
      const codifier = new PatternCodifier({} as any, { enabled: false });
      const classify = (codifier as any).classifyTask.bind(codifier);
      
      expect(classify('开发用户界面')).toBe('ui-development');
      expect(classify('实现 UI 组件')).toBe('ui-development');
    });
    
    it('should classify authentication tasks', () => {
      const codifier = new PatternCodifier({} as any, { enabled: false });
      const classify = (codifier as any).classifyTask.bind(codifier);
      
      expect(classify('实现用户登录功能')).toBe('authentication');
      expect(classify('添加 OAuth 认证')).toBe('authentication');
    });
    
    it('should return general for unknown tasks', () => {
      const codifier = new PatternCodifier({} as any, { enabled: false });
      const classify = (codifier as any).classifyTask.bind(codifier);
      
      expect(classify('做一些事情')).toBe('general');
      expect(classify('完成工作')).toBe('general');
    });
  });
  
  describe('extractTechnologies', () => {
    it('should extract Python from output', () => {
      const codifier = new PatternCodifier({} as any, { enabled: false });
      const extract = (codifier as any).extractTechnologies.bind(codifier);
      
      const result = extract('使用 Python 和 FastAPI 实现', '/tmp');
      expect(result).toContain('python');
    });
    
    it('should extract TypeScript from output', () => {
      const codifier = new PatternCodifier({} as any, { enabled: false });
      const extract = (codifier as any).extractTechnologies.bind(codifier);
      
      const result = extract('使用 TypeScript 编写代码', '/tmp');
      expect(result).toContain('typescript');
    });
    
    it('should extract multiple technologies', () => {
      const codifier = new PatternCodifier({} as any, { enabled: false });
      const extract = (codifier as any).extractTechnologies.bind(codifier);
      
      const result = extract('使用 Python 和 React 和 PostgreSQL', '/tmp');
      expect(result).toContain('python');
      expect(result).toContain('react');
      expect(result).toContain('postgresql');
    });
  });
  
  describe('shouldCodify', () => {
    it('should not codify patterns without steps', () => {
      const codifier = new PatternCodifier({} as any, { enabled: false });
      const shouldCodify = (codifier as any).shouldCodify.bind(codifier);
      
      const pattern: SuccessPattern = {
        id: 'test-123',
        taskType: 'general',
        taskDescription: '测试任务',
        steps: [],
        technologies: ['python'],
        problemsSolved: [],
        codeSnippets: [],
        createdAt: new Date().toISOString(),
        usageCount: 1,
      };
      
      expect(shouldCodify(pattern)).toBe(false);
    });
    
    it('should not codify patterns without technologies', () => {
      const codifier = new PatternCodifier({} as any, { enabled: false });
      const shouldCodify = (codifier as any).shouldCodify.bind(codifier);
      
      const pattern: SuccessPattern = {
        id: 'test-123',
        taskType: 'general',
        taskDescription: '测试任务',
        steps: ['步骤1', '步骤2'],
        technologies: [],
        problemsSolved: [],
        codeSnippets: [],
        createdAt: new Date().toISOString(),
        usageCount: 1,
      };
      
      expect(shouldCodify(pattern)).toBe(false);
    });
    
    it('should codify valid patterns', () => {
      const codifier = new PatternCodifier({} as any, { enabled: false });
      const shouldCodify = (codifier as any).shouldCodify.bind(codifier);
      
      const pattern: SuccessPattern = {
        id: 'test-123',
        taskType: 'api-development',
        taskDescription: '测试任务',
        steps: ['步骤1', '步骤2'],
        technologies: ['python', 'fastapi'],
        problemsSolved: [],
        codeSnippets: [],
        createdAt: new Date().toISOString(),
        usageCount: 1,
      };
      
      expect(shouldCodify(pattern)).toBe(true);
    });
  });
});