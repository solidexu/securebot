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
      borderStyle="single"
      borderColor="green"
      paddingLeft={1}
      paddingRight={1}
    >
      {/* 提示信息 */}
      <Box>
        <Text color="gray" dimColor>
          {isStreaming
            ? '\u25b6 Generating... | Ctrl+C stop'
            : '\u25cb Enter send | Tab auto | \u2191/\u2193 history'
          }
        </Text>
      </Box>

      {/* 输入框 */}
      <InputBox onSubmit={onSubmit} commands={commands} agents={agents} />
    </Box>
  );
};