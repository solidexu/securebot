import React from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../../types/index.js';
import { MessageItem } from './MessageItem.js';

interface Props {
  messages: Message[];
  visibleCount?: number;   // 最大可见消息数
  scrollOffset?: number;   // 滚动偏移（0=最新）
}

const MAX_VISIBLE = 15;

export const MessageList: React.FC<Props> = ({
  messages,
  visibleCount = MAX_VISIBLE,
  scrollOffset = 0,
}) => {
  const totalMessages = messages.length;
  if (totalMessages === 0) {
    return (
      <Box paddingX={2}>
        <Text color="gray">No messages yet</Text>
      </Box>
    );
  }

  // 计算可见范围: 从末尾往前数 visibleCount 条，再根据 offset 调整
  const endIdx = totalMessages - scrollOffset;
  const startIdx = Math.max(0, endIdx - visibleCount);
  const visibleMessages = messages.slice(startIdx, endIdx);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {visibleMessages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}
      {/* 滚动指示器 */}
      {scrollOffset > 0 && startIdx > 0 && (
        <Text color="yellow" dimColor>
          {' ... ('}{startIdx} older){' '}
          <Text color="cyan">(PgUp/PgDn to scroll)</Text>
        </Text>
      )}
      {scrollOffset === 0 && totalMessages > visibleCount && (
        <Text color="gray" dimColor>
          {' ... showing latest'} {visibleCount}/{totalMessages}
        </Text>
      )}
    </Box>
  );
};