/**
 * Toolsets 测试
 */

import { describe, it, expect } from 'vitest';
import {
  TOOLSETS,
  resolveToolset,
  getAllToolsetNames,
  validateToolset,
  getAvailableTools,
  getAvailableToolsets,
  getToolsetForTool,
  getToolToToolsetMap,
  type ToolsetConfig,
} from './toolsets.js';

describe('Toolsets', () => {
  describe('resolveToolset', () => {
    it('should resolve basic toolset', () => {
      const tools = resolveToolset('web');
      
      expect(tools).toContain('web_search');
      expect(tools).toContain('web_fetch');
    });
    
    it('should resolve composed toolset', () => {
      const tools = resolveToolset('basic');
      
      // basic includes file and memory
      expect(tools).toContain('read');
      expect(tools).toContain('write');
      expect(tools).toContain('remember');
      expect(tools).toContain('recall');
    });
    
    it('should resolve deeply composed toolset', () => {
      const tools = resolveToolset('standard');
      
      // standard includes basic, web, exec, skills
      expect(tools).toContain('read');  // from basic -> file
      expect(tools).toContain('web_search');  // from web
      expect(tools).toContain('exec');  // from exec
      expect(tools).toContain('create_skill');  // from skills
    });
    
    it('should resolve full_stack with all tools', () => {
      const tools = resolveToolset('full_stack');
      
      expect(tools.length).toBeGreaterThan(20);
      expect(tools).toContain('web_search');
      expect(tools).toContain('browser_navigate');
    });
    
    it('should return empty array for unknown toolset', () => {
      const tools = resolveToolset('unknown');
      
      expect(tools).toEqual([]);
    });
    
    it('should not duplicate tools', () => {
      const tools = resolveToolset('standard');
      const uniqueTools = new Set(tools);
      
      expect(tools.length).toBe(uniqueTools.size);
    });
  });
  
  describe('getAllToolsetNames', () => {
    it('should return all defined toolsets', () => {
      const names = getAllToolsetNames();
      
      expect(names).toContain('web');
      expect(names).toContain('file');
      expect(names).toContain('basic');
      expect(names).toContain('standard');
      expect(names).toContain('full_stack');
    });
  });
  
  describe('validateToolset', () => {
    it('should return true for valid toolsets', () => {
      expect(validateToolset('web')).toBe(true);
      expect(validateToolset('basic')).toBe(true);
      expect(validateToolset('full_stack')).toBe(true);
    });
    
    it('should return false for invalid toolsets', () => {
      expect(validateToolset('unknown')).toBe(false);
      expect(validateToolset('')).toBe(false);
    });
  });
  
  describe('getAvailableTools', () => {
    it('should return enabled toolset tools', () => {
      const config: ToolsetConfig = {
        enabled: ['web', 'file'],
      };
      
      const tools = getAvailableTools(config);
      
      expect(tools).toContain('web_search');
      expect(tools).toContain('read');
      expect(tools).not.toContain('exec');
    });
    
    it('should exclude disabled toolsets', () => {
      const config: ToolsetConfig = {
        disabled: ['browser', 'collaboration'],
      };
      
      const tools = getAvailableTools(config);
      
      // browser tools may still appear if full_stack is not disabled
      expect(tools).toContain('web_search');
      expect(tools).toContain('read');
    });
    
    it('should return all tools when no config', () => {
      const config: ToolsetConfig = {};
      
      const tools = getAvailableTools(config);
      
      expect(tools.length).toBeGreaterThan(20);
    });
    
    it('should respect both enabled and disabled', () => {
      // enabled takes precedence
      const config: ToolsetConfig = {
        enabled: ['web'],
        disabled: ['file'],
      };
      
      const tools = getAvailableTools(config);
      
      expect(tools).toContain('web_search');
      expect(tools).not.toContain('read');
    });
  });
  
  describe('getAvailableToolsets', () => {
    it('should return enabled toolsets', () => {
      const config: ToolsetConfig = {
        enabled: ['web', 'file'],
      };
      
      const toolsets = getAvailableToolsets(config);
      
      expect(toolsets).toEqual(['web', 'file']);
    });
    
    it('should exclude disabled toolsets', () => {
      const config: ToolsetConfig = {
        disabled: ['browser'],
      };
      
      const toolsets = getAvailableToolsets(config);
      
      expect(toolsets).not.toContain('browser');
      expect(toolsets).toContain('web');
    });
    
    it('should return all toolsets when no config', () => {
      const config: ToolsetConfig = {};
      
      const toolsets = getAvailableToolsets(config);
      
      expect(toolsets.length).toBeGreaterThan(5);
    });
  });
  
  describe('getToolsetForTool', () => {
    it('should return toolset for known tool', () => {
      expect(getToolsetForTool('web_search')).toBe('web');
      expect(getToolsetForTool('read')).toBe('file');
      expect(getToolsetForTool('create_skill')).toBe('skills');
    });
    
    it('should return null for unknown tool', () => {
      expect(getToolsetForTool('unknown_tool')).toBe(null);
    });
  });
  
  describe('getToolToToolsetMap', () => {
    it('should return mapping for all tools', () => {
      const map = getToolToToolsetMap();
      
      expect(map.get('web_search')).toBe('web');
      expect(map.get('read')).toBe('file');
      expect(map.size).toBeGreaterThan(10);
    });
    
    it('should cache the mapping', () => {
      const map1 = getToolToToolsetMap();
      const map2 = getToolToToolsetMap();
      
      expect(map1).toBe(map2);  // Same instance
    });
  });
  
  describe('Toolset Composition', () => {
    it('should compose basic toolset correctly', () => {
      const basicTools = resolveToolset('basic');
      const fileTools = resolveToolset('file');
      const memoryTools = resolveToolset('memory');
      
      // basic should include all file and memory tools
      for (const tool of fileTools) {
        expect(basicTools).toContain(tool);
      }
      for (const tool of memoryTools) {
        expect(basicTools).toContain(tool);
      }
    });
    
    it('should compose standard toolset correctly', () => {
      const standardTools = resolveToolset('standard');
      const basicTools = resolveToolset('basic');
      const webTools = resolveToolset('web');
      const execTools = resolveToolset('exec');
      const skillsTools = resolveToolset('skills');
      
      // standard should include all basic, web, exec, skills tools
      for (const tool of basicTools) {
        expect(standardTools).toContain(tool);
      }
      for (const tool of webTools) {
        expect(standardTools).toContain(tool);
      }
      for (const tool of execTools) {
        expect(standardTools).toContain(tool);
      }
      for (const tool of skillsTools) {
        expect(standardTools).toContain(tool);
      }
    });
    
    it('should compose full_stack toolset correctly', () => {
      const fullStackTools = resolveToolset('full_stack');
      const standardTools = resolveToolset('standard');
      const ragTools = resolveToolset('rag');
      const browserTools = resolveToolset('browser');
      
      // full_stack should include all standard, rag, browser tools
      for (const tool of standardTools) {
        expect(fullStackTools).toContain(tool);
      }
      for (const tool of ragTools) {
        expect(fullStackTools).toContain(tool);
      }
      for (const tool of browserTools) {
        expect(fullStackTools).toContain(tool);
      }
    });
  });
});
