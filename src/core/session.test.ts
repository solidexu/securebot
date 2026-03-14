import { describe, it, expect } from 'vitest';
import {
  createSession,
  getSessionKey,
  addUserMessage,
  addAssistantMessage,
  addToolResultMessage,
  buildSystemPrompt,
} from './session.js';

describe('Session', () => {
  describe('createSession', () => {
    it('should create a session with correct properties', () => {
      const session = createSession('test-agent', 'main');

      expect(session.sessionKey).toBe('agent:test-agent:main');
      expect(session.agentId).toBe('test-agent');
      expect(session.history).toEqual([]);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('getSessionKey', () => {
    it('should generate correct session key', () => {
      expect(getSessionKey('dev', 'main')).toBe('agent:dev:main');
      expect(getSessionKey('admin', 'session1')).toBe('agent:admin:session1');
    });
  });

  describe('addUserMessage', () => {
    it('should add user message to history', () => {
      const session = createSession('test', 'main');

      addUserMessage(session, 'Hello, world!');

      expect(session.history.length).toBe(1);
      expect(session.history[0]).toEqual({
        role: 'user',
        content: 'Hello, world!',
      });
      expect(session.updatedAt).toBeInstanceOf(Date);
    });

    it('should preserve existing messages', () => {
      const session = createSession('test', 'main');
      addUserMessage(session, 'First message');
      addUserMessage(session, 'Second message');

      expect(session.history.length).toBe(2);
      expect(session.history[0]!.content).toBe('First message');
      expect(session.history[1]!.content).toBe('Second message');
    });
  });

  describe('addAssistantMessage', () => {
    it('should add assistant message without tool calls', () => {
      const session = createSession('test', 'main');

      addAssistantMessage(session, 'Hello! How can I help?');

      expect(session.history.length).toBe(1);
      expect(session.history[0]).toEqual({
        role: 'assistant',
        content: 'Hello! How can I help?',
      });
    });

    it('should add assistant message with tool calls', () => {
      const session = createSession('test', 'main');

      const toolCalls = [
        { id: 'tc_1', name: 'read', arguments: { path: '/tmp/test.txt' } },
      ];

      addAssistantMessage(session, 'Let me read that file.', toolCalls);

      expect(session.history.length).toBe(1);
      expect(session.history[0]!.toolCalls).toEqual(toolCalls);
    });
  });

  describe('addToolResultMessage', () => {
    it('should add tool result message', () => {
      const session = createSession('test', 'main');

      addToolResultMessage(session, 'tc_1', 'read', 'File contents here');

      expect(session.history.length).toBe(1);
      const msg = session.history[0]!;
      expect(msg.role).toBe('tool');
      expect(msg.content).toBe('File contents here');
      expect(msg.name).toBe('read');
      expect(msg.toolCallId).toBe('tc_1');
    });
  });

  describe('buildSystemPrompt', () => {
    it('should build system prompt with agent name', async () => {
      const prompt = await buildSystemPrompt('Developer', ['read', 'write', 'exec']);

      expect(prompt).toContain('Developer');
      expect(prompt).toContain('read');
      expect(prompt).toContain('write');
      expect(prompt).toContain('exec');
    });

    it('should handle empty tool list', async () => {
      const prompt = await buildSystemPrompt('Assistant', []);

      expect(prompt).toContain('Assistant');
    });
  });
});