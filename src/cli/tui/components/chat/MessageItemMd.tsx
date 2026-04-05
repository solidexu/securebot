import React from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../../types/index.js';
import { theme } from '../../styles/theme.js';
import { markdownRenderer } from '../../services/MarkdownRenderer.js';

interface Props {
  message: Message;
  enableMarkdown?: boolean;
}

export const MessageItemMd: React.FC<Props> = ({ message, enableMarkdown = true }) => {
  const time = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const config = theme.message[message.type];

  const renderContent = () => {
    if (!enableMarkdown) {
      return <Text>{message.content}</Text>;
    }

    const { elements } = markdownRenderer.render(message.content);
    return <>{elements}</>;
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={config.color} bold>
          {config.icon} {message.sender}
        </Text>
        <Text color="gray"> {time}</Text>
      </Box>
      <Box paddingLeft={2} flexDirection="column">
        {renderContent()}
      </Box>
    </Box>
  );
};