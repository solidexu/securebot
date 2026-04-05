import React from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../../context/index.js';

export const LogViewer: React.FC = () => {
  const { logs } = useApp();

  const visibleLogs = logs.slice(-10);

  if (visibleLogs.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color="gray" dimColor>
          No logs yet
        </Text>
      </Box>
    );
  }

  // 日志级别图标和颜色映射
  const levelConfig: Record<string, { icon: string; color: string }> = {
    error: { icon: '!', color: 'red' },
    warn:  { icon: '*', color: 'yellow' },
    info:  { icon: '-', color: 'gray' },
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      {visibleLogs.map((log) => {
        const config = levelConfig[log.level] || levelConfig.info;
        const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        return (
          <Text key={log.id} color={config.color as any} dimColor={log.level !== 'error'}>
            [{time}]{' '}
            <Text color={config.color as any}>{config.icon}</Text>{' '}
            {log.message.length > 45 ? `${log.message.slice(0, 45)}...` : log.message}
          </Text>
        );
      })}
    </Box>
  );
};