import React from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../../types/index.js';
import { theme } from '../../styles/theme.js';

interface Props {
  message: Message;
  /** 最大内容行数（超过则截断），0=不限制 */
  maxContentLines?: number;
}

const DEFAULT_MAX_LINES = 12; // 每条消息最多显示 12 行（与 MAX_VISIBLE_MSGS=6 配合使用）

export const MessageItem: React.FC<Props> = ({ message, maxContentLines = DEFAULT_MAX_LINES }) => {
  const time = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // 工具调用消息特殊展示
  if (message.type === 'tool') {
    const meta = message.meta as { name?: string; arguments?: Record<string, unknown> } | undefined;
    const lines = message.content.split('\n');
    const truncated = maxContentLines > 0 && lines.length > maxContentLines;
    const displayLines = truncated ? lines.slice(0, maxContentLines) : lines;

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
          {displayLines.map((line, i) => (
            <Text key={i} color="cyan">
              {line || ' '}
            </Text>
          ))}
          {truncated && (
            <Text color="yellow" dimColor>
              {' '}[... {lines.length - maxContentLines} more lines]
            </Text>
          )}
        </Box>
      </Box>
    );
  }

  const config = theme.message[message.type];
  const lines = message.content.split('\n');
  const truncated = maxContentLines > 0 && lines.length > maxContentLines;
  const displayLines = truncated ? lines.slice(0, maxContentLines) : lines;

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
        {displayLines.map((line, i) => (
          <Text key={i}>
            {line || ' '}
          </Text>
        ))}
        {truncated && (
          <Text color="yellow" dimColor>
            {' '}[... {lines.length - maxContentLines} more lines]
          </Text>
        )}
      </Box>
    </Box>
  );
};
