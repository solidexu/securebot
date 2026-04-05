import React from 'react';
import { Box, Text } from 'ink';
import { TaskStatusPanel } from './TaskStatus.js';
import { AgentList } from './AgentList.js';
import { LogViewer } from './LogViewer.js';
import { theme } from '../../styles/theme.js';

export const StatusPanel: React.FC = () => {
  const panelStyle = theme.borders.normal;

  return (
    <Box
      flexDirection="column"
      width={theme.layout.statusWidth}
      height="100%"
      paddingX={0}
    >
      {/* 任务状态面板 */}
      <Box
        height={theme.layout.taskHeight}
        borderStyle={panelStyle}
        borderColor={theme.panel.task.border}
        flexDirection="column"
        marginBottom={0}
        paddingX={1}
      >
        <Box borderBottom borderColor={theme.panel.task.border} paddingY={0} marginBottom={1}>
          <Text bold color={theme.panel.task.title}>
            {' \u25cf '} Task Status
          </Text>
        </Box>
        <TaskStatusPanel />
      </Box>

      {/* Agent 列表面板 */}
      <Box
        height={theme.layout.agentHeight}
        borderStyle={panelStyle}
        borderColor={theme.panel.agent.border}
        flexDirection="column"
        marginTop={0}
        paddingX={1}
      >
        <Box borderBottom borderColor={theme.panel.agent.border} paddingY={0} marginBottom={1}>
          <Text bold color={theme.panel.agent.title}>
            {' \u25cf '} Agents
          </Text>
        </Box>
        <AgentList />
      </Box>

      {/* 执行日志面板 */}
      <Box
        height={theme.layout.logHeight}
        borderStyle={panelStyle}
        borderColor={theme.panel.log.border}
        flexDirection="column"
        marginTop={0}
        paddingX={1}
      >
        <Box borderBottom borderColor={theme.panel.log.border} paddingY={0} marginBottom={1}>
          <Text bold color={theme.panel.log.title}>
            {' \u25cf '} Logs
          </Text>
        </Box>
        <LogViewer />
      </Box>
    </Box>
  );
};