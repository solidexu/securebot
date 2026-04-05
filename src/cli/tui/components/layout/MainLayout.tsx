import React from 'react';
import { Box, Text } from 'ink';
import { ChatPanel } from '../chat/index.js';
import { StatusPanel } from '../status/index.js';
import { theme } from '../../styles/theme.js';

export const MainLayout: React.FC = () => {
  return (
    <Box width="100%" height={theme.layout.contentHeight}>
      <ChatPanel />
      <StatusPanel />
    </Box>
  );
};