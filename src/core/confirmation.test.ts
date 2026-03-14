import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ConfirmationManager,
  SENSITIVE_OPERATIONS,
  createConfirmableTool,
  getConfirmationManager,
  resetConfirmationManager,
} from './confirmation.js';
import type { Tool, ToolContext, Agent, Session } from './types.js';

// Mock context
const mockContext: ToolContext = {
  agent: {
    id: 'test',
    name: 'Test',
    workspace: '/tmp/test',
    sessions: new Map(),
    tools: {
      exec: {
        security: 'allowlist',
        ask: 'always',
        allowlist: ['ls', 'cat *'],
      },
    },
  } as Agent,
  session: {} as Session,
  workspace: '/tmp/test',
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
};

describe('ConfirmationManager', () => {
  let manager: ConfirmationManager;

  beforeEach(() => {
    manager = new ConfirmationManager();
  });

  describe('constructor', () => {
    it('should register default sensitive operations', () => {
      expect(manager.getOperation('write')).toBeDefined();
      expect(manager.getOperation('edit')).toBeDefined();
      expect(manager.getOperation('exec')).toBeDefined();
      expect(manager.getOperation('read')).toBeDefined();
    });
  });

  describe('registerOperation', () => {
    it('should register a new operation', () => {
      manager.registerOperation({
        tool: 'custom_tool',
        category: 'sensitive',
        level: 'high',
        riskDescription: 'Custom risk',
      });

      expect(manager.getOperation('custom_tool')).toBeDefined();
    });

    it('should override existing operation', () => {
      manager.registerOperation({
        tool: 'write',
        category: 'write',
        level: 'critical',
        riskDescription: 'Override',
      });

      const op = manager.getOperation('write');
      expect(op?.level).toBe('critical');
    });
  });

  describe('needsConfirmation', () => {
    it('should return false when mode is off', () => {
      manager.updatePolicy({ mode: 'off' });

      expect(manager.needsConfirmation('write', { path: '/test' }, mockContext)).toBe(false);
    });

    it('should return false for skipTools', () => {
      manager.updatePolicy({ skipTools: ['write'] });

      expect(manager.needsConfirmation('write', { path: '/test' }, mockContext)).toBe(false);
    });

    it('should return true for alwaysConfirm', () => {
      manager.updatePolicy({ alwaysConfirm: ['read'] });

      expect(manager.needsConfirmation('read', { path: '/test' }, mockContext)).toBe(true);
    });

    it('should check sensitivity level', () => {
      manager.updatePolicy({ minLevel: 'high' });

      // write is medium level
      expect(manager.needsConfirmation('write', { path: '/test' }, mockContext)).toBe(false);
      
      // exec is high level
      expect(manager.needsConfirmation('exec', { command: 'rm -rf /' }, mockContext)).toBe(true);
    });

    it('should check custom condition', () => {
      // read has a custom check for sensitive files
      // read is 'low' level, so we need to set minLevel to 'low'
      manager.updatePolicy({ minLevel: 'low' });
      
      const sensitivePath = '/home/user/.env';
      const normalPath = '/home/user/readme.md';

      expect(manager.needsConfirmation('read', { path: sensitivePath }, mockContext)).toBe(true);
      expect(manager.needsConfirmation('read', { path: normalPath }, mockContext)).toBe(false);
    });

    it('should respect remembered decisions', async () => {
      const handler = vi.fn().mockResolvedValue({ confirmed: true, remember: true });
      manager.setHandler(handler);

      // First request
      await manager.requestConfirmation('write', { path: '/test' }, mockContext);
      
      // Second request should use remembered decision
      const needsConfirm = manager.needsConfirmation('write', { path: '/test' }, mockContext);
      expect(needsConfirm).toBe(false);
    });
  });

  describe('requestConfirmation', () => {
    it('should return confirmed when no confirmation needed', async () => {
      manager.updatePolicy({ mode: 'off' });

      const result = await manager.requestConfirmation('write', { path: '/test' }, mockContext);

      expect(result.confirmed).toBe(true);
    });

    it('should call handler when confirmation needed', async () => {
      const handler = vi.fn().mockResolvedValue({ confirmed: true });
      manager.setHandler(handler);

      await manager.requestConfirmation('write', { path: '/test' }, mockContext);

      expect(handler).toHaveBeenCalled();
    });

    it('should return false when no handler set', async () => {
      // Force confirmation needed
      manager.updatePolicy({ alwaysConfirm: ['test'] });

      const result = await manager.requestConfirmation('test', {}, mockContext);

      expect(result.confirmed).toBe(false);
    });

    it('should remember decision when requested', async () => {
      const handler = vi.fn().mockResolvedValue({ confirmed: true, remember: true });
      manager.setHandler(handler);

      await manager.requestConfirmation('write', { path: '/test' }, mockContext);

      // Handler should only be called once
      await manager.requestConfirmation('write', { path: '/test' }, mockContext);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearRememberedDecisions', () => {
    it('should clear all remembered decisions', async () => {
      const handler = vi.fn().mockResolvedValue({ confirmed: true, remember: true });
      manager.setHandler(handler);

      await manager.requestConfirmation('write', { path: '/test' }, mockContext);
      
      manager.clearRememberedDecisions();
      
      expect(manager.needsConfirmation('write', { path: '/test' }, mockContext)).toBe(true);
    });
  });
});

describe('createConfirmableTool', () => {
  it('should create a wrapper tool', () => {
    const originalTool: Tool = {
      name: 'test',
      description: 'Test tool',
      parameters: { type: 'object' },
      execute: async () => ({ success: true, content: 'done' }),
    };

    const manager = new ConfirmationManager();
    manager.updatePolicy({ mode: 'off' });

    const wrappedTool = createConfirmableTool(originalTool, manager);

    expect(wrappedTool.name).toBe('test');
    expect(wrappedTool.description).toBe('Test tool');
  });

  it('should ask for confirmation before executing', async () => {
    const originalTool: Tool = {
      name: 'write',
      description: 'Write tool',
      parameters: { type: 'object' },
      execute: async () => ({ success: true, content: 'written' }),
    };

    const manager = new ConfirmationManager();
    manager.updatePolicy({ alwaysConfirm: ['write'] });
    
    const handler = vi.fn().mockResolvedValue({ confirmed: false });
    manager.setHandler(handler);

    const wrappedTool = createConfirmableTool(originalTool, manager);
    const result = await wrappedTool.execute({ path: '/test' }, mockContext);

    expect(result.success).toBe(false);
    expect(result.error).toBe('用户取消了操作');
  });

  it('should execute tool after confirmation', async () => {
    const originalTool: Tool = {
      name: 'write',
      description: 'Write tool',
      parameters: { type: 'object' },
      execute: async () => ({ success: true, content: 'written' }),
    };

    const manager = new ConfirmationManager();
    manager.updatePolicy({ alwaysConfirm: ['write'] });
    
    const handler = vi.fn().mockResolvedValue({ confirmed: true });
    manager.setHandler(handler);

    const wrappedTool = createConfirmableTool(originalTool, manager);
    const result = await wrappedTool.execute({ path: '/test' }, mockContext);

    expect(result.success).toBe(true);
    expect(result.content).toBe('written');
  });
});

describe('Global instance', () => {
  beforeEach(() => {
    resetConfirmationManager();
  });

  afterEach(() => {
    resetConfirmationManager();
  });

  it('should return singleton instance', () => {
    const instance1 = getConfirmationManager();
    const instance2 = getConfirmationManager();

    expect(instance1).toBe(instance2);
  });

  it('should create new instance after reset', () => {
    const instance1 = getConfirmationManager();
    resetConfirmationManager();
    const instance2 = getConfirmationManager();

    expect(instance1).not.toBe(instance2);
  });
});

describe('SENSITIVE_OPERATIONS', () => {
  it('should have predefined operations', () => {
    const toolNames = SENSITIVE_OPERATIONS.map(op => op.tool);
    
    expect(toolNames).toContain('write');
    expect(toolNames).toContain('edit');
    expect(toolNames).toContain('exec');
    expect(toolNames).toContain('read');
    expect(toolNames).toContain('rag_index');
  });

  it('should have correct levels', () => {
    const writeOp = SENSITIVE_OPERATIONS.find(op => op.tool === 'write');
    expect(writeOp?.level).toBe('medium');
    
    const execOp = SENSITIVE_OPERATIONS.find(op => op.tool === 'exec');
    expect(execOp?.level).toBe('high');
    
    const readOp = SENSITIVE_OPERATIONS.find(op => op.tool === 'read');
    expect(readOp?.level).toBe('medium');  // medium level, but check returns false for normal files
    
    const ragSearchOp = SENSITIVE_OPERATIONS.find(op => op.tool === 'rag_search');
    expect(ragSearchOp?.level).toBe('safe');
  });
});