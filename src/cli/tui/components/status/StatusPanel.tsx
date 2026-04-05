import React from 'react';
import { Box, Text } from 'ink';
import { TaskStatusPanel } from './TaskStatus.js';
import { AgentList } from './AgentList.js';
import { LogViewer } from './LogViewer.js';
import { theme } from '../../styles/theme.js';

export const StatusPanel: React.FC = () => {
  return (
    <Box 
      flexDirection="column" 
      width={theme.layout.statusWidth}
      height={theme.layout.contentHeight}
    >
      <Box 
        height="25%" 
        borderStyle="single" 
        borderColor="cyan"
        flexDirection="column"
      >
        <Box marginBottom={0}>
          <Text bold color="cyan">📋 任务状态</Text>
        </Box>
        <TaskStatusPanel />
      </Box>

      <Box 
        height="35%" 
        borderStyle="single" 
        borderColor="cyan"
        flexDirection="column"
      >
        <Box marginBottom={0}>
          <Text bold color="cyan">👥 Agent列表</Text>
        </Box>
        <AgentList />
      </Box>

      <Box 
        height="40%" 
        borderStyle="single" 
        borderColor="cyan"
        flexDirection="column"
      >
        <Box marginBottom={0}>
          <Text bold color="cyan">📝 执行日志</Text>
        </Box>
        <LogViewer />
      </Box>
    </Box>
  );
};