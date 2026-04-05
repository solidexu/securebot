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
      width="100%"
      height={theme.layout.inputHeight}
      borderStyle={theme.borders.normal}
      borderColor="green"
      paddingX={theme.layout.paddingX}
    >
      {/* 提示信息 */}
      <Box paddingY={0} borderBottom borderColor="green">
        <Text color="gray" dimColor>
          {isStreaming
            ? '  \u25b6 Generating... Press Ctrl+C to stop'
            : '  \u25cb Enter to send | Tab for autocomplete | Up/Down history'
          }
        </Text>
      </Box>

      {/* 输入框 */}
      <InputBox onSubmit={onSubmit} commands={commands} agents={agents} />
    </Box>
  );
};