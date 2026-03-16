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
 * 验证路径是否在 workspace 或允许的路径内
 */
function validatePath(
  path: string, 
  workspace: string, 
  allowedPaths?: string[]
): { valid: boolean; resolved: string; error?: string } {
  // 解析绝对路径
  const resolved = path.startsWith('/') 
    ? resolve(path) 
    : resolve(workspace, path);
  
  // 检查是否在 workspace 内
  const relativePath = relative(workspace, resolved);
  const isWithinWorkspace = !relativePath.startsWith('..') && !relativePath.startsWith('/');
  
  if (isWithinWorkspace) {
    return { valid: true, resolved };
  }
  
  // 检查是否在允许的额外路径内
  if (allowedPaths && allowedPaths.length > 0) {
    for (const allowedPath of allowedPaths) {
      const allowedResolved = resolve(allowedPath);
      const relativeToAllowed = relative(allowedResolved, resolved);
      const isWithinAllowed = !relativeToAllowed.startsWith('..') && !relativeToAllowed.startsWith('/');
      
      if (isWithinAllowed) {
        return { valid: true, resolved };
      }
    }
  }
  
  return {
    valid: false,
    resolved,
    error: `路径超出 workspace 范围: ${path}`,
  };
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
    const validation = validatePath(path, context.workspace, context.allowedPaths);
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
    const validation = validatePath(path, context.workspace, context.allowedPaths);
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
  description: `编辑文件，替换指定文本。
重要提示：
1. oldText 必须与文件内容完全匹配（包括空白、缩进、换行）
2. 如果不确定文件内容，请先用 read 工具读取
3. 替换所有匹配项（不只是第一个）
4. 建议使用较小的文本块进行替换，避免匹配失败`,
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件路径（相对于 workspace）',
      },
      oldText: {
        type: 'string',
        description: '要替换的文本（必须精确匹配，包括所有空白字符）',
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
    const validation = validatePath(path, context.workspace, context.allowedPaths);
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
        // 提供更详细的错误信息
        const lines = content.split('\n');
        const oldTextLines = oldText.split('\n');
        const oldTextPreview = oldText.slice(0, 150);
        
        // 尝试查找相似文本
        const suggestions: string[] = [];
        const oldTextLower = oldText.toLowerCase().trim();
        
        for (let i = 0; i < lines.length; i++) {
          const lineLower = lines[i]?.toLowerCase().trim() ?? '';
          // 检查是否包含部分匹配
          if (oldTextLower.length > 10 && lineLower.includes(oldTextLower.slice(0, 30))) {
            suggestions.push(`第 ${i + 1} 行: "${lines[i]?.slice(0, 80)}..."`);
          }
        }
        
        let errorMsg = `未找到要替换的文本。\n\n`;
        errorMsg += `要查找的文本 (前150字符):\n---\n${oldTextPreview}${oldText.length > 150 ? '...' : ''}\n---\n\n`;
        
        if (suggestions.length > 0) {
          errorMsg += `可能匹配的位置:\n${suggestions.slice(0, 3).join('\n')}\n\n`;
        }
        
        // 返回文件部分内容帮助模型理解
        errorMsg += `文件当前内容 (前30行):\n---\n`;
        errorMsg += lines.slice(0, 30).join('\n');
        if (lines.length > 30) {
          errorMsg += `\n... (共 ${lines.length} 行)`;
        }
        errorMsg += `\n---\n\n`;
        errorMsg += `建议: 请根据文件当前内容，提供正确的 oldText 进行替换。`;
        
        return { 
          success: false, 
          error: errorMsg
        };
      }
      
      // 计算匹配次数
      const matchCount = (content.match(new RegExp(escapeRegExp(oldText), 'g')) || []).length;
      
      // 执行替换（替换所有匹配项）
      const newContent = content.split(oldText).join(newText);
      
      // 写入文件
      await writeFile(validation.resolved, newContent, 'utf-8');
      
      let resultMsg = `文件已编辑: ${path}`;
      if (matchCount > 1) {
        resultMsg += ` (替换了 ${matchCount} 处)`;
      }
      
      return {
        success: true,
        content: resultMsg,
        metadata: {
          path: validation.resolved,
          replaced: oldText.length,
          with: newText.length,
          matchCount,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `编辑文件失败: ${message}` };
    }
  },
};

// 辅助函数：转义正则特殊字符
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}