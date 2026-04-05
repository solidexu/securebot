import React from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../../context/index.js';

export const LogViewer: React.FC = () => {
  const { logs } = useApp();

  const visibleLogs = logs.slice(-10);

  if (visibleLogs.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color="gray">暂无日志</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {visibleLogs.map((log) => {
        const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        const color = log.level === 'error' ? 'red' 
                    : log.level === 'warn' ? 'yellow' 
                    : 'gray';

        return (
          <Text key={log.id} color={color}>
            [{time}] {log.message.slice(0, 40)}
            {log.message.length > 40 && '...'}
          </Text>
        );
      })}
    </Box>
  );
};