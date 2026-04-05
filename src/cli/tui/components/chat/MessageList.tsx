import React from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../../types/index.js';
import { MessageItem } from './MessageItem.js';

interface Props {
  messages: Message[];
  maxHeight?: number;
}

export const MessageList: React.FC<Props> = ({ messages, maxHeight }) => {
  const visibleMessages = messages.slice(-50);

  if (messages.length === 0) {
    return (
      <Box paddingX={2}>
        <Text color="gray">暂无消息，开始对话吧！</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={maxHeight}>
      {visibleMessages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}
    </Box>
  );
};