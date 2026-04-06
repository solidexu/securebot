import React from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../../types/index.js';
import { ScrollBar } from '../common/ScrollBar.js';
import { useApp } from '../../context/index.js';
import { CodeEditorPanel } from './CodeEditor.js';

interface Props {
  messages: Message[];
  scrollOffset?: number;
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
};

/**
 * 将所有消息完整展开为扁平化行列表（不截断）
 * 每种消息类型有独特的视觉风格
 */
function flattenAllMessages(messages: Message[]): FlatLine[] {
  const lines: FlatLine[] = [];
  messages.forEach((msg) => {
    const isUser = msg.type === 'user';
    const style = MSG_STYLES[msg.type] || MSG_STYLES.system;
    const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    if (msg.type === 'tool') {
      const meta = msg.meta as { name?: string } | undefined;
      lines.push({
        text: `${style.icon} ${meta?.name || 'Tool'} ${time}`,
        align: 'left', color: style.headerColor, bold: true,
      });
    } else {
      lines.push({
        text: `${style.icon} ${msg.sender} ${time}`,
        align: isUser ? 'right' : 'left', color: style.headerColor, bold: true,
      });
    }

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
  } = useApp();
  const isFocused = focusPanel === 'chat';

  // Streaming 时强制保持在最新位置（offset=0 = 最底部）
  // 依赖 scrollOffset 确保用户手动滚动后也能重置回来
  React.useEffect(() => {
    if (isStreaming && scrollOffset !== 0) {
      setChatScroll(0);
    }
  }, [isStreaming, scrollOffset, messages.length]);

  if (messages.length === 0) {
    return (
      <Box paddingX={2}>
        <Text color="gray">No messages yet</Text>
      </Box>
    );
  }

  // 完整展开所有消息
  const allLines = flattenAllMessages(messages);
  const totalLines = allLines.length;

  // 计算可见窗口范围（底部锚定模式）
  const maxOffset = Math.max(0, totalLines - WINDOW_HEIGHT);
  const clampedOffset = Math.min(scrollOffset, maxOffset);
  // offset=0 显示最新内容（尾部），offset 增大往旧内容方向滚动
  const startIdx = Math.max(0, totalLines - WINDOW_HEIGHT - clampedOffset);
  const visibleLines = allLines.slice(startIdx, startIdx + WINDOW_HEIGHT);

  // 当前选中的消息
  const selectedMessage = selectedMessageId
    ? messages.find(m => m.id === selectedMessageId) ?? null
    : null;

  return (
    <Box flexDirection="column">
      {/* 行级滚动窗口 */}
      <Box flexDirection="row">
        <Box flexDirection="column" flexGrow={1} width="100%">
          {visibleLines.map((line, i) => (
            line.align === 'right' ? (
              <Box key={i} width="100%" justifyContent="flex-end">
                <Text color={line.color} bold={line.bold}>{line.text}</Text>
              </Box>
            ) : (
              <Text key={i} color={line.color} bold={line.bold} dimColor={line.dim}>
                {line.prefix}{line.text}
              </Text>
            )
          ))}
          {/* 底部信息栏 */}
          {totalLines > WINDOW_HEIGHT && (
            <Text color="gray" dimColor>
              {' '}lines {startIdx + 1}-{Math.min(startIdx + WINDOW_HEIGHT, totalLines)}/{totalLines}
            </Text>
          )}
        </Box>

        {/* 右侧滚动条 */}
        {totalLines > WINDOW_HEIGHT && (
          <ScrollBar
            total={totalLines}
            visible={WINDOW_HEIGHT}
            offset={clampedOffset}
            color={isFocused ? 'green' : 'blue'}
            // 内容区 = WINDOW_HEIGHT 行 + 1行信息栏
            height={totalLines > WINDOW_HEIGHT ? WINDOW_HEIGHT + 1 : WINDOW_HEIGHT}
          />
        )}
      </Box>

      {/* 代码写入动画窗口 - 实时显示文件写入过程 */}
      <CodeEditorPanel />

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
