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
      {/* 消息头部 */}
      <Box>
        {/* 发送者 */}
        <Text color={config.color as any} bold>
          {config.icon} {message.sender}
        </Text>

        {/* 时间戳 */}
        <Text color="gray" dimColor>
          {' | '}{time}
        </Text>

        {/* 类型标签 */}
        {message.type !== 'user' && (
          <Text color="gray" dimColor>
            {' ['}{message.type}{']'}
          </Text>
        )}
      </Box>

      {/* 消息内容 */}
      <Box paddingLeft={2} flexDirection="column">
        {lines.map((line, i) => (
          <Text key={i}>
            {line || ' '}
          </Text>
        ))}
      </Box>
    </Box>
  );
};