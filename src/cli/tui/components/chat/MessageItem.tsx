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

  // 工具调用消息特殊展示
  if (message.type === 'tool') {
    const meta = message.meta as { name?: string; arguments?: Record<string, unknown> } | undefined;
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="blue" bold>
            {'#'} {meta?.name || 'Tool'}
          </Text>
          <Text color="gray" dimColor>
            {' | '}{time}
          </Text>
        </Box>
        <Box paddingLeft={2} flexDirection="column">
          {message.content.split('\n').map((line, i) => (
            <Text key={i} color="cyan">
              {line || ' '}
            </Text>
          ))}
        </Box>
      </Box>
    );
  }

  const config = theme.message[message.type];
  const lines = message.content.split('\n');

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* 消息头部 */}
      <Box>
        <Text color={config.color as any} bold>
          {config.icon} {message.sender}
        </Text>
        <Text color="gray" dimColor>
          {' | '}{time}
        </Text>
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