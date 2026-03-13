import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerTool,
  getTool,
  getAllTools,
  getToolNames,
  generateToolSchema,
} from './index.js';
import { readTool, writeTool, editTool } from './fs.js';
import { execTool } from './exec.js';
import type { Tool, Agent } from '../core/types.js';

// Mock context
const mockContext = {
  agent: {
    id: 'test',
    name: 'Test',
    workspace: '/tmp/test',
    sessions: new Map(),
  } as Agent,
  session: {} as any,
  workspace: '/tmp/test',
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
};

describe('Tool Registry', () => {
  beforeEach(() => {
    // Clear registry before each test by creating fresh tools
  });

  describe('registerTool', () => {
    it('should register a tool', () => {
      const tool: Tool = {
        name: 'test_tool',
        description: 'A test tool',
        parameters: { type: 'object' },
        execute: async () => ({ success: true, content: 'test' }),
      };

      registerTool(tool);
      expect(getTool('test_tool')).toBe(tool);
    });
  });

  describe('getAllTools', () => {
    it('should return all registered tools', () => {
      registerTool(readTool);
      registerTool(writeTool);

      const tools = getAllTools();
      const names = tools.map(t => t.name);

      expect(names).toContain('read');
      expect(names).toContain('write');
    });
  });

  describe('getToolNames', () => {
    it('should return tool names', () => {
      registerTool(readTool);

      const names = getToolNames();
      expect(names).toContain('read');
    });
  });
});

describe('File Tools', () => {
  describe('readTool', () => {
    it('should have correct schema', () => {
      expect(readTool.name).toBe('read');
      expect(readTool.parameters.required).toContain('path');
    });

    it('should reject path outside workspace', async () => {
      const result = await readTool.execute(
        { path: '/etc/passwd' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('workspace');
    });
  });

  describe('writeTool', () => {
    it('should have correct schema', () => {
      expect(writeTool.name).toBe('write');
      expect(writeTool.parameters.required).toContain('path');
      expect(writeTool.parameters.required).toContain('content');
    });

    it('should reject path outside workspace', async () => {
      const result = await writeTool.execute(
        { path: '/etc/malicious', content: 'bad' },
        mockContext
      );

      expect(result.success).toBe(false);
    });
  });

  describe('editTool', () => {
    it('should have correct schema', () => {
      expect(editTool.name).toBe('edit');
      expect(editTool.parameters.required).toContain('path');
      expect(editTool.parameters.required).toContain('oldText');
      expect(editTool.parameters.required).toContain('newText');
    });
  });
});

describe('Exec Tool', () => {
  describe('execTool', () => {
    it('should have correct schema', () => {
      expect(execTool.name).toBe('exec');
      expect(execTool.parameters.required).toContain('command');
    });

    it('should deny commands when security is deny', async () => {
      const contextWithDeny = {
        ...mockContext,
        agent: {
          ...mockContext.agent,
          tools: {
            exec: {
              security: 'deny' as const,
              ask: 'off' as const,
              allowlist: [],
            },
          },
        },
      };

      const result = await execTool.execute(
        { command: 'ls' },
        contextWithDeny
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('禁用');
    });

    it('should allow commands in allowlist', async () => {
      const contextWithAllowlist = {
        ...mockContext,
        agent: {
          ...mockContext.agent,
          tools: {
            exec: {
              security: 'allowlist' as const,
              ask: 'off' as const,
              allowlist: ['ls *', 'cat *'],
            },
          },
        },
      };

      const result = await execTool.execute(
        { command: 'ls -la' },
        contextWithAllowlist
      );

      // Should not be denied by policy (may have other errors)
      const error = result.error ?? '';
      expect(error).not.toContain('白名单');
      expect(error).not.toContain('不在白名单');
    });
  });
});

describe('Tool Schema', () => {
  it('should generate correct OpenAI schema', () => {
    registerTool(readTool);

    const schema = generateToolSchema(readTool);

    expect(schema.type).toBe('function');
    expect(schema.function.name).toBe('read');
    expect(schema.function.description).toBeDefined();
    expect(schema.function.parameters).toBeDefined();
  });
});