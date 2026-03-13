/**
 * 文件系统工具
 * 
 * read - 读取文件
 * write - 写入文件
 * edit - 编辑文件
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { Tool, ToolContext, ToolResult } from '../core/types.js';

// ============ 安全检查 ============

/**
 * 验证路径是否在 workspace 内
 */
function validatePath(path: string, workspace: string): { valid: boolean; resolved: string; error?: string } {
  // 解析绝对路径
  const resolved = path.startsWith('/') 
    ? resolve(path) 
    : resolve(workspace, path);
  
  // 检查是否在 workspace 内
  const relativePath = relative(workspace, resolved);
  const isWithinWorkspace = !relativePath.startsWith('..') && !relativePath.startsWith('/');
  
  if (!isWithinWorkspace) {
    return {
      valid: false,
      resolved,
      error: `路径超出 workspace 范围: ${path}`,
    };
  }
  
  return { valid: true, resolved };
}

// ============ read 工具 ============

export const readTool: Tool = {
  name: 'read',
  description: '读取文件内容。支持文本文件，输出会截断到指定行数。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件路径（相对于 workspace）',
      },
      offset: {
        type: 'number',
        description: '起始行号（从 1 开始），默认 1',
      },
      limit: {
        type: 'number',
        description: '读取行数，默认 100',
      },
    },
    required: ['path'],
  },
  
  async execute(params, context: ToolContext): Promise<ToolResult> {
    const { path, offset = 1, limit = 100 } = params as { path: string; offset?: number; limit?: number };
    
    // 检查 workspace 是否存在
    if (!existsSync(context.workspace)) {
      return { 
        success: false, 
        error: `Workspace 不存在: ${context.workspace}\n请确保 Agent 的 workspace 目录已创建。` 
      };
    }
    
    // 验证路径
    const validation = validatePath(path, context.workspace);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    
    // 检查文件是否存在
    if (!existsSync(validation.resolved)) {
      return { 
        success: false, 
        error: `文件不存在: ${path}\n完整路径: ${validation.resolved}\n当前 workspace: ${context.workspace}` 
      };
    }
    
    try {
      // 读取文件
      const content = await readFile(validation.resolved, 'utf-8');
      const lines = content.split('\n');
      
      // 应用 offset 和 limit
      const startLine = Math.max(0, offset - 1);
      const endLine = startLine + limit;
      const selectedLines = lines.slice(startLine, endLine);
      
      // 添加行号
      const numberedLines = selectedLines.map((line, i) => 
        `${String(startLine + i + 1).padStart(4)}: ${line}`
      ).join('\n');
      
      const truncated = lines.length > endLine ? `\n... (共 ${lines.length} 行，已截断)` : '';
      
      return {
        success: true,
        content: numberedLines + truncated,
        metadata: {
          totalLines: lines.length,
          offset,
          limit,
          path: validation.resolved,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `读取文件失败: ${message}` };
    }
  },
};

// ============ write 工具 ============

export const writeTool: Tool = {
  name: 'write',
  description: '写入文件内容。如果文件不存在则创建，存在则覆盖。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件路径（相对于 workspace）',
      },
      content: {
        type: 'string',
        description: '文件内容',
      },
    },
    required: ['path', 'content'],
  },
  
  async execute(params, context: ToolContext): Promise<ToolResult> {
    const { path, content } = params as { path: string; content: string };
    
    // 验证路径
    const validation = validatePath(path, context.workspace);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    
    try {
      await writeFile(validation.resolved, content, 'utf-8');
      
      return {
        success: true,
        content: `文件已写入: ${path}`,
        metadata: {
          path: validation.resolved,
          size: content.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `写入文件失败: ${message}` };
    }
  },
};

// ============ edit 工具 ============

export const editTool: Tool = {
  name: 'edit',
  description: '编辑文件，替换指定文本。精确匹配，包括空白字符。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件路径（相对于 workspace）',
      },
      oldText: {
        type: 'string',
        description: '要替换的文本（必须精确匹配）',
      },
      newText: {
        type: 'string',
        description: '替换后的文本',
      },
    },
    required: ['path', 'oldText', 'newText'],
  },
  
  async execute(params, context: ToolContext): Promise<ToolResult> {
    const { path, oldText, newText } = params as { path: string; oldText: string; newText: string };
    
    // 验证路径
    const validation = validatePath(path, context.workspace);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    
    // 检查文件是否存在
    if (!existsSync(validation.resolved)) {
      return { success: false, error: `文件不存在: ${path}` };
    }
    
    try {
      // 读取文件
      const content = await readFile(validation.resolved, 'utf-8');
      
      // 检查 oldText 是否存在
      if (!content.includes(oldText)) {
        return { 
          success: false, 
          error: `未找到要替换的文本。请确保 oldText 完全匹配，包括空白字符。` 
        };
      }
      
      // 执行替换
      const newContent = content.replace(oldText, newText);
      
      // 写入文件
      await writeFile(validation.resolved, newContent, 'utf-8');
      
      return {
        success: true,
        content: `文件已编辑: ${path}`,
        metadata: {
          path: validation.resolved,
          replaced: oldText.length,
          with: newText.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `编辑文件失败: ${message}` };
    }
  },
};