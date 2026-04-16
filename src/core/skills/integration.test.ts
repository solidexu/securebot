/**
 * 技能系统集成测试（简化版）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getSkillManager } from '../skills.js';
import { getAvailableToolsets, type ToolsetConfig } from '../toolsets.js';

describe('Skills Integration Tests', () => {
  let skillManager: ReturnType<typeof getSkillManager>;
  
  beforeEach(async () => {
    skillManager = getSkillManager();
    await skillManager.initialize();
  });
  
  it('should get available toolsets from config', () => {
    const toolsets: ToolsetConfig = {
      enabled: ['web', 'file'],
    };
    
    const available = getAvailableToolsets(toolsets);
    expect(available).toContain('web');
    expect(available).toContain('file');
  });
  
  it('should list public skills', async () => {
    const skills = await skillManager.listPublicSkills();
    expect(skills.length).toBeGreaterThan(0);
  });
  
  it('should build skills prompt', async () => {
    const toolsets: ToolsetConfig = {
      enabled: ['web', 'file', 'memory'],
    };
    
    const prompt = await skillManager.buildSkillsPrompt(
      'test-agent',
      undefined,
      toolsets
    );
    
    expect(typeof prompt).toBe('string');
  });
  
  it('should handle disabled toolsets', () => {
    const toolsets: ToolsetConfig = {
      disabled: ['browser', 'collaboration'],
    };
    
    const available = getAvailableToolsets(toolsets);
    expect(available).not.toContain('browser');
    expect(available).not.toContain('collaboration');
  });
});
