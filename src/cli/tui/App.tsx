import React, { useEffect, useCallback } from 'react';
import { Box, Text, useApp as useInkApp, useInput } from 'ink';
import { AppProvider, useApp } from './context/index.js';
import { MainLayout, InputArea } from './components/index.js';
import { theme } from './styles/theme.js';

/** onMessage 回调的上下文参数 */
export interface MessageContext {
  setCurrentAgent?: (id: string) => void;
  setIsStreaming?: (v: boolean) => void;
  updateMessage?: (id: string, content: string) => void;
  addMessage?: (msg: any) => string;
  setTaskStatus?: (status: any) => void;
  addLog?: (msg: string, level?: string) => void;
  currentAgent?: string;
}

interface AppProps {
  defaultAgent?: string;
  /** 消息处理回调（传入消息内容和 UI 操作上下文） */
  onMessage?: (message: string, context: MessageContext) => Promise<void> | void;
  commands?: string[];
  agents?: string[];
}

/**
 * 顶部标题栏组件
 */
const HeaderBar: React.FC<{ agent: string }> = ({ agent }) => (
  <Box
    width="100%"
    height={theme.layout.headerHeight}
    borderStyle={theme.borders.titleBar}
    borderColor="cyan"
    justifyContent="space-between"
    paddingX={1}
  >
    <Text bold color="white">
      {' '}SecureBot{' '}
      <Text color="cyan">v1.0</Text>
    </Text>
    <Text color="yellow">
      Agent: <Text bold>{agent}</Text>
    </Text>
    <Text color="gray">
      Ctrl+C 退出 | Enter 发送
    </Text>
  </Box>
);

/**
 * 底部状态栏组件
 */
const StatusBar: React.FC = () => {
  const { isStreaming, currentAgent, messages } = useApp();

  return (
    <Box
      width="100%"
      height={theme.layout.footerHeight}
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
    >
      <Text color="gray">
        [{messages.length} msgs]
        {' | '}
        <Text color={isStreaming ? 'yellow' : 'green'}>
          {isStreaming ? '\u25b6 Generating...' : '\u25cb Ready'}
        </Text>
      </Text>
      <Text color="magenta">
        {' \u2502 '}
        <Text color="cyan">[{currentAgent}]</Text>
      </Text>
    </Box>
  );
};

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
    currentAgent,
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
      // 构建上下文对象，让 onMessage 回调可以操作 UI 状态
      const messageContext: MessageContext = {
        setCurrentAgent,
        setIsStreaming,
        updateMessage,
        addMessage,
        setTaskStatus,
        addLog,
        currentAgent,
      };

      try {
        await onMessage(input, messageContext);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        addMessage({
          sender: 'System',
          content: `Error: ${msg}`,
          type: 'error',
        });
        addLog(`处理消息失败: ${msg}`, 'error');
        setIsStreaming(false);
      }
    }
  }, [addMessage, addLog, onMessage, setCurrentAgent, setIsStreaming, updateMessage, setTaskStatus, currentAgent]);

  return (
    <Box flexDirection="column" height="100%" width="100%">
      {/* 顶部标题栏 */}
      <HeaderBar agent={currentAgent || defaultAgent} />

      {/* 主内容区域（Chat + Status） */}
      <Box flexGrow={1}>
        <MainLayout />
      </Box>

      {/* 输入区域 - 全宽，位于底部状态栏上方 */}
      <Box width="100%">
        <InputArea
          onSubmit={handleSubmit}
          commands={commands}
          agents={agents}
        />
      </Box>

      {/* 底部状态栏 */}
      <StatusBar />
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