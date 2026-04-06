import React from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../../types/index.js';
import { ScrollBar } from '../common/ScrollBar.js';
import { useApp } from '../../context/index.js';

interface Props {
  messages: Message[];
  scrollOffset?: number;
}

/** 滚动窗口固定行数 */
const WINDOW_HEIGHT = 30;

/**
 * 将所有消息完整展开为扁平化行列表（不截断）
 */
function flattenAllMessages(messages: Message[]): string[] {
  const lines: string[] = [];
  messages.forEach((msg) => {
    // 头部行
    const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    if (msg.type === 'tool') {
      const meta = msg.meta as { name?: string } | undefined;
      lines.push(`# ${meta?.name || 'Tool'} | ${time}`);
    } else {
      const iconMap: Record<string, string> = {
        user: '>', agent: '*', system: '-', error: '!', skill: '\u{1f527}', warn: '~',
      };
      const icon = iconMap[msg.type] || '?';
      lines.push(`${icon} ${msg.sender} | ${time}`);
    }
    // 内容行 - 全部保留，不截断
    for (const line of msg.content.split('\n')) {
      lines.push(line);
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
  React.useEffect(() => {
    if (isStreaming && scrollOffset !== 0) {
      setChatScroll(0);
    }
  }, [isStreaming, messages.length]);

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

  // 计算可见窗口范围
  const maxOffset = Math.max(0, totalLines - WINDOW_HEIGHT);
  const offset = Math.min(scrollOffset, maxOffset);
  const visibleLines = allLines.slice(offset, offset + WINDOW_HEIGHT);

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
            <Text key={i}>{line}</Text>
          ))}
          {/* 底部信息栏 */}
          {totalLines > WINDOW_HEIGHT && (
            <Text color="gray" dimColor>
              {' '}lines {offset + 1}-{Math.min(offset + WINDOW_HEIGHT, totalLines)}/{totalLines}
            </Text>
          )}
        </Box>

        {/* 右侧滚动条 */}
        {totalLines > WINDOW_HEIGHT && (
          <ScrollBar
            total={totalLines}
            visible={WINDOW_HEIGHT}
            offset={offset}
            color={isFocused ? 'green' : 'blue'}
          />
        )}
      </Box>

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