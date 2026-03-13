import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaAdapter, createOllamaAdapter } from './ollama.js';
import type { Message, Tool } from '../core/types.js';

describe('OllamaAdapter', () => {
  let adapter: OllamaAdapter;

  beforeEach(() => {
    adapter = new OllamaAdapter({
      baseUrl: 'http://localhost:11434',
      defaultModel: 'test-model',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default values', () => {
      const defaultAdapter = new OllamaAdapter();
      expect(defaultAdapter.getDefaultModel()).toBe('qwen3.5-35b-a3b');
    });

    it('should accept custom options', () => {
      const customAdapter = new OllamaAdapter({
        baseUrl: 'http://custom:8080',
        defaultModel: 'custom-model',
        timeout: 60000,
      });
      expect(customAdapter.getDefaultModel()).toBe('custom-model');
    });
  });

  describe('setDefaultModel', () => {
    it('should change default model', () => {
      adapter.setDefaultModel('new-model');
      expect(adapter.getDefaultModel()).toBe('new-model');
    });
  });

  describe('healthCheck', () => {
    // Note: These tests require actual Ollama server running
    // In CI, these would be skipped or use mocks
    it.skip('should return ok for successful connection', async () => {
      const result = await adapter.healthCheck();
      expect(result.ok).toBe(true);
    });

    it.skip('should return error for failed connection', async () => {
      const badAdapter = new OllamaAdapter({ baseUrl: 'http://nonexistent:9999' });
      const result = await badAdapter.healthCheck();
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('listModels', () => {
    // Note: These tests require actual Ollama server running
    it.skip('should return list of models', async () => {
      const models = await adapter.listModels();
      expect(Array.isArray(models)).toBe(true);
    });

    it.skip('should handle empty model list', async () => {
      const models = await adapter.listModels();
      expect(models).toBeDefined();
    });
  });

  describe('message conversion', () => {
    it('should convert user message', () => {
      const msg: Message = { role: 'user', content: 'Hello' };
      // Access private method via any
      const converted = (adapter as any).convertMessage(msg);
      
      expect(converted.role).toBe('user');
      expect(converted.content).toBe('Hello');
    });

    it('should convert assistant message with tool calls', () => {
      const msg: Message = {
        role: 'assistant',
        content: 'Using tool',
        toolCalls: [{ id: 'tc_1', name: 'read', arguments: { path: '/test' } }],
      };
      const converted = (adapter as any).convertMessage(msg);
      
      expect(converted.role).toBe('assistant');
      expect(converted.tool_calls).toBeDefined();
      expect(converted.tool_calls[0].function.name).toBe('read');
    });
  });

  describe('tool conversion', () => {
    it('should convert tool definition', () => {
      const tool: Tool = {
        name: 'test_tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' },
          },
          required: ['path'],
        },
        execute: async () => ({ success: true }),
      };
      
      const converted = (adapter as any).convertTool(tool);
      
      expect(converted.type).toBe('function');
      expect(converted.function.name).toBe('test_tool');
      expect(converted.function.description).toBe('A test tool');
    });
  });

  describe('tool call ID generation', () => {
    it('should generate unique IDs', () => {
      const id1 = (adapter as any).generateToolCallId();
      const id2 = (adapter as any).generateToolCallId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^tc_\d+_[a-z0-9]+$/);
    });
  });
});

describe('createOllamaAdapter', () => {
  it('should create adapter with default options', () => {
    const adapter = createOllamaAdapter();
    expect(adapter).toBeInstanceOf(OllamaAdapter);
  });

  it('should create adapter with custom options', () => {
    const adapter = createOllamaAdapter({
      baseUrl: 'http://custom:8080',
      defaultModel: 'custom-model',
    });
    expect(adapter.getDefaultModel()).toBe('custom-model');
  });
});

// Note: Full chat and streaming tests require actual Ollama server
// Integration tests should be separate