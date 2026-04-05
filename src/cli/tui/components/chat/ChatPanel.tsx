import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useApp } from '../../context/index.js';
import { MessageList } from './MessageList.js';
import { theme } from '../../styles/theme.js';

export const ChatPanel: React.FC = () => {
  const { messages, isStreaming } = useApp();

  return (
    <Box 
      flexDirection="column" 
      width={theme.layout.chatWidth}
      height={theme.layout.contentHeight}
      borderStyle="single"
      borderColor="cyan"
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">
          💬 聊天
        </Text>
        <Text color="gray"> ({messages.length} 条消息)</Text>
      </Box>

      <Box flexGrow={1} flexDirection="column" overflow="hidden">
        <MessageList messages={messages} />
      </Box>

      {isStreaming && (
        <Box marginTop={1}>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text color="gray"> 正在生成...</Text>
        </Box>
      )}
    </Box>
  );
};