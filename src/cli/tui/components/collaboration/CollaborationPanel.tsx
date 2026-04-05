import React from 'react';
import { Box, Text } from 'ink';
import type { TaskStatus, AgentInfo, LogEntry } from '../../types/index.js';
import { theme } from '../../styles/theme.js';

interface Props {
  taskStatus: TaskStatus | null;
  agents: AgentInfo[];
  currentAgent: string;
  logs: LogEntry[];
  onAgentSelect?: (agentId: string) => void;
}

export const CollaborationPanel: React.FC<Props> = ({
  taskStatus,
  agents,
  currentAgent,
  logs,
}) => {
  return (
    <Box flexDirection="column" width={theme.layout.statusWidth} height="100%">
      <Box
        height="20%"
        borderStyle="single"
        borderColor="cyan"
        flexDirection="column"
      >
        <Box marginBottom={0}>
          <Text bold color="cyan">📋 任务状态</Text>
        </Box>
        {taskStatus ? (
          <Box flexDirection="column">
            <Text color="yellow">
              状态: {taskStatus.status}
            </Text>
            <Text>
              轮次: {taskStatus.round}/{taskStatus.maxRounds}
            </Text>
          </Box>
        ) : (
          <Text color="gray">暂无任务</Text>
        )}
      </Box>

      <Box
        height="40%"
        borderStyle="single"
        borderColor="cyan"
        flexDirection="column"
      >
        <Box marginBottom={0}>
          <Text bold color="cyan">👥 Agent 协作</Text>
        </Box>
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
                <Text color="gray">  {agent.currentTask.slice(0, 25)}...</Text>
              )}
            </Box>
          );
        })}
      </Box>

      <Box
        height="40%"
        borderStyle="single"
        borderColor="cyan"
        flexDirection="column"
      >
        <Box marginBottom={0}>
          <Text bold color="cyan">📝 协作日志</Text>
        </Box>
        {logs.slice(-8).map((log) => {
          const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          });
          const color = log.level === 'error' ? 'red' 
                      : log.level === 'warn' ? 'yellow' 
                      : 'gray';
          
          return (
            <Text key={log.id} color={color}>
              [{time}] {log.message.slice(0, 35)}
              {log.message.length > 35 && '...'}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
};