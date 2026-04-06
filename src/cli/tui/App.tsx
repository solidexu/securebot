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
  setSkills?: (skills: { id: string; name: string; active?: boolean }[]) => void;
  startCodeWriter?: (filePath: string, content: string) => Promise<void>;
  startCodeEditor?: (filePath: string, oldContent?: string, newContent?: string) => Promise<void>;
  currentAgent?: string;
}

interface AppProps {
  defaultAgent?: string;
  /** 消息处理回调（传入消息内容和 UI 操作上下文） */
  onMessage?: (message: string, context: MessageContext) => Promise<void> | void;
  commands?: string[];
  agents?: string[];
  initialSkills?: { id: string; name: string; active?: boolean }[];
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
    <Box width="100%">
      <Text color="gray" dimColor bold>
        {' ['}
        {messages.length} msgs
        {'] | '}
        <Text color={isStreaming ? 'yellow' : 'green'}>
          {isStreaming ? '\u25b6 Gen...' : '\u25cb Ready'}
        </Text>
        {' | '}
        <Text color="magenta">{currentAgent}</Text>
        {' ]'}
      </Text>
    </Box>
  );
};

const AppContent: React.FC<AppProps> = ({
  defaultAgent = 'dev',
  onMessage,
  commands = ['/help', '/exit', '/clear', '/agents', '/skills'],
  agents = ['dev', 'support', 'analyst'],
  initialSkills = [],
}) => {
  const { exit } = useInkApp();
    const {
      addMessage,
      updateMessage,
      setCurrentAgent,
      setAgents,
      setTaskStatus,
      addLog,
      setIsStreaming,
      setSkills,
      startCodeWriter,
      startCodeEditor,
      currentAgent,
    } = useApp();

  useEffect(() => {
    setAgents(agents.map(id => ({
      id,
      name: id,
      status: 'idle' as const,
    })));

    setCurrentAgent(defaultAgent);

    // 预加载默认 Agent 的技能列表
    if (initialSkills.length > 0) {
      setSkills(initialSkills);
    }

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
      // 延迟退出，让用户看到 Goodbye 消息
      setTimeout(() => {
        process.stdout.write('\x1b[?1049l');  // 恢复主屏幕
        exit();
      }, 150);
    }
  });

  const handleSubmit = useCallback(async (input: string) => {
    // @agent 切换命令
    if (input.startsWith('@')) {
      const targetAgent = input.slice(1).trim();
      if (agents.includes(targetAgent)) {
        setCurrentAgent(targetAgent);
        addMessage({
          sender: 'System',
          content: `Switched to agent: ${targetAgent}`,
          type: 'system',
        });
        addLog(`Switched to agent: ${targetAgent}`, 'info');
      } else {
        addMessage({
          sender: 'System',
          content: `Unknown agent: ${targetAgent} (available: ${agents.join(', ')})`,
          type: 'error',
        });
      }
      return;
    }

    // /command 命令
    if (input.startsWith('/')) {
      if (input === '/clear') {
        // 清屏由外部处理，这里只记录日志
        addLog('Clear command received', 'info');
      } else if (input === '/agents') {
        addMessage({
          sender: 'System',
          content: `Available agents: ${agents.join(', ')}`,
          type: 'system',
        });
      } else if (input === '/help') {
        addMessage({
          sender: 'System',
          content: 'Commands: @<agent> | /clear | /agents | /help | /exit',
          type: 'system',
        });
      }
      addToHistory(input);
      return;
    }

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
        setSkills,
        startCodeWriter,
        startCodeEditor,
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
  }, [addMessage, addLog, onMessage, setCurrentAgent, setIsStreaming, startCodeWriter, startCodeEditor, updateMessage, setTaskStatus, currentAgent]);

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