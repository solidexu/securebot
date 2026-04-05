import React from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../../types/index.js';
import { theme } from '../../styles/theme.js';

interface Props {
  message: Message;
}

export const MessageItem: React.FC<Props> = ({ message }) => {
  const time = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const config = theme.message[message.type];
  const lines = message.content.split('\n');

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={config.color} bold>
          {config.icon} {message.sender}
        </Text>
        <Text color="gray"> {time}</Text>
      </Box>
      <Box paddingLeft={2} flexDirection="column">
        {lines.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </Box>
    </Box>
  );
};