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
      {/* 提示信息 - 在框外，不受边框约束 */}
      <Text color="gray" dimColor>
        {'  '}{isStreaming ? '\u25b6 Generating... | Ctrl+C stop' : '\u25cb Enter send | Tab auto | \u2191/\u2193 history'}
      </Text>

      {/* 输入框 - 单行边框，内容自适应 */}
      <Box
        borderStyle="single"
        borderColor="green"
        paddingLeft={0}
        paddingRight={0}
        height={1}
      >
        <InputBox onSubmit={onSubmit} commands={commands} agents={agents} />
      </Box>
    </Box>
  );
};