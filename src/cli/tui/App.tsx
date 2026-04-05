import React, { useEffect, useCallback } from 'react';
import { Box, Text, useApp as useInkApp, useInput } from 'ink';
import { AppProvider, useApp } from './context/index.js';
import { MainLayout, InputArea } from './components/index.js';
import { theme } from './styles/theme.js';

interface AppProps {
  defaultAgent?: string;
  onMessage?: (message: string) => Promise<void> | void;
  commands?: string[];
  agents?: string[];
}

const AppContent: React.FC<AppProps> = ({ 
  defaultAgent = 'dev',
  onMessage,
  commands = ['/help', '/exit', '/clear', '/agents', '/skills'],
  agents = ['dev', 'support', 'analyst'],
}) => {
  const { exit } = useInkApp();
  const { 
    addMessage, 
    setCurrentAgent, 
    setAgents, 
    addLog, 
    setIsStreaming,
  } = useApp();

  useEffect(() => {
    setAgents(agents.map(id => ({
      id,
      name: id,
      status: 'idle' as const,
    })));
    
    setCurrentAgent(defaultAgent);
    
    addMessage({
      sender: 'System',
      content: `Welcome to SecureBot! Current agent: ${defaultAgent}`,
      type: 'system',
    });
    
    addLog('TUI initialized', 'info');
  }, []);

  useInput((char, key) => {
    if (key.ctrl && char === 'c') {
      addMessage({
        sender: 'System',
        content: 'Goodbye!',
        type: 'system',
      });
      setTimeout(() => exit(), 100);
    }
  });

  const handleSubmit = useCallback(async (input: string) => {
    addMessage({
      sender: 'You',
      content: input,
      type: 'user',
    });

    addLog(`User input: ${input.slice(0, 30)}...`, 'info');

    if (onMessage) {
      setIsStreaming(true);
      try {
        await onMessage(input);
      } finally {
        setIsStreaming(false);
      }
    }
  }, [addMessage, addLog, setIsStreaming, onMessage]);

  return (
    <Box flexDirection="column" height="100%" width="100%">
      <MainLayout />
      
      <Box width={theme.layout.chatWidth}>
        <InputArea 
          onSubmit={handleSubmit}
          commands={commands}
          agents={agents}
        />
      </Box>
      
      <Box width={theme.layout.statusWidth} justifyContent="flex-end">
        <Box borderStyle="single" borderColor="green" paddingX={1}>
          <Text color="gray">Ctrl+C 退出</Text>
        </Box>
      </Box>
    </Box>
  );
};

export const App: React.FC<AppProps> = (props) => {
  return (
    <AppProvider>
      <AppContent {...props} />
    </AppProvider>
  );
};