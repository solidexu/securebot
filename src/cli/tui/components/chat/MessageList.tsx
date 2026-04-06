import React from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../../types/index.js';
import { MessageItem } from './MessageItem.js';
import { ScrollBar } from '../common/ScrollBar.js';
import { useApp } from '../../context/index.js';

interface Props {
  messages: Message[];
  scrollOffset?: number;   // 滚动偏移（0=最新）
}

/**
 * 估算单条消息的渲染行数
 * 简化计算：每行约 80 字符宽度，内容行 + 头部行
 */
function estimateLines(message: Message): number {
  const headerLines = 1;
  const contentLines = message.content.split('\n').length;
  // 工具类消息额外缩进占用更多视觉空间
  const extraPadding = message.type === 'tool' ? Math.ceil(contentLines * 0.2) : 0;
  return headerLines + contentLines + extraPadding;
}

export const MessageList: React.FC<Props> = ({
  messages,
  scrollOffset = 0,
}) => {
  const { focusPanel } = useApp();
  const isFocused = focusPanel === 'chat';
  const totalMessages = messages.length;

  // 获取终端高度，动态计算可见行数
  // 减去：header(3) + inputArea(3) + statusBar(1) + chatPanel标题栏(1) + 边框/间距(4) ≈ 12
  const availableRows = process.stdout.rows || 30;
  const MAX_VISIBLE_ROWS = Math.max(8, availableRows - 14);

  if (totalMessages === 0) {
    return (
      <Box paddingX={2}>
        <Text color="gray">No messages yet</Text>
      </Box>
    );
  }

  // 计算每条消息的预估行数
  const msgLineCounts = messages.map(m => estimateLines(m));
  const totalLines = msgLineCounts.reduce((a, b) => a + b, 0);

  if (totalLines <= MAX_VISIBLE_ROWS) {
    // 所有消息都能显示，直接渲染
    return (
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" flexGrow={1} flexShrink={1} width="100%">
          {messages.map((msg) => (
            <MessageItem key={msg.id} message={msg} />
          ))}
        </Box>
        {totalMessages > 10 && (
          <ScrollBar total={totalMessages} visible={totalMessages} offset={0}
            color={isFocused ? 'green' : 'blue'} />
        )}
      </Box>
    );
  }

  // 需要滚动：从末尾往前找能放入 MAX_VISIBLE_ROWS 行的消息范围
  let endIdx = totalMessages;
  let accumulatedLines = 0;
  let startIdx = totalMessages - 1;

  while (startIdx >= 0 && accumulatedLines < MAX_VISIBLE_ROWS) {
    accumulatedLines += msgLineCounts[startIdx];
    if (accumulatedLines >= MAX_VISIBLE_ROWS && startIdx < endIdx - 1) {
      break;
    }
    startIdx--;
  }

  // 应用滚动偏移：从 endIdx 向前推 scrollOffset 对应的行数
  if (scrollOffset > 0) {
    // 将偏移转换为消息索引偏移
    let offsetLines = 0;
    let offsetIdx = totalMessages - 1;
    while (offsetIdx >= 0 && offsetLines < scrollOffset * 5) {  // 每次 PgUp/PgDn 约 5 条消息
      offsetLines += msgLineCounts[offsetIdx];
      offsetIdx--;
    }
    if (offsetIdx >= 0) {
      endIdx = offsetIdx + 1;
      // 重新计算可见范围
      accumulatedLines = 0;
      startIdx = endIdx - 1;
      while (startIdx >= 0 && accumulatedLines < MAX_VISIBLE_ROWS) {
        accumulatedLines += msgLineCounts[startIdx];
        startIdx--;
      }
      startIdx++;
    }
  }

  startIdx = Math.max(0, startIdx);
  const visibleMessages = messages.slice(startIdx, endIdx);

  return (
    <Box flexDirection="row" flexGrow={1}>
      {/* 消息内容区 */}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} width="100%">
        {visibleMessages.map((msg) => (
          <MessageItem key={msg.id} message={msg} />
        ))}
        {/* 滚动指示器 */}
        {scrollOffset > 0 && startIdx > 0 && (
          <Text color="yellow" dimColor>
            {' ... ('}{startIdx} older){' '}
            <Text color="cyan">(PgUp/PgDn/\u2191\u2193)</Text>
          </Text>
        )}
        {scrollOffset === 0 && totalLines > MAX_VISIBLE_ROWS && (
          <Text color="gray" dimColor>
            {' '}{endIdx}/{totalMessages} msgs | {MAX_VISIBLE_ROWS} rows
          </Text>
        )}
      </Box>

      {/* 右侧滚动条指示器 */}
      <ScrollBar
        total={totalMessages}
        visible={endIdx - startIdx}
        offset={scrollOffset}
        color={isFocused ? 'green' : 'blue'}
      />
    </Box>
  );
};