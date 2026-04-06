/**
 * 应用全局状态 Context
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { Message, AgentInfo, TaskStatus, LogEntry, SkillInfo } from '../types/index.js';

interface AppState {
  messages: Message[];
  agents: AgentInfo[];
  currentAgent: string;
  taskStatus: TaskStatus | null;
  logs: LogEntry[];
  skills: SkillInfo[];       // 当前 Agent 的技能列表
  isStreaming: boolean;
  inputHistory: string[];
  historyIndex: number;
  chatScrollOffset: number;   // 聊天滚动偏移（0=最新）
  logScrollOffset: number;    // 日志滚动偏移（0=最新）
  skillScrollOffset: number;  // 技能面板滚动偏移（0=最新）
  agentScrollOffset: number;  // Agent 列表滚动偏移（0=最新）
  focusPanel: 'chat' | 'agent' | 'skill'; // 当前焦点面板
  focusBlink: boolean;         // 焦点闪烁标记（Tab 切换时触发）
  selectedMessageId: string | null;  // 当前选中的消息 ID（用于查看完整内容）
  messageViewerOpen: boolean;       // 消息查看器是否打开
  messageScrollOffset: number;       // 消息查看器内部滚动偏移
  codeWriter: { filePath: string; lines: string[]; currentLine: number; totalLines: boolean } | null; // 代码写入窗口
}

interface AppContextValue extends AppState {
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, content: string) => void;
  setAgents: (agents: AgentInfo[]) => void;
  setCurrentAgent: (id: string) => void;
  updateAgentStatus: (id: string, status: AgentInfo['status'], task?: string) => void;
  setTaskStatus: (status: TaskStatus | null) => void;
  addLog: (message: string, level?: LogEntry['level']) => void;
  setIsStreaming: (streaming: boolean) => void;
  addToHistory: (input: string) => void;
  navigateHistory: (direction: 'up' | 'down') => string | null;
  setChatScroll: (offset: number) => void;
  setLogScroll: (offset: number) => void;
  setSkillScroll: (offset: number) => void;
  setAgentScroll: (offset: number) => void;
  setSkills: (skills: SkillInfo[]) => void;   // 更新技能列表
  setFocusPanel: (panel: 'chat' | 'agent' | 'skill') => void;
  resetState: () => void;                    // 重置所有状态
  selectMessage: (id: string | null) => void;        // 选择消息查看完整内容
  setMessageViewerOpen: (open: boolean) => void;     // 打开/关闭消息查看器
  setMessageScrollOffset: (offset: number) => void;  // 消息查看器内部滚动
  startCodeWriter: (filePath: string, content: string) => void;  // 启动代码写入动画
  closeCodeWriter: () => void;                       // 关闭代码写入窗口
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [currentAgent, setCurrentAgent] = useState('dev');
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [skills, setSkillsState] = useState<SkillInfo[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [chatScrollOffset, setChatScrollOffset] = useState(0);
  const [logScrollOffset, setLogScrollOffset] = useState(0);
  const [skillScrollOffset, setSkillScrollOffsetState] = useState(0);
  const [agentScrollOffset, setAgentScrollOffsetState] = useState(0);
  const [focusPanel, setFocusPanelState] = useState<'chat' | 'agent' | 'skill'>('chat');
  const [focusBlink, setFocusBlinkState] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [messageViewerOpen, setMessageViewerOpen] = useState(false);
  const [messageScrollOffset, setMessageScrollOffset] = useState(0);
  // 代码写入动画窗口状态
  const [codeWriter, setCodeWriter] = useState<{
    filePath: string; lines: string[]; currentLine: number; totalLines: number;
  } | null>(null);
  const codeWriterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCodeWriter = useCallback((filePath: string, content: string) => {
    // 清除之前的定时器
    if (codeWriterTimerRef.current) clearInterval(codeWriterTimerRef.current);
    // 解析内容为行数组（处理 JSON 转义的 \n）
    const lines = content.split('\\\n');
    setCodeWriter({ filePath, lines, currentLine: 0, totalLines: lines.length });
    // 每行写入间隔：快速模式（每帧1行）
    let lineIdx = 0;
    codeWriterTimerRef.current = setInterval(() => {
      lineIdx++;
      if (lineIdx >= lines.length) {
        if (codeWriterTimerRef.current) clearInterval(codeWriterTimerRef.current);
        setTimeout(() => setCodeWriter(null), 2000); // 写完后2秒关闭
      } else {
        setCodeWriter(prev => prev ? { ...prev, currentLine: lineIdx } : null);
      }
    }, 30); // 每行 30ms（足够快但可见动画效果）
  }, []);

  const closeCodeWriter = useCallback(() => {
    if (codeWriterTimerRef.current) clearInterval(codeWriterTimerRef.current);
    setCodeWriter(null);
  }, []);
  const historyIndexRef = useRef(-1);
  const tempInputRef = useRef('');

  const addMessage = useCallback((message: Omit<Message, 'id' | 'timestamp'>) => {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newMessage: Message = {
      ...message,
      id,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, newMessage]);
    return id;
  }, []);

  const updateMessage = useCallback((id: string, content: string) => {
    setMessages(prev => prev.map(msg =>
      msg.id === id ? { ...msg, content } : msg
    ));
  }, []);

  const updateAgentStatus = useCallback((id: string, status: AgentInfo['status'], task?: string) => {
    setAgents(prev => prev.map(agent =>
      agent.id === id ? { ...agent, status, currentTask: task } : agent
    ));
  }, []);

  const addLog = useCallback((message: string, level: LogEntry['level'] = 'info') => {
    const entry: LogEntry = {
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      message,
      level,
    };
    setLogs(prev => [...prev.slice(-50), entry]);
  }, []);

  const addToHistory = useCallback((input: string) => {
    if (input.trim()) {
      setInputHistory(prev => [...prev.slice(-100), input]);
      historyIndexRef.current = -1;
    }
  }, []);

  const navigateHistory = useCallback((direction: 'up' | 'down'): string | null => {
    if (inputHistory.length === 0) return null;

    if (direction === 'up') {
      if (historyIndexRef.current < inputHistory.length - 1) {
        historyIndexRef.current++;
        return inputHistory[inputHistory.length - 1 - historyIndexRef.current] ?? null;
      }
    } else {
      if (historyIndexRef.current > 0) {
        historyIndexRef.current--;
        return inputHistory[inputHistory.length - 1 - historyIndexRef.current] ?? null;
      } else if (historyIndexRef.current === 0) {
        historyIndexRef.current = -1;
        return tempInputRef.current || null;
      }
    }

    return null;
  }, [inputHistory]);

  const setChatScroll = useCallback((offset: number) => {
    setChatScrollOffset(offset);
  }, []);

  const setLogScroll = useCallback((offset: number) => {
    setLogScrollOffset(offset);
  }, []);

  const setSkillScroll = useCallback((offset: number) => {
    setSkillScrollOffsetState(offset);
  }, []);

  const setAgentScroll = useCallback((offset: number) => {
    setAgentScrollOffsetState(offset);
  }, []);

  const setSkills = useCallback((newSkills: SkillInfo[]) => {
    setSkillsState(newSkills);
  }, []);

  const setFocusPanel = useCallback((panel: 'chat' | 'agent' | 'skill') => {
    setFocusPanelState(panel);
    // 触发闪烁效果
    setFocusBlinkState(true);
    setTimeout(() => setFocusBlinkState(false), 300);
  }, []);

  const selectMessage = useCallback((id: string | null) => {
    setSelectedMessageId(id);
    setMessageViewerOpen(id !== null);
    setMessageScrollOffset(0); // 打开时重置内部滚动
  }, []);

  const closeMessageViewer = useCallback(() => {
    setMessageViewerOpen(false);
    setSelectedMessageId(null);
    setMessageScrollOffset(0);
  }, []);

  const setMessageScroll = useCallback((offset: number) => {
    setMessageScrollOffset(offset);
  }, []);

  // 重置所有状态（每次 TUI 启动时调用）
  const resetState = useCallback(() => {
    if (codeWriterTimerRef.current) clearInterval(codeWriterTimerRef.current);
    setMessages([]);
    setAgents([]);
    setCurrentAgent('dev');
    setTaskStatus(null);
    setLogs([]);
    setSkillsState([]);
    setIsStreaming(false);
    setInputHistory([]);
    historyIndexRef.current = -1;
    setChatScrollOffset(0);
    setLogScrollOffset(0);
    setSkillScrollOffsetState(0);
    setAgentScrollOffsetState(0);
    setFocusPanelState('chat');
    setFocusBlinkState(false);
    setSelectedMessageId(null);
    setMessageViewerOpen(false);
    setMessageScrollOffset(0);
    setCodeWriter(null);
  }, []);

  const value: AppContextValue = {
    messages,
    agents,
    currentAgent,
    taskStatus,
    logs,
    skills,
    isStreaming,
    inputHistory,
    historyIndex: historyIndexRef.current,
    chatScrollOffset,
    logScrollOffset,
    skillScrollOffset,
    agentScrollOffset,
    focusPanel,
    focusBlink,
    addMessage,
    updateMessage,
    setAgents,
    setCurrentAgent,
    updateAgentStatus,
    setTaskStatus,
    addLog,
    setIsStreaming,
    addToHistory,
    navigateHistory,
    setChatScroll,
    setLogScroll,
    setSkillScroll,
    setAgentScroll,
    setSkills,
    setFocusPanel,
    resetState,
    selectMessage,
    setMessageViewerOpen,
    setMessageScrollOffset: setMessageScroll,
    selectedMessageId,
    messageViewerOpen,
    codeWriter,
    startCodeWriter,
    closeCodeWriter,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextValue => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};