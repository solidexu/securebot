import React from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../../context/index.js';
import { theme } from '../../styles/theme.js';

export const TaskStatusPanel: React.FC = () => {
  const { taskStatus } = useApp();

  if (!taskStatus) {
    return (
      <Box paddingX={1}>
        <Text color="gray">暂无任务</Text>
      </Box>
    );
  }

  const statusIcon = theme.colors[taskStatus.status as keyof typeof theme.colors] || '📋';
  const statusColor = theme.colors[taskStatus.status as keyof typeof theme.colors] || 'white';

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={statusColor as any}>
        状态: {statusIcon} {taskStatus.status}
      </Text>
      <Text>轮次: {taskStatus.round}/{taskStatus.maxRounds}</Text>
      <Text>
        委托者: <Text color="cyan">{taskStatus.delegator}</Text>
      </Text>
      <Text>
        被委托者: <Text color="magenta">{taskStatus.delegatee}</Text>
      </Text>
      <Text color="gray">
        任务: {taskStatus.task.slice(0, 25)}...
      </Text>
    </Box>
  );
};