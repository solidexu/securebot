/**
 * Progressive Disclosure 配置化测试
 */

import { describe, it, expect } from 'vitest';
import {
  truncateDescription,
  truncateName,
  inferTrustLevel,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
} from './progressive-disclosure.js';

describe('Progressive Disclosure Config', () => {
  describe('Configurable Limits', () => {
    it('should use MAX_DESCRIPTION_LENGTH constant', () => {
      expect(MAX_DESCRIPTION_LENGTH).toBeDefined();
      expect(MAX_DESCRIPTION_LENGTH).toBeGreaterThan(0);
      expect(MAX_DESCRIPTION_LENGTH).toBeLessThanOrEqual(200);
    });
    
    it('should use MAX_NAME_LENGTH constant', () => {
      expect(MAX_NAME_LENGTH).toBeDefined();
      expect(MAX_NAME_LENGTH).toBeGreaterThan(0);
      expect(MAX_NAME_LENGTH).toBeLessThanOrEqual(100);
    });
    
    it('should truncate description to configured limit', () => {
      const long = 'Very long description that exceeds the maximum configured length limit';
      const result = truncateDescription(long);
      
      expect(result.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    });
    
    it('should truncate name to configured limit', () => {
      const long = 'very-long-skill-name-exceeding-maximum-limit';
      const result = truncateName(long);
      
      expect(result.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    });
    
    it('should support custom truncation lengths', () => {
      const text = 'Medium length description for testing custom truncation';
      
      const result = truncateDescription(text, 20);
      expect(result.length).toBeLessThanOrEqual(20);
    });
  });
  
  describe('TrustLevel Inference', () => {
    it('should classify private skills as user', () => {
      const result = inferTrustLevel('/agents/abc/skills/test', 'private');
      expect(result).toBe('user');
    });
    
    it('should classify project skills as builtin', () => {
      const result = inferTrustLevel('/skills/public/test', 'public');
      expect(result).toBe('builtin');
    });
    
    it('should classify user directory skills as community', () => {
      const result = inferTrustLevel('/home/user/.securebot/skills/test', 'public');
      expect(result).toBe('community');
    });
    
    it('should handle unknown paths gracefully', () => {
      const result = inferTrustLevel('/unknown/path', 'public');
      expect(['builtin', 'trusted', 'community', 'user']).toContain(result);
    });
  });
  
  describe('Description Truncation Quality', () => {
    it('should preserve important information at start', () => {
      const important = 'Critical information: This skill handles important tasks';
      const result = truncateDescription(important);
      
      expect(result).toContain('Critical');
    });
    
    it('should add ellipsis for truncated text', () => {
      const long = 'This is a very long description that will be truncated with ellipsis at the end';
      const result = truncateDescription(long);
      
      if (result.length < long.length) {
        expect(result.endsWith('...')).toBe(true);
      }
    });
    
    it('should not truncate short descriptions', () => {
      const short = 'Short description';
      const result = truncateDescription(short);
      
      expect(result).toBe(short);
    });
    
    it('should handle empty descriptions', () => {
      expect(truncateDescription('')).toBe('');
    });
    
    it('should handle whitespace-only descriptions', () => {
      const whitespace = '   ';
      const result = truncateDescription(whitespace);
      
      expect(result.trim()).toBe('');
    });
  });
  
  describe('Name Truncation Quality', () => {
    it('should preserve identifier format', () => {
      const longId = 'skill-name-with-many-hyphens-for-testing';
      const result = truncateName(longId);
      
      // 应该保持有效的标识符格式
      expect(result).toMatch(/^[a-z0-9-]+$/);
    });
    
    it('should not truncate short names', () => {
      const short = 'skill-name';
      const result = truncateName(short);
      
      expect(result).toBe(short);
    });
    
    it('should handle special characters', () => {
      const special = 'skill-with_special_chars';
      const result = truncateName(special);
      
      expect(result).toBeDefined();
    });
  });
  
  describe('Performance Considerations', () => {
    it('should handle very long descriptions efficiently', () => {
      const veryLong = 'test '.repeat(10000);
      
      const start = Date.now();
      const result = truncateDescription(veryLong);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(10);  // 应该在10ms内完成
      expect(result.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    });
    
    it('should handle concurrent truncations', () => {
      const descriptions = Array(100).fill('Test description to truncate');
      
      const results = descriptions.map(truncateDescription);
      
      expect(results.every(r => r.length <= MAX_DESCRIPTION_LENGTH)).toBe(true);
    });
  });
});
