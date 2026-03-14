/**
 * 会话导出功能
 * 
 * 支持导出会话为 Markdown / JSON 格式
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Session } from '../core/types.js';

// ============ 导出格式 ============

export type ExportFormat = 'markdown' | 'json' | 'txt';

// ============ 导出结果 ============

export interface ExportResult {
  success: boolean;
  path?: string;
  error?: string;
}

// ============ Markdown 导出 ============

/**
 * 导出会话为 Markdown
 */
export function exportToMarkdown(session: Session, agentName: string): string {
  const lines: string[] = [];
  
  // 标题
  lines.push(`# ${agentName} 会话记录`);
  lines.push('');
  
  // 元信息
  const createdAt = session.createdAt instanceof Date 
    ? session.createdAt.toLocaleString('zh-CN')
    : new Date(session.createdAt).toLocaleString('zh-CN');
  const updatedAt = session.updatedAt instanceof Date
    ? session.updatedAt.toLocaleString('zh-CN')
    : new Date(session.updatedAt).toLocaleString('zh-CN');
  
  lines.push(`**会话 ID**: ${session.sessionKey}`);
  lines.push(`**创建时间**: ${createdAt}`);
  lines.push(`**更新时间**: ${updatedAt}`);
  lines.push(`**消息数量**: ${session.history.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // 对话内容
  for (const msg of session.history) {
    const role = {
      system: '🤖 系统',
      user: '👤 用户',
      assistant: '🤖 助手',
      tool: '🔧 工具',
    }[msg.role] ?? msg.role;
    
    lines.push(`### ${role}`);
    lines.push('');
    
    if (msg.role === 'tool') {
      lines.push(`**工具**: ${msg.name ?? 'unknown'}`);
      lines.push(`**调用 ID**: ${msg.toolCallId ?? 'N/A'}`);
      lines.push('');
      lines.push('```');
      lines.push(msg.content ?? '(无输出)');
      lines.push('```');
    } else {
      lines.push(msg.content ?? '(无内容)');
    }
    
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  
  // 页脚
  lines.push('');
  lines.push(`*导出于 ${new Date().toLocaleString('zh-CN')}*`);
  
  return lines.join('\n');
}

// ============ JSON 导出 ============

/**
 * 导出会话为 JSON
 */
export function exportToJson(session: Session, agentName: string): string {
  const data = {
    sessionKey: session.sessionKey,
    agentId: session.agentId,
    agentName,
    createdAt: session.createdAt instanceof Date 
      ? session.createdAt.toISOString()
      : session.createdAt,
    updatedAt: session.updatedAt instanceof Date
      ? session.updatedAt.toISOString()
      : session.updatedAt,
    history: session.history,
    exportedAt: new Date().toISOString(),
  };
  
  return JSON.stringify(data, null, 2);
}

// ============ TXT 导出 ============

/**
 * 导出会话为纯文本
 */
export function exportToTxt(session: Session, agentName: string): string {
  const lines: string[] = [];
  
  lines.push(`${agentName} 会话记录`);
  lines.push('='.repeat(50));
  lines.push('');
  
  for (const msg of session.history) {
    const role = {
      system: '系统',
      user: '用户',
      assistant: '助手',
      tool: '工具',
    }[msg.role] ?? msg.role;
    
    lines.push(`[${role}]`);
    lines.push(msg.content ?? '(无内容)');
    lines.push('');
  }
  
  lines.push('='.repeat(50));
  lines.push(`导出于 ${new Date().toLocaleString('zh-CN')}`);
  
  return lines.join('\n');
}

// ============ 导出函数 ============

/**
 * 导出会话到文件
 */
export function exportSession(
  session: Session,
  agentName: string,
  options: {
    format?: ExportFormat;
    outputPath?: string;
    filename?: string;
  } = {}
): ExportResult {
  const format = options.format ?? 'markdown';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const defaultFilename = `session-${session.agentId}-${timestamp}`;
  const filename = options.filename ?? defaultFilename;
  
  // 生成内容
  let content: string;
  let extension: string;
  
  switch (format) {
    case 'json':
      content = exportToJson(session, agentName);
      extension = '.json';
      break;
    case 'txt':
      content = exportToTxt(session, agentName);
      extension = '.txt';
      break;
    case 'markdown':
    default:
      content = exportToMarkdown(session, agentName);
      extension = '.md';
      break;
  }
  
  // 确定输出路径
  const outputPath = options.outputPath ?? join(homedir(), '.securebot', 'exports');
  
  // 确保目录存在
  if (!existsSync(outputPath)) {
    mkdirSync(outputPath, { recursive: true });
  }
  
  // 写入文件
  const fullPath = join(outputPath, `${filename}${extension}`);
  
  try {
    writeFileSync(fullPath, content, 'utf-8');
    return {
      success: true,
      path: fullPath,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `导出失败: ${msg}`,
    };
  }
}

/**
 * 导出所有会话
 */
export function exportAllSessions(
  sessions: Map<string, Session>,
  agentName: string,
  options: {
    format?: ExportFormat;
    outputPath?: string;
  } = {}
): ExportResult[] {
  const results: ExportResult[] = [];
  
  for (const [key, session] of sessions) {
    if (session.history.length > 0) {
      const result = exportSession(session, agentName, {
        ...options,
        filename: `session-${session.agentId}-${key.replace(/:/g, '-')}`,
      });
      results.push(result);
    }
  }
  
  return results;
}