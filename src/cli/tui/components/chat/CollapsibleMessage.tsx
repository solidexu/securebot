/**
 * 可折叠消息组件 - 扁平化函数
 *
 * 用于将折叠消息转换为扁平化行列表，供点击计算使用
 */

import type { Message } from '../../types/message.js';

/** 折叠指示器 */
const COLLAPSED_ICON = '\u25b6';  // ▶
const EXPANDED_ICON = '\u25bc';   // ▼

/** 工具图标映射 */
const TOOL_ICONS: Record<string, string> = {
  read: '\u{1f4d4}',      // 📘
  write: '\u{1f4dd}',     // 📝
  edit: '\u270e',         // ✎
  exec: '\u{1f9ed}',      // 🧭
  ls: '\u{1f4c1}',        // 📁
  search: '\u{1f50d}',    // 🔍
  git: '\u{1f334}',       // 🌴
};

/** 思考图标 */
const THINKING_ICON = '\u{1f4ad}';  // 💭

/** 扁平化行 */
export interface FlatCollapsibleLine {
  text: string;
  messageId: string;
  clickable: boolean;
}

/**
 * 生成消息摘要
 */
function generateSummary(message: Message): string {
  const meta = message.meta as Record<string, unknown> | undefined;

  // 工具调用结果
  if (message.type === 'tool' && meta?.name) {
    const toolName = meta.name as string;
    const icon = TOOL_ICONS[toolName] || '\u{1f9fe}';

    if (toolName === 'read') {
      const path = meta.path as string | undefined || '(unknown)';
      const lines = message.content.split('\n').length;
      return `${icon} read: ${path} (${lines} lines)`;
    }

    if (toolName === 'write' || toolName === 'edit') {
      const path = meta.path as string | undefined || '(unknown)';
      const status = message.content.includes('done') || message.content.includes('\u2713')
        ? '\u2713' : '\u2717';
      return `${icon} ${toolName}: ${path} ${status}`;
    }

    if (toolName === 'exec') {
      const command = meta.command as string | undefined || '(unknown)';
      const status = message.content.includes('\u2713') ? '\u2713' : '\u2717';
      const cmdPreview = command.length > 30 ? command.slice(0, 30) + '...' : command;
      return `${icon} exec: ${cmdPreview} ${status}`;
    }

    const preview = message.content.slice(0, 50);
    return `${icon} ${toolName}: ${preview}${message.content.length > 50 ? '...' : ''}`;
  }

  // 思考过程
  if (message.subType === 'thinking' || message.type === 'thinking') {
    return `${THINKING_ICON} Thinking... \u2713`;
  }

  // 普通消息
  const preview = message.content.slice(0, 50).replace(/\n/g, ' ');
  return `${preview}${message.content.length > 50 ? '...' : ''}`;
}

/**
 * 扁平化折叠消息为行列表（用于点击计算）
 */
export function flattenCollapsibleMessage(message: Message, isSelected: boolean): FlatCollapsibleLine[] {
  const isCollapsed = message.collapsed !== false;
  const summary = message.summary || generateSummary(message);
  const time = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isThinking = message.subType === 'thinking' || message.type === 'thinking';

  const headerColor = isThinking ? 'magenta' :
                      message.type === 'tool' ? 'yellow' :
                      message.type === 'error' ? 'red' :
                      message.type === 'agent' ? 'cyan' :
                      'white';

  const indicatorColor = isSelected ? 'green' : 'gray';
  const indicator = isCollapsed ? COLLAPSED_ICON : EXPANDED_ICON;

  const lines: FlatCollapsibleLine[] = [];

  // 头部行（可点击）
  lines.push({
    text: `${indicator} ${summary} ${time}${isSelected ? ' [selected]' : ''}`,
    messageId: message.id,
    clickable: true,
  });

  // 展开状态：添加内容行
  if (!isCollapsed) {
    const contentLines = message.content.split('\n');
    const contentColor = isThinking ? 'magenta' :
                         message.type === 'tool' ? '#dddd77' :
                         'white';

    contentLines.slice(0, 20).forEach((line) => {
      lines.push({
        text: `\u2503 ${line || ' '}`,
        messageId: message.id,
        clickable: false,
      });
    });

    if (contentLines.length > 20) {
      lines.push({
        text: `\u2503 ... (${contentLines.length - 20} more lines)`,
        messageId: message.id,
        clickable: false,
      });
    }
  }

  return lines;
}