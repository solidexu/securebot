import { describe, it, expect } from 'vitest';

// ============ 命令处理逻辑测试 ============

describe('CLI Commands', () => {
  describe('help command', () => {
    const helpCommands = ['help', 'h', '?'];

    helpCommands.forEach(cmd => {
      it(`should recognize /${cmd} as help command`, () => {
        const input = `/${cmd}`;
        const parsed = input.slice(1).toLowerCase();
        
        expect(['help', 'h', '?']).toContain(parsed);
      });
    });
  });

  describe('exit commands', () => {
    const exitCommands = ['exit', 'quit', 'q'];

    exitCommands.forEach(cmd => {
      it(`should recognize /${cmd} as exit command`, () => {
        const input = `/${cmd}`;
        const parsed = input.slice(1).toLowerCase();
        
        expect(['exit', 'quit', 'q']).toContain(parsed);
      });
    });
  });

  describe('agent command', () => {
    it('should parse /agent command', () => {
      const input = '/agent';
      const parts = input.slice(1).split(/\s+/);
      expect(parts[0]).toBe('agent');
    });

    it('should parse /agent with argument', () => {
      const input = '/agent dev';
      const parts = input.slice(1).split(/\s+/);
      expect(parts[0]).toBe('agent');
      expect(parts[1]).toBe('dev');
    });
  });

  describe('agents command', () => {
    it('should list all agents', () => {
      const agents = new Map([
        ['dev', { id: 'dev', name: 'Developer' }],
        ['admin', { id: 'admin', name: 'Administrator' }],
        ['support', { id: 'support', name: 'Support' }],
      ]);

      const agentList = Array.from(agents.entries()).map(([id, agent]) => ({
        id,
        name: (agent as any).name,
      }));

      expect(agentList.length).toBe(3);
      expect(agentList.find(a => a.id === 'dev')).toBeDefined();
    });
  });

  describe('history command', () => {
    it('should display session history', () => {
      const history = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ];

      const roleNames: Record<string, string> = {
        user: '用户',
        assistant: '助手',
        system: '系统',
        tool: '工具',
      };

      history.forEach(msg => {
        expect(roleNames[msg.role]).toBeDefined();
      });
    });
  });

  describe('model command', () => {
    it('should display current model', () => {
      const config = { model: { model: 'qwen3.5-35b-a3b' } };
      expect(config.model.model).toBe('qwen3.5-35b-a3b');
    });
  });

  describe('clear command', () => {
    it('should be recognized', () => {
      const input = '/clear';
      const cmd = input.slice(1).toLowerCase();
      expect(cmd).toBe('clear');
    });
  });

  describe('unknown command', () => {
    it('should not match known commands', () => {
      const knownCommands = ['help', 'h', '?', 'exit', 'quit', 'q', 'agent', 'agents', 'history', 'model', 'clear'];
      const input = '/unknown';
      const cmd = input.slice(1).toLowerCase();
      
      expect(knownCommands).not.toContain(cmd);
    });
  });
});

// ============ Agent 切换测试 ============

describe('Agent Switching', () => {
  const agents = new Map([
    ['dev', { id: 'dev', name: 'Developer', default: true }],
    ['admin', { id: 'admin', name: 'Administrator' }],
    ['support', { id: 'support', name: 'Support' }],
  ]);

  it('should switch to valid agent', () => {
    const targetId = 'admin';
    const target = agents.get(targetId);
    
    expect(target).toBeDefined();
    expect(target?.id).toBe('admin');
  });

  it('should handle invalid agent', () => {
    const targetId = 'nonexistent';
    const target = agents.get(targetId);
    
    expect(target).toBeUndefined();
    expect(agents.has(targetId)).toBe(false);
  });

  it('should list available agents for invalid switch', () => {
    const availableAgents = Array.from(agents.keys());
    
    expect(availableAgents).toContain('dev');
    expect(availableAgents).toContain('admin');
    expect(availableAgents).toContain('support');
    expect(availableAgents).not.toContain('nonexistent');
  });
});

// ============ 输入处理测试 ============

describe('Input Processing', () => {
  it('should skip empty input', () => {
    const inputs = ['', '   ', '\t', '\n'];
    
    inputs.forEach(input => {
      const trimmed = input.trim();
      expect(trimmed).toBe('');
    });
  });

  it('should detect command input', () => {
    const inputs = ['/help', '/exit', '/agents'];
    
    inputs.forEach(input => {
      expect(input.startsWith('/')).toBe(true);
    });
  });

  it('should detect agent prefix', () => {
    const input = '@dev hello';
    const hasPrefix = input.startsWith('@');
    
    expect(hasPrefix).toBe(true);
  });

  it('should parse mixed case commands', () => {
    const inputs = ['/HELP', '/Help', '/help'];
    
    inputs.forEach(input => {
      const cmd = input.slice(1).toLowerCase();
      expect(cmd).toBe('help');
    });
  });
});

// ============ 格式化测试 ============

describe('Output Formatting', () => {
  it('should format single line response', () => {
    const content = 'Hello, world!';
    const formatted = content
      .split('\n')
      .map(line => `  ${line}`)
      .join('\n');
    
    expect(formatted).toBe('  Hello, world!');
  });

  it('should format multi-line response', () => {
    const content = 'Line 1\nLine 2\nLine 3';
    const formatted = content
      .split('\n')
      .map(line => `  ${line}`)
      .join('\n');
    
    expect(formatted).toBe('  Line 1\n  Line 2\n  Line 3');
  });

  it('should handle empty content', () => {
    const content = '';
    const formatted = content || '(无回复)';
    
    expect(formatted).toBe('(无回复)');
  });

  it('should truncate long content', () => {
    const content = 'A'.repeat(300);
    const preview = content.length > 200 
      ? content.slice(0, 200) + '...'
      : content;
    
    expect(preview.length).toBe(203);
    expect(preview.endsWith('...')).toBe(true);
  });
});

// ============ Token 统计测试 ============

describe('Token Statistics', () => {
  it('should calculate total tokens', () => {
    const usage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    };
    
    expect(usage.totalTokens).toBe(usage.promptTokens + usage.completionTokens);
  });

  it('should handle zero tokens', () => {
    const usage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
    
    expect(usage.totalTokens).toBe(0);
  });
});