import React from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../../context/index.js';
import { theme } from '../../styles/theme.js';

export const AgentList: React.FC = () => {
  const { agents, currentAgent } = useApp();

  if (agents.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color="gray">无Agent</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {agents.map((agent) => {
        const config = theme.agent[agent.status];
        const isCurrent = agent.id === currentAgent;

        return (
          <Box key={agent.id} flexDirection="column">
            <Text color={config.color as any}>
              {config.icon} {agent.id}
              {isCurrent && <Text color="yellow"> (当前)</Text>}
            </Text>
            {agent.status === 'working' && agent.currentTask && (
              <Text color="gray">  {agent.currentTask.slice(0, 20)}...</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
};