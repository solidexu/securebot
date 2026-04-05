import React from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../../context/index.js';
import { theme } from '../../styles/theme.js';

export const AgentList: React.FC = () => {
  const { agents, currentAgent } = useApp();

  if (agents.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color="gray" dimColor>
          No agents available
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {agents.map((agent) => {
        const config = theme.agent[agent.status];
        const isCurrent = agent.id === currentAgent;

        return (
          <Box key={agent.id} flexDirection="row" marginBottom={isCurrent ? 1 : 0}>
            {/* 状态指示器 */}
            <Text color={config.color as any}>
              {config.icon}{' '}
            </Text>

            {/* Agent ID */}
            <Text bold={isCurrent} color={isCurrent ? 'white' : (config.color as any)}>
              {agent.id}
            </Text>

            {/* 当前标记 */}
            {isCurrent && (
              <Text color="yellow">{' *current'}</Text>
            )}

            {/* 工作状态下的任务信息 */}
            {agent.status === 'working' && agent.currentTask && (
              <Text color="gray" dimColor marginLeft={1}>
                {'\u2502'} {agent.currentTask.slice(0, 22)}
                {agent.currentTask.length > 22 && '...'}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
};