import React from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../../context/index.js';
import { theme } from '../../styles/theme.js';

export const TaskStatusPanel: React.FC = () => {
  const { taskStatus } = useApp();

  if (!taskStatus) {
    return (
      <Box paddingX={1}>
        <Box flexDirection="column">
          <Text color="gray" dimColor>
            {'\u25cb No active task'}
          </Text>
          <Text color="gray" dimColor>
            Waiting for agent assignment...
          </Text>
        </Box>
      </Box>
    );
  }

  const statusColors: Record<string, string> = {
    running: 'yellow',
    completed: 'green',
    pending: 'gray',
    failed: 'red',
  };

  const statusColor = statusColors[taskStatus.status] || 'white';

  return (
    <Box flexDirection="column" paddingX={1} flexShrink={0}>
      {/* 状态行 */}
      <Box flexGrow={1}>
        <Text color={statusColor as any}>
          {'\u25cf'} Status:{' '}
        </Text>
        <Text bold color={statusColor as any}>
          {taskStatus.status}
        </Text>
      </Box>

      {/* 回合行 */}
      <Box flexGrow={1}>
        <Text color="gray">
          {'  Round:'}{' '}
          <Text color="white">
            {taskStatus.round}/{taskStatus.maxRounds}
          </Text>
        </Text>
      </Box>

      {/* 来源行 */}
      <Box flexGrow={1}>
        <Text color="magenta">
          {'  From:'}{' '}
          <Text color="white">{taskStatus.delegator}</Text>
          {' \u2192 '}
          <Text color="cyan">{taskStatus.delegatee}</Text>
        </Text>
      </Box>

      {/* 任务行 */}
      <Box flexGrow={1}>
        <Text color="gray" dimColor>
          {'  Task: '}<Text>{taskStatus.task.slice(0, 28)}</Text>
          {taskStatus.task.length > 28 && '...'}
        </Text>
      </Box>
    </Box>
  );
};