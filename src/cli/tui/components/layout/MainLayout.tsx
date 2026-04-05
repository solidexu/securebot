import React from 'react';
import { Box, Text } from 'ink';
import { ChatPanel } from '../chat/index.js';
import { StatusPanel } from '../status/index.js';
import { theme } from '../../styles/theme.js';

export const MainLayout: React.FC = () => {
  return (
    <Box width="100%" height="100%" flexDirection="row">
      {/* 左侧聊天区 */}
      <ChatPanel />

      {/* 垂直分隔符 - 提供视觉隔离，辅助精确复制 */}
      <Box
        width={1}
        height="100%"
        borderStyle="single"
        borderColor="gray"
      />

      {/* 右侧状态栏 */}
      <StatusPanel />
    </Box>
  );
};