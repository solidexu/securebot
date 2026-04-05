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

      {/* 宽间距分隔区 - 3列空白+边框，改善复制隔离 */}
      <Box
        width={3}
        height="100%"
        flexDirection="column"
        alignItems="center"
      >
        {/* 视觉分隔线 */}
        <Box
          width={1}
          height="100%"
          borderStyle="single"
          borderColor="gray"
        />
      </Box>

      {/* 右侧状态栏 */}
      <StatusPanel />
    </Box>
  );
};