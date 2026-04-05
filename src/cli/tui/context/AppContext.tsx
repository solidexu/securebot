/**
 * 应用全局状态 Context
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { Message, AgentInfo, TaskStatus, LogEntry } from '../types/index.js';

interface AppState {
  messages: Message[];
  agents: AgentInfo[];
  currentAgent: string;
  taskStatus: TaskStatus | null;
  logs: LogEntry[];
  isStreaming: boolean;
  inputHistory: string[];
  historyIndex: number;
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
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [currentAgent, setCurrentAgent] = useState('dev');
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
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

  const value: AppContextValue = {
    messages,
    agents,
    currentAgent,
    taskStatus,
    logs,
    isStreaming,
    inputHistory,
    historyIndex: historyIndexRef.current,
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