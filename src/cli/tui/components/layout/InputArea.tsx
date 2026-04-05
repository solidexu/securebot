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
    <Box flexDirection="column" width="100%" minHeight={2}>
      {/* 输入行 */}
      <Box paddingLeft={1} paddingRight={1}>
        <InputBox onSubmit={onSubmit} commands={commands} agents={agents} />
      </Box>
    </Box>
  );
};