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
      height="100%"
      borderStyle={theme.borders.normal}
      borderColor="blue"
      paddingX={theme.layout.paddingX}
    >
      {/* 标题栏 */}
      <Box
        borderBottom
        borderColor="blue"
        marginBottom={1}
        paddingY={0}
      >
        <Text bold color="white">
          {' \u25cf '} Chat
        </Text>
        <Text color="gray">
          {' | '}{messages.length} messages
        </Text>
        {isStreaming && (
          <>
            {' '}
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            <Text color="yellow"> streaming</Text>
          </>
        )}
      </Box>

      {/* 消息列表 */}
      <Box flexGrow={1} flexDirection="column" overflow="hidden">
        <MessageList messages={messages} />
      </Box>
    </Box>
  );
};