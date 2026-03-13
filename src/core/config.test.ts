import { describe, it, expect } from 'vitest';
import {
  validateConfig,
  resolveWorkspace,
  DEFAULT_CONFIG,
  DEFAULT_TOOL_POLICY,
  DEFAULT_AGENTS,
} from './config.js';
import type { Config } from './types.js';
import { homedir } from 'node:os';

describe('Config', () => {
  describe('DEFAULT_CONFIG', () => {
    it('should have valid default configuration', () => {
      expect(DEFAULT_CONFIG.model).toBeDefined();
      expect(DEFAULT_CONFIG.model.model).toBe('qwen3.5:35b-a3b');
      expect(DEFAULT_CONFIG.defaultAgent).toBe('dev');
      expect(DEFAULT_CONFIG.agents.length).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_TOOL_POLICY', () => {
    it('should deny web tools by default', () => {
      expect(DEFAULT_TOOL_POLICY.deny).toContain('group:web');
      expect(DEFAULT_TOOL_POLICY.deny).toContain('web_search');
      expect(DEFAULT_TOOL_POLICY.deny).toContain('browser');
    });

    it('should use allowlist security for exec', () => {
      expect(DEFAULT_TOOL_POLICY.exec?.security).toBe('allowlist');
      expect(DEFAULT_TOOL_POLICY.exec?.ask).toBe('always');
    });
  });

  describe('DEFAULT_AGENTS', () => {
    it('should have predefined agents', () => {
      const ids = DEFAULT_AGENTS.map(a => a.id);
      expect(ids).toContain('dev');
      expect(ids).toContain('support');
      expect(ids).toContain('admin');
      expect(ids).toContain('finance');
    });

    it('should have dev as default agent', () => {
      const defaultAgent = DEFAULT_AGENTS.find(a => a.default);
      expect(defaultAgent?.id).toBe('dev');
    });

    it('should have correct tool profiles for each agent', () => {
      const dev = DEFAULT_AGENTS.find(a => a.id === 'dev');
      expect(dev?.tools?.profile).toBe('coding');

      const support = DEFAULT_AGENTS.find(a => a.id === 'support');
      expect(support?.tools?.profile).toBe('messaging');

      const admin = DEFAULT_AGENTS.find(a => a.id === 'admin');
      expect(admin?.tools?.profile).toBe('full');
    });
  });

  describe('resolveWorkspace', () => {
    it('should resolve ~ to home directory', () => {
      const result = resolveWorkspace('~/workspace');
      expect(result).toContain(homedir());
      expect(result).toContain('workspace');
    });

    it('should keep absolute paths', () => {
      const result = resolveWorkspace('/tmp/test');
      expect(result).toBe('/tmp/test');
    });

    it('should resolve relative paths', () => {
      const result = resolveWorkspace('./workspace');
      expect(result).toContain('workspace');
    });
  });

  describe('validateConfig', () => {
    it('should pass for valid config', () => {
      const errors = validateConfig(DEFAULT_CONFIG);
      expect(errors.length).toBe(0);
    });

    it('should fail for missing model', () => {
      const config = { ...DEFAULT_CONFIG, model: { model: '' } };
      const errors = validateConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('model');
    });

    it('should fail for missing default agent', () => {
      const config: Config = {
        ...DEFAULT_CONFIG,
        agents: DEFAULT_AGENTS.map(a => ({ ...a, default: false })),
      };
      const errors = validateConfig(config);
      expect(errors.some(e => e.includes('default'))).toBe(true);
    });

    it('should fail for duplicate agent ids', () => {
      const config: Config = {
        ...DEFAULT_CONFIG,
        agents: [
          { id: 'dev', name: 'Dev 1', workspace: '/tmp/dev1' },
          { id: 'dev', name: 'Dev 2', workspace: '/tmp/dev2' },
        ],
      };
      const errors = validateConfig(config);
      expect(errors.some(e => e.includes('重复'))).toBe(true);
    });

    it('should fail for missing workspace', () => {
      const config: Config = {
        ...DEFAULT_CONFIG,
        agents: [
          { id: 'test', name: 'Test', workspace: '' },
        ],
      };
      const errors = validateConfig(config);
      expect(errors.some(e => e.includes('workspace'))).toBe(true);
    });
  });
});