import React from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../../types/index.js';
import { theme } from '../../styles/theme.js';

interface Props {
  message: Message;
  /** 最大内容行数（超过则截断），0=不限制 */
  maxContentLines?: number;
  /** 是否被选中（用于查看完整内容） */
  isSelected?: boolean;
  /** 选择此消息的回调 */
  onSelect?: () => void;
}

const DEFAULT_MAX_LINES = 8; // 每条消息最多显示 8 行（减少单条占用空间）

export const MessageItem: React.FC<Props> = ({
  message,
  maxContentLines = DEFAULT_MAX_LINES,
  isSelected = false,
}) => {
  const time = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // 工具调用消息特殊展示
  if (message.type === 'tool') {
    const meta = message.meta as { name?: string; arguments?: Record<string, unknown> } | undefined;
    const lines = message.content.split('\n');
    const truncated = maxContentLines > 0 && lines.length > maxContentLines;
    // 显示最后 N 行（最新内容在前），而非前 N 行
    const displayLines = truncated ? lines.slice(-maxContentLines) : lines;
    const selectedIndicator = isSelected ? <Text color="yellow"> {'\u25b6'}</Text> : null;

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="blue" bold>
            {'#'} {meta?.name || 'Tool'}
          </Text>
          <Text color="gray" dimColor>
            {' | '}{time}
          </Text>
          {truncated && (
            <Text color="yellow" dimColor> | [..{lines.length - maxContentLines} lines]</Text>
          )}
          {selectedIndicator}
        </Box>
        <Box paddingLeft={2} flexDirection="column">
          {truncated && (
            <Text color="yellow" dimColor>
              [... {lines.length - maxContentLines} earlier lines]{' '}
            </Text>
          )}
          {displayLines.map((line, i) => (
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
  const truncated = maxContentLines > 0 && lines.length > maxContentLines;
  // 显示最后 N 行（最新内容在前），而非前 N 行
  const displayLines = truncated ? lines.slice(-maxContentLines) : lines;
  const selectedIndicator = isSelected ? <Text color="yellow"> {'\u25b6'}</Text> : null;

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
        {truncated && (
          <Text color="yellow" dimColor> | [..{lines.length - maxContentLines} lines]</Text>
        )}
        {selectedIndicator}
      </Box>

      {/* 消息内容 */}
      <Box paddingLeft={2} flexDirection="column">
        {truncated && (
          <Text color="yellow" dimColor>
            [... {lines.length - maxContentLines} earlier lines]{' '}
          </Text>
        )}
        {displayLines.map((line, i) => (
          <Text key={i}>
            {line || ' '}
          </Text>
        ))}
      </Box>
    </Box>
  );
};
