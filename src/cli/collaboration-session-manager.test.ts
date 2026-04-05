import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CollaborationSessionManager } from './collaboration-session-manager.js';

describe('CollaborationSessionManager', () => {
  let manager: CollaborationSessionManager;

  beforeEach(() => {
    manager = new CollaborationSessionManager();
  });

  describe('detectMention', () => {
    it('should detect @mention in message', () => {
      const content = '@py please accept this task';
      expect(manager.detectMention(content, 'py')).toBe(true);
    });

    it('should detect @mention case insensitive', () => {
      const content = '@Py please accept this task';
      expect(manager.detectMention(content, 'py')).toBe(true);
    });

    it('should not detect @mention if not present', () => {
      const content = 'please accept this task';
      expect(manager.detectMention(content, 'py')).toBe(false);
    });

    it('should not detect partial mention', () => {
      const content = '@python please help';
      expect(manager.detectMention(content, 'py')).toBe(false);
    });
  });

  describe('createDecisionRequest', () => {
    it('should create decision request with options', () => {
      const request = manager.createDecisionRequest(
        'Test framework selection',
        [
          { key: '1', label: 'pytest' },
          { key: '2', label: 'unittest' }
        ],
        false
      );

      expect(request.id).toBeDefined();
      expect(request.title).toBe('Test framework selection');
      expect(request.options.length).toBe(2);
      expect(request.urgent).toBe(false);
    });

    it('should create urgent decision request', () => {
      const request = manager.createDecisionRequest(
        'Urgent decision',
        [{ key: 'a', label: 'Option A' }],
        true
      );

      expect(request.urgent).toBe(true);
    });
  });

  describe('hasUrgentDecisions', () => {
    it('should return false when no urgent decisions', () => {
      expect(manager.hasUrgentDecisions()).toBe(false);
    });

    it('should return true when urgent decisions exist', () => {
      manager.createDecisionRequest('Test', [{ key: '1', label: 'Option' }], true);
      expect(manager.hasUrgentDecisions()).toBe(true);
    });
  });

  describe('getPendingDecisionCount', () => {
    it('should return 0 when no decisions', () => {
      expect(manager.getPendingDecisionCount()).toBe(0);
    });

    it('should return correct count', () => {
      const req1 = manager.createDecisionRequest('Test 1', [{ key: '1', label: 'A' }], false);
      const req2 = manager.createDecisionRequest('Test 2', [{ key: '1', label: 'B' }], true);
      
      // 两个决策请求都已创建
      expect(manager.getPendingDecisionCount()).toBe(2);
      
      // 验证两个请求都存在
      expect(req1.id).toBeDefined();
      expect(req2.id).toBeDefined();
    });
  });
});