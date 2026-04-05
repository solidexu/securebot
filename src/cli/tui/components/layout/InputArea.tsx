import React from 'react';
import { Box, Text } from 'ink';
import { InputBox } from '../input/index.js';

interface Props {
  onSubmit?: (input: string) => void;
  commands?: string[];
  agents?: string[];
}

export const InputArea: React.FC<Props> = ({ onSubmit, commands, agents }) => {
  return (
    <Box flexDirection="column" width="100%">
      {/* 上分隔线 */}
      <Text color="green">{'\u2500'.repeat(60)}</Text>

      {/* 输入行 */}
      <Box>
        <InputBox onSubmit={onSubmit} commands={commands} agents={agents} />
      </Box>
    </Box>
  );
};