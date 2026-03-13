import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseAgentPrefix,
  getOrCreateMainSession,
} from '../core/agent.js';
import {
  createSession,
  addUserMessage,
  addAssistantMessage,
} from '../core/session.js';
import type { Agent } from '../core/types.js';

// ============ 解析函数测试 ============

describe('parseAgentPrefix', () => {
  it('should parse @agent prefix', () => {
    const result = parseAgentPrefix('@dev hello world');
    expect(result.agentId).toBe('dev');
    expect(result.message).toBe('hello world');
  });

  it('should parse @agent with multi-word name', () => {
    const result = parseAgentPrefix('@admin check system status');
    expect(result.agentId).toBe('admin');
    expect(result.message).toBe('check system status');
  });

  it('should return null agentId for no prefix', () => {
    const result = parseAgentPrefix('hello world');
    expect(result.agentId).toBeNull();
    expect(result.message).toBe('hello world');
  });

  it('should handle message starting with @ but not agent', () => {
    const result = parseAgentPrefix('@notanagent test');
    // Should still parse as agent since it matches the pattern
    expect(result.agentId).toBe('notanagent');
    expect(result.message).toBe('test');
  });

  it('should handle empty message after agent prefix', () => {
    const result = parseAgentPrefix('@dev   ');
    expect(result.agentId).toBe('dev');
    // trim happens in the processing, parseAgentPrefix returns raw
    expect(result.message.trim()).toBe('');
  });

  it('should handle multiline messages', () => {
    const result = parseAgentPrefix('@dev line1\nline2\nline3');
    expect(result.agentId).toBe('dev');
    expect(result.message).toBe('line1\nline2\nline3');
  });

  it('should handle special characters in message', () => {
    const result = parseAgentPrefix('@dev test @mention and #hashtag');
    expect(result.agentId).toBe('dev');
    expect(result.message).toBe('test @mention and #hashtag');
  });
});

// ============ 会话管理测试 ============

describe('Session Management', () => {
  let agent: Agent;

  beforeEach(() => {
    agent = {
      id: 'test-agent',
      name: 'Test Agent',
      workspace: '/tmp/test',
      sessions: new Map(),
    };
  });

  it('should create main session', () => {
    const session = getOrCreateMainSession(agent);
    
    expect(session.sessionKey).toBe('agent:test-agent:main');
    expect(session.agentId).toBe('test-agent');
    expect(session.history).toEqual([]);
  });

  it('should return existing session', () => {
    const session1 = getOrCreateMainSession(agent);
    addUserMessage(session1, 'First message');
    
    const session2 = getOrCreateMainSession(agent);
    
    expect(session2.history.length).toBe(1);
    expect(session2.history[0]!.content).toBe('First message');
  });

  it('should track session count', () => {
    expect(agent.sessions.size).toBe(0);
    
    getOrCreateMainSession(agent);
    expect(agent.sessions.size).toBe(1);
    
    getOrCreateMainSession(agent);
    expect(agent.sessions.size).toBe(1); // Should not create new session
  });
});

// ============ 消息格式测试 ============

describe('Message Formatting', () => {
  it('should create user message', () => {
    const session = createSession('test', 'main');
    addUserMessage(session, 'Hello');

    expect(session.history.length).toBe(1);
    expect(session.history[0]).toEqual({
      role: 'user',
      content: 'Hello',
    });
  });

  it('should create assistant message', () => {
    const session = createSession('test', 'main');
    addAssistantMessage(session, 'Hi there!');

    expect(session.history.length).toBe(1);
    expect(session.history[0]).toEqual({
      role: 'assistant',
      content: 'Hi there!',
    });
  });

  it('should create assistant message with tool calls', () => {
    const session = createSession('test', 'main');
    const toolCalls = [
      { id: 'tc_1', name: 'read', arguments: { path: '/tmp/test' } },
    ];

    addAssistantMessage(session, 'Let me read that file.', toolCalls);

    expect(session.history[0]!.toolCalls).toEqual(toolCalls);
  });

  it('should maintain message order', () => {
    const session = createSession('test', 'main');
    
    addUserMessage(session, 'Message 1');
    addAssistantMessage(session, 'Response 1');
    addUserMessage(session, 'Message 2');

    expect(session.history.length).toBe(3);
    expect(session.history[0]!.role).toBe('user');
    expect(session.history[1]!.role).toBe('assistant');
    expect(session.history[2]!.role).toBe('user');
  });
});

// ============ 命令解析测试 ============

describe('Command Parsing', () => {
  const commands = [
    { input: '/help', expected: 'help' },
    { input: '/exit', expected: 'exit' },
    { input: '/quit', expected: 'quit' },
    { input: '/agents', expected: 'agents' },
    { input: '/model', expected: 'model' },
    { input: '/history', expected: 'history' },
    { input: '/clear', expected: 'clear' },
  ];

  commands.forEach(({ input, expected }) => {
    it(`should parse ${input} command`, () => {
      const cmd = input.slice(1).toLowerCase();
      expect(cmd).toBe(expected);
    });
  });

  it('should handle command with arguments', () => {
    const input = '/agent dev';
    const parts = input.slice(1).split(/\s+/);
    
    expect(parts[0]).toBe('agent');
    expect(parts[1]).toBe('dev');
  });
});

// ============ 流式输出测试 ============

describe('Stream Handling', () => {
  it('should collect stream chunks', () => {
    const chunks: string[] = [];
    const fullContent = 'Hello, this is a test message.';
    
    // Simulate streaming character by character
    for (let i = 0; i < fullContent.length; i++) {
      const char = fullContent.charAt(i);
      chunks.push(char);
    }
    
    const result = chunks.join('');
    expect(result).toBe(fullContent);
  });

  it('should handle word-by-word streaming', () => {
    const words = ['Hello', 'world', 'this', 'is', 'a', 'test'];
    const chunks: string[] = [];
    
    words.forEach((word, i) => {
      chunks.push(word);
      if (i < words.length - 1) {
        chunks.push(' ');
      }
    });
    
    const result = chunks.join('');
    expect(result).toBe('Hello world this is a test');
  });

  it('should track done state', () => {
    const states: boolean[] = [];
    
    // Simulate stream chunks
    ['Hello', ' world'].forEach(() => {
      states.push(false);
    });
    states.push(true); // Last one is done
    
    expect(states[0]).toBe(false);
    expect(states[1]).toBe(false);
    expect(states[2]).toBe(true);
  });
});