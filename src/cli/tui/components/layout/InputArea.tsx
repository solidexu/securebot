import React from 'react';
import { Box, Text } from 'ink';
import { InputBox } from '../input/index.js';
import { useApp } from '../../context/index.js';
import { theme } from '../../styles/theme.js';

interface Props {
  onSubmit?: (input: string) => void;
  commands?: string[];
  agents?: string[];
}

export const InputArea: React.FC<Props> = ({ onSubmit, commands, agents }) => {
  const { isStreaming } = useApp();

  return (
    <Box 
      flexDirection="column" 
      width={theme.layout.chatWidth}
      height={theme.layout.inputHeight}
    >
      <Box marginBottom={0}>
        <Text color="gray">
          {isStreaming ? '⏳ 生成中... 按 Ctrl+C 中断' : 'Enter 发送 | Tab 补全 | ↑↓ 历史'}
        </Text>
      </Box>
      
      <InputBox onSubmit={onSubmit} commands={commands} agents={agents} />
    </Box>
  );
};