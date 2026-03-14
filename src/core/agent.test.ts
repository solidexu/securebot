import { describe, it, expect } from 'vitest';
import {
  createAgent,
  createAgents,
  parseAgentPrefix,
  getAgent,
  getDefaultAgent,
  getOrCreateMainSession,
  isToolAllowed,
  isCommandAllowed,
  getAgentToolPolicy,
  TOOL_PROFILES,
} from './agent.js';
import type { Agent, Config, ToolPolicy } from './types.js';

describe('Agent', () => {
  describe('createAgent', () => {
    it('should create an agent with default values', () => {
      const agent = createAgent({
        id: 'test',
        name: 'Test Agent',
        workspace: '/tmp/test',
      }, '/tmp');

      expect(agent.id).toBe('test');
      expect(agent.name).toBe('Test Agent');
      expect(agent.workspace).toBe('/tmp/test');
      expect(agent.sessions).toBeInstanceOf(Map);
      expect(agent.sessions.size).toBe(0);
    });

    it('should create workspace directory if not exists', () => {
      const agent = createAgent({
        id: 'test2',
        name: 'Test Agent 2',
        workspace: '/tmp/securebot-test-workspace',
      }, '/tmp');

      expect(agent.workspace).toContain('securebot-test-workspace');
    });
  });

  describe('createAgents', () => {
    it('should create multiple agents from config', () => {
      const config: Config = {
        model: { model: 'test-model' },
        defaultAgent: 'dev',
        tools: { profile: 'minimal' },
        agents: [
          { id: 'dev', name: 'Developer', workspace: '/tmp/dev' },
          { id: 'admin', name: 'Admin', workspace: '/tmp/admin' },
        ],
      };

      const agents = createAgents(config);

      expect(agents.size).toBe(2);
      expect(agents.has('dev')).toBe(true);
      expect(agents.has('admin')).toBe(true);
    });
  });

  describe('parseAgentPrefix', () => {
    it('should parse @agent prefix', () => {
      const result = parseAgentPrefix('@dev hello world');
      expect(result.agentId).toBe('dev');
      expect(result.message).toBe('hello world');
    });

    it('should return null for no prefix', () => {
      const result = parseAgentPrefix('hello world');
      expect(result.agentId).toBeNull();
      expect(result.message).toBe('hello world');
    });

    it('should handle multiline messages', () => {
      const result = parseAgentPrefix('@dev line1\nline2\nline3');
      expect(result.agentId).toBe('dev');
      expect(result.message).toBe('line1\nline2\nline3');
    });
  });

  describe('getAgent', () => {
    it('should return agent by id', () => {
      const agents = new Map<string, Agent>();
      const agent: Agent = {
        id: 'test',
        name: 'Test',
        workspace: '/tmp/test',
        sessions: new Map(),
      };
      agents.set('test', agent);

      expect(getAgent(agents, 'test')).toBe(agent);
      expect(getAgent(agents, 'nonexistent')).toBeUndefined();
    });
  });

  describe('getDefaultAgent', () => {
    it('should return agent with default flag', () => {
      const agents = new Map<string, Agent>();
      agents.set('a', { id: 'a', name: 'A', workspace: '/tmp/a', sessions: new Map() });
      agents.set('b', { id: 'b', name: 'B', workspace: '/tmp/b', default: true, sessions: new Map() });

      const result = getDefaultAgent(agents);
      expect(result?.id).toBe('b');
    });

    it('should return first agent if no default', () => {
      const agents = new Map<string, Agent>();
      agents.set('first', { id: 'first', name: 'First', workspace: '/tmp/first', sessions: new Map() });
      agents.set('second', { id: 'second', name: 'Second', workspace: '/tmp/second', sessions: new Map() });

      const result = getDefaultAgent(agents);
      expect(result?.id).toBe('first');
    });

    it('should return undefined for empty map', () => {
      const agents = new Map<string, Agent>();
      expect(getDefaultAgent(agents)).toBeUndefined();
    });
  });

  describe('getOrCreateMainSession', () => {
    it('should create session if not exists', () => {
      const agent: Agent = {
        id: 'test',
        name: 'Test',
        workspace: '/tmp/test',
        sessions: new Map(),
      };

      const session = getOrCreateMainSession(agent);

      expect(session.sessionKey).toBe('agent:test:main');
      expect(session.agentId).toBe('test');
      expect(session.history).toEqual([]);
      expect(agent.sessions.size).toBe(1);
    });

    it('should return existing session', () => {
      const agent: Agent = {
        id: 'test',
        name: 'Test',
        workspace: '/tmp/test',
        sessions: new Map(),
      };

      const session1 = getOrCreateMainSession(agent);
      session1.history.push({ role: 'user', content: 'test' });

      const session2 = getOrCreateMainSession(agent);

      expect(session2.history.length).toBe(1);
      expect(agent.sessions.size).toBe(1);
    });
  });
});

