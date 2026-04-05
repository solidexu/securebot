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
    <Box flexDirection="column" width="100%">
      {/* 上分隔线 */}
      <Text color="green">
        {'\u250c'}{'\u2500'.repeat(process.stdout.columns || 80)}{'\u2510'}
      </Text>

      {/* 提示行 */}
      <Box>
        <Text color="green">{'\u2502'}</Text>
        <Text color="gray" dimColor>
          {' '}
          {isStreaming
            ? '\u25b6 Generating... | Ctrl+C stop'
            : '\u25cb Enter send | Tab auto | \u2191/\u2193 history'
          }
        </Text>
      </Box>

      {/* 输入行 */}
      <Box>
        <Text color="green">{'\u2502'}</Text>
        <InputBox onSubmit={onSubmit} commands={commands} agents={agents} />
      </Box>

      {/* 下分隔线 */}
      <Text color="green">
        {'\u2514'}{'\u2500'.repeat(process.stdout.columns || 80)}{'\u2518'}
      </Text>
    </Box>
  );
};