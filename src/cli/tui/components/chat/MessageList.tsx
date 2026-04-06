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
 * 扁平化行（带对齐信息）
 */
interface FlatLine {
  text: string;
  align: 'left' | 'right'; // 用户消息右对齐，其他左对齐
}

/**
 * 将所有消息完整展开为扁平化行列表（不截断）
 * 用户消息（type=user）右对齐，其他消息左对齐
 */
function flattenAllMessages(messages: Message[]): FlatLine[] {
  const lines: FlatLine[] = [];
  messages.forEach((msg) => {
    const isUser = msg.type === 'user';
    // 头部行
    const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    if (msg.type === 'tool') {
      const meta = msg.meta as { name?: string } | undefined;
      lines.push({ text: `# ${meta?.name || 'Tool'} | ${time}`, align: 'left' });
    } else {
      const iconMap: Record<string, string> = {
        user: '>', agent: '*', system: '-', error: '!', skill: '\u{1f527}', warn: '~',
      };
      const icon = iconMap[msg.type] || '?';
      lines.push({ text: `${icon} ${msg.sender} | ${time}`, align: isUser ? 'right' : 'left' });
    }
    // 内容行 - 全部保留，不截断
    for (const line of msg.content.split('\n')) {
      lines.push({ text: line, align: isUser ? 'right' : 'left' });
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
                <Text>{line.text}</Text>
              </Box>
            ) : (
              <Text key={i}>{line.text}</Text>
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