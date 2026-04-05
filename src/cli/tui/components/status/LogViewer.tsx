import React from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../../context/index.js';

const MAX_VISIBLE_LOGS = 6;

export const LogViewer: React.FC = () => {
  const { logs, logScrollOffset } = useApp();

  const totalLogs = logs.length;

  if (totalLogs === 0) {
    return (
      <Box paddingX={1}>
        <Text color="gray" dimColor>
          No logs yet
        </Text>
      </Box>
    );
  }

  // 根据滚动偏移计算可见日志
  const endIdx = totalLogs - logScrollOffset;
  const startIdx = Math.max(0, endIdx - MAX_VISIBLE_LOGS);
  const visibleLogs = logs.slice(startIdx, endIdx);

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
            [{time}]
            {' '}
            <Text color={config.color as any}>{config.icon}</Text>{' '}
            {log.message.length > 40 ? `${log.message.slice(0, 40)}..` : log.message}
          </Text>
        );
      })}
      {/* 滚动指示 */}
      {logScrollOffset > 0 && startIdx > 0 && (
        <Text color="cyan" dimColor> ... older</Text>
      )}
    </Box>
  );
};