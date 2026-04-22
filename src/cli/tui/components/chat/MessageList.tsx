import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../../types/index.js';
import { ScrollBar } from '../common/ScrollBar.js';
import { useApp } from '../../context/index.js';
import { CodeEditorPanel } from './CodeEditor.js';
import { ShellOutputPanel } from './ShellOutputPanel.js';
import { flattenCollapsibleMessage } from './CollapsibleMessage.js';

interface Props {
  messages: Message[];
  scrollOffset?: number;
  /** 消息点击回调（用于切换折叠） */
  onMessageClick?: (messageId: string) => void;
}

/** 滚动窗口固定行数 */
const WINDOW_HEIGHT = 30;

/**
 * 扁平化行（带样式和对齐信息）
 */
interface FlatLine {
  text: string;
  align: 'left' | 'right';
  color?: string;       // 文字颜色
  bold?: boolean;       // 加粗（头部）
  dim?: boolean;        // 暗淡
  prefix?: string;      // 内容前缀
  clickable?: boolean;  // 是否可点击
  messageId?: string;   // 所属消息ID
}

/** 消息类型视觉风格 — 炫酷现代风格 */
const MSG_STYLES: Record<string, { headerColor: string; contentColor: string; icon: string; prefix: string }> = {
  user:   { headerColor: 'green',   contentColor: 'white',   icon: '\u25b6', prefix: '' },
  agent:  { headerColor: 'cyan',    contentColor: 'white',   icon: '\u2728', prefix: ' \u2503 ' },  // ✨ │
  system: { headerColor: '#8888aa', contentColor: '#666688', icon: '\u25a1', prefix: ' \u25cb ' }, // □ ○ 暗淡灰蓝
  tool:   { headerColor: 'yellow',  contentColor: '#dddd77', icon: '\u2699', prefix: ' \u25aa ' }, // ⚙ ▪ 金色
  error:  { headerColor: 'red',     contentColor: 'red',     icon: '\u26a0', prefix: '' },
  skill:  { headerColor: 'magenta',contentColor: 'white',   icon: '\u{1f527}', prefix: '' },
  warn:   { headerColor: 'yellow',  contentColor: 'yellow',  icon: '~',     prefix: '' },
  thinking: { headerColor: 'magenta', contentColor: 'magenta', icon: '\u{1f4ad}', prefix: ' \u2503 ' }, // 💭 │
};

/**
 * 将所有消息完整展开为扁平化行列表（支持折叠）
 * 每种消息类型有独特的视觉风格
 */
function flattenAllMessages(messages: Message[], selectedMessageId: string | null): FlatLine[] {
  const lines: FlatLine[] = [];
  messages.forEach((msg) => {
    const isSelected = msg.id === selectedMessageId;
    const isUser = msg.type === 'user';

    // 工具调用和思考消息使用折叠组件
    if (msg.type === 'tool' || msg.type === 'thinking' || msg.subType === 'thinking') {
      const collapsibleLines = flattenCollapsibleMessage(msg, isSelected);
      collapsibleLines.forEach((cl) => {
        lines.push({
          text: cl.text,
          align: 'left',
          color: cl.color,
          bold: cl.bold,
          dim: cl.dim,
          clickable: cl.clickable,
          messageId: cl.messageId,
        });
      });
      return;
    }

    // 普通消息（用户、agent、system等）
    const style = MSG_STYLES[msg.type] || MSG_STYLES.system;
    const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    lines.push({
      text: `${style.icon} ${msg.sender} ${time}`,
      align: isUser ? 'right' : 'left', color: style.headerColor, bold: true,
    });

    for (const line of msg.content.split('\n')) {
      lines.push({
        text: line,
        align: isUser ? 'right' : 'left',
        color: style.contentColor,
        dim: msg.type === 'system',
        prefix: isUser ? '' : style.prefix,
      });
    }
  });
  return lines;
}

export const MessageList: React.FC<Props> = ({
  messages,
  scrollOffset = 0,
  onMessageClick,
}) => {
  const {
    focusPanel,
    selectedMessageId,
    messageViewerOpen,
    messageScrollOffset,
    setMessageScrollOffset,
    selectMessage,
    setChatScroll,
    isStreaming,
    shellOutput,
    toggleCollapse,
  } = useApp();
  const isFocused = focusPanel === 'chat';

  // Streaming 时默认跟随最新内容，但用户主动上滚时尊重用户意图
  // 只有 offset=0（在底部）时才自动跟随，用户上滚后不再强制拉回
  React.useEffect(() => {
    if (isStreaming && scrollOffset === 0) {
      // 已经在底部，保持跟随（无需操作，新消息自动可见）
    }
    // 用户已上滚(scrollOffset > 0)：不强制拉回
  }, [isStreaming, scrollOffset, messages.length]);

  // 使用 useMemo 优化：完整展开所有消息（缓存结果，支持折叠）
  const allLines = useMemo(() => flattenAllMessages(messages, selectedMessageId), [messages, selectedMessageId]);
  const totalLines = allLines.length;

  // 使用 useMemo 优化：计算可见窗口范围（缓存计算结果）
  const viewport = useMemo(() => {
    const maxOffset = Math.max(0, totalLines - WINDOW_HEIGHT);
    const clampedOffset = Math.min(scrollOffset, maxOffset);
    // offset=0 显示最新内容（尾部），offset 增大往旧内容方向滚动
    const startIdx = Math.max(0, totalLines - WINDOW_HEIGHT - clampedOffset);
    const visibleLines = allLines.slice(startIdx, startIdx + WINDOW_HEIGHT);
    return { startIdx, clampedOffset, visibleLines };
  }, [allLines, totalLines, scrollOffset]);

  // 当前选中的消息
  const selectedMessage = useMemo(() => {
    return selectedMessageId
      ? messages.find(m => m.id === selectedMessageId) ?? null
      : null;
  }, [selectedMessageId, messages]);

  // 处理行点击（切换折叠或选择消息）
  const handleLineClick = (line: FlatLine) => {
    if (line.clickable && line.messageId) {
      // 可点击行：切换折叠状态
      toggleCollapse(line.messageId);
      selectMessage(line.messageId);
      onMessageClick?.(line.messageId);
    }
  };

  return (
    <Box flexDirection="column">
      {/* 行级滚动窗口 */}
      <Box flexDirection="row">
        <Box flexDirection="column" flexGrow={1} width="100%">
          {viewport.visibleLines.map((line, i) => {
            // 使用 messageId + startIdx + i 作为唯一 key，避免虚拟滚动时 key 冲突
            const uniqueKey = line.messageId
              ? `${line.messageId}-${viewport.startIdx + i}`
              : `line-${viewport.startIdx + i}`;

            return line.align === 'right' ? (
              <Box key={uniqueKey} width="100%" justifyContent="flex-end">
                <Text color={line.color} bold={line.bold}>{line.text}</Text>
              </Box>
            ) : line.clickable ? (
              <Box key={uniqueKey} onClick={() => handleLineClick(line)}>
                <Text color={line.color} bold={line.bold} dimColor={line.dim}>
                  {line.prefix}{line.text}
                </Text>
              </Box>
            ) : (
              <Text key={uniqueKey} color={line.color} bold={line.bold} dimColor={line.dim}>
                {line.prefix}{line.text}
              </Text>
            );
          })}
          {/* 底部信息栏 */}
          {totalLines > WINDOW_HEIGHT && (
            <Text color="gray" dimColor>
              {' '}lines {viewport.startIdx + 1}-{Math.min(viewport.startIdx + WINDOW_HEIGHT, totalLines)}/{totalLines}
            </Text>
          )}
        </Box>

        {/* 右侧滚动条 */}
        {totalLines > WINDOW_HEIGHT && (
          <ScrollBar
            total={totalLines}
            visible={WINDOW_HEIGHT}
            offset={viewport.clampedOffset}
            color={isFocused ? 'green' : 'blue'}
            // 内容区 = WINDOW_HEIGHT 行 + 1行信息栏
            height={totalLines > WINDOW_HEIGHT ? WINDOW_HEIGHT + 1 : WINDOW_HEIGHT}
          />
        )}
      </Box>

      {/* 代码写入动画窗口 - 实时显示文件写入过程 */}
      <CodeEditorPanel />

      {/* Shell 输出面板 - 实时显示 exec 命令输出 */}
      {shellOutput && (
        <ShellOutputPanel
          command={shellOutput.command}
          outputs={shellOutput.outputs}
          isRunning={shellOutput.isRunning}
          exitCode={shellOutput.exitCode}
          cwd={shellOutput.cwd}
        />
      )}

      {/* 消息查看器 - 固定14行 */}
      {messageViewerOpen && selectedMessage && (
        <Box
          flexDirection="column"
          borderTop="single"
          borderColor="yellow"
          height={14}
          backgroundColor="#1a1b26"
        >
          <Box flexShrink={0}>
            <Text bold color="yellow">
              {'\u25b6 '} Full Content [{messageScrollOffset + 1}-{Math.min(messageScrollOffset + 12, selectedMessage.content.split('\n').length)}/{selectedMessage.content.split('\n').length}]
            </Text>
            <Text color="gray" dimColor> (Wheel/PgUp/PgDn | Esc)</Text>
          </Box>
          <Box flexDirection="column" flexShrink={0}>
            {selectedMessage.content.split('\n')
              .slice(messageScrollOffset, messageScrollOffset + 12)
              .map((line, i) => (
                <Text key={i} color="white">{line || ' '}</Text>
              ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};