describe('Tool Policy', () => {
  describe('TOOL_PROFILES', () => {
    it('should have predefined profiles', () => {
      expect(TOOL_PROFILES.minimal).toBeDefined();
      expect(TOOL_PROFILES.coding).toBeDefined();
      expect(TOOL_PROFILES.messaging).toBeDefined();
      expect(TOOL_PROFILES.full).toBeDefined();
    });

    it('should have correct tools for coding profile', () => {
      expect(TOOL_PROFILES.coding).toContain('read');
      expect(TOOL_PROFILES.coding).toContain('write');
      expect(TOOL_PROFILES.coding).toContain('edit');
      expect(TOOL_PROFILES.coding).toContain('exec');
    });
  });

  describe('isToolAllowed', () => {
    it('should deny tools in deny list', () => {
      const policy: ToolPolicy = {
        deny: ['web_search', 'browser'],
      };

      expect(isToolAllowed('web_search', policy)).toBe(false);
      expect(isToolAllowed('browser', policy)).toBe(false);
      expect(isToolAllowed('read', policy)).toBe(true);
    });

    it('should respect profile settings', () => {
      const policy: ToolPolicy = {
        profile: 'minimal',
      };

      expect(isToolAllowed('session_status', policy)).toBe(true);
      expect(isToolAllowed('exec', policy)).toBe(false);
    });

    it('should allow tools in allow list when no profile restriction', () => {
      const policy: ToolPolicy = {
        allow: ['read', 'write'],
      };

      expect(isToolAllowed('read', policy)).toBe(true);
      expect(isToolAllowed('write', policy)).toBe(true);
      expect(isToolAllowed('exec', policy)).toBe(false); // not in allow list
    });

    it('should check profile first, then allow list', () => {
      // minimal profile only allows session_status
      // when allow list is non-empty, tool must be in allow list too
      const policy: ToolPolicy = {
        profile: 'minimal',
        allow: ['session_status'], // must include tools you want to allow
      };

      expect(isToolAllowed('session_status', policy)).toBe(true);
      expect(isToolAllowed('read', policy)).toBe(false); // not in minimal profile
    });

    it('should prioritize deny over allow', () => {
      const policy: ToolPolicy = {
        allow: ['read', 'write'],
        deny: ['write'],
      };

      expect(isToolAllowed('read', policy)).toBe(true);
      expect(isToolAllowed('write', policy)).toBe(false);
    });

    it('should allow all tools for full profile', () => {
      const policy: ToolPolicy = {
        profile: 'full',
      };

      expect(isToolAllowed('read', policy)).toBe(true);
      expect(isToolAllowed('write', policy)).toBe(true);
      expect(isToolAllowed('exec', policy)).toBe(true);
    });
  });

  describe('getAgentToolPolicy', () => {
    it('should merge global and agent policies', () => {
      const agent: Agent = {
        id: 'test',
        name: 'Test',
        workspace: '/tmp/test',
        tools: {
          profile: 'coding',
          deny: ['exec'],
        },
        sessions: new Map(),
      };

      const globalPolicy: ToolPolicy = {
        profile: 'minimal',
        deny: ['web_search'],
      };

      const result = getAgentToolPolicy(agent, globalPolicy);

      expect(result.profile).toBe('coding');
      expect(result.deny).toContain('web_search');
      expect(result.deny).toContain('exec');
    });
  });

  describe('isCommandAllowed', () => {
    it('should match exact commands', () => {
      expect(isCommandAllowed('git status', ['git status'])).toBe(true);
      expect(isCommandAllowed('git log', ['git status'])).toBe(false);
    });

    it('should match wildcard patterns', () => {
      expect(isCommandAllowed('git log --oneline', ['git log *'])).toBe(true);
      expect(isCommandAllowed('git log -10', ['git log *'])).toBe(true);
      expect(isCommandAllowed('git status', ['git log *'])).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(isCommandAllowed('Git status', ['git status'])).toBe(false);
    });
  });
});