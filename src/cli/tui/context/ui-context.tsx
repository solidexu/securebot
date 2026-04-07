/**
 * UI 状态 Context
 * 
 * 管理界面状态（滚动、焦点、历史、流式状态等）
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { LogEntry } from '../types/index.js';

// ============ 类型定义 ============

type FocusPanel = 'chat' | 'agent' | 'skill';

interface UIState {
  // 滚动偏移
  chatScrollOffset: number;
  logScrollOffset: number;
  skillScrollOffset: number;
  agentScrollOffset: number;

  // 焦点
  focusPanel: FocusPanel;
  focusBlink: boolean;

  // 流式状态
  isStreaming: boolean;

  // 输入历史
  inputHistory: string[];
  historyIndex: number;

  // 日志
  logs: LogEntry[];
}

interface UIContextValue extends UIState {
  // 滚动控制
  setChatScroll: (offset: number) => void;
  setLogScroll: (offset: number) => void;
  setSkillScroll: (offset: number) => void;
  setAgentScroll: (offset: number) => void;

  // 焦点控制
  setFocusPanel: (panel: FocusPanel) => void;
  triggerFocusBlink: () => void;

  // 流式状态
  setIsStreaming: (streaming: boolean) => void;

  // 输入历史
  addToHistory: (input: string) => void;
  navigateHistory: (direction: 'up' | 'down') => string | null;

  // 日志
  addLog: (message: string, level?: LogEntry['level']) => void;

  // 重置
  resetUIState: () => void;
}

// ============ 默认状态 ============

const defaultState: UIState = {
  chatScrollOffset: 0,
  logScrollOffset: 0,
  skillScrollOffset: 0,
  agentScrollOffset: 0,
  focusPanel: 'chat',
  focusBlink: false,
  isStreaming: false,
  inputHistory: [],
  historyIndex: -1,
  logs: [],
};

// ============ Context 创建 ============

const UIContext = createContext<UIContextValue | null>(null);

// ============ Provider 组件 ============

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<UIState>(defaultState);
  
  // 使用 useRef 存储 timer 以便清理
  const focusBlinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 滚动控制
  const setChatScroll = useCallback((offset: number) => {
    setState((prev) => ({ ...prev, chatScrollOffset: offset }));
  }, []);

  const setLogScroll = useCallback((offset: number) => {
    setState((prev) => ({ ...prev, logScrollOffset: offset }));
  }, []);

  const setSkillScroll = useCallback((offset: number) => {
    setState((prev) => ({ ...prev, skillScrollOffset: offset }));
  }, []);

  const setAgentScroll = useCallback((offset: number) => {
    setState((prev) => ({ ...prev, agentScrollOffset: offset }));
  }, []);

  // 焦点控制
  const setFocusPanel = useCallback((panel: FocusPanel) => {
    // 清理之前的 timer
    if (focusBlinkTimerRef.current) {
      clearTimeout(focusBlinkTimerRef.current);
    }
    
    setState((prev) => ({
      ...prev,
      focusPanel: panel,
      focusBlink: true,
    }));
    
    // 闪烁效果在 200ms 后自动消失
    focusBlinkTimerRef.current = setTimeout(() => {
      setState((prev) => ({ ...prev, focusBlink: false }));
    }, 200);
  }, []);

  const triggerFocusBlink = useCallback(() => {
    // 清理之前的 timer
    if (focusBlinkTimerRef.current) {
      clearTimeout(focusBlinkTimerRef.current);
    }
    
    setState((prev) => ({ ...prev, focusBlink: true }));
    focusBlinkTimerRef.current = setTimeout(() => {
      setState((prev) => ({ ...prev, focusBlink: false }));
    }, 200);
  }, []);

  // 流式状态
  const setIsStreaming = useCallback((streaming: boolean) => {
    setState((prev) => ({ ...prev, isStreaming: streaming }));
  }, []);

  // 输入历史
  const addToHistory = useCallback((input: string) => {
    if (!input.trim()) return;
    setState((prev) => ({
      ...prev,
      inputHistory: [input, ...prev.inputHistory].slice(0, 100), // 保留最近 100 条
      historyIndex: -1,
    }));
  }, []);

  const navigateHistory = useCallback((direction: 'up' | 'down'): string | null => {
    const { inputHistory, historyIndex } = state;
    if (inputHistory.length === 0) return null;

    let newIndex = historyIndex;
    if (direction === 'up') {
      newIndex = Math.min(historyIndex + 1, inputHistory.length - 1);
    } else {
      newIndex = Math.max(historyIndex - 1, -1);
    }

    setState((prev) => ({ ...prev, historyIndex: newIndex }));

    if (newIndex === -1) return null;
    return inputHistory[newIndex];
  }, [state]);

  // 日志
  const addLog = useCallback((message: string, level: LogEntry['level'] = 'info') => {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      message,
      level,
      timestamp: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      logs: [...prev.logs, entry].slice(-100), // 保留最近 100 条
    }));
  }, []);

  // 重置
  const resetUIState = useCallback(() => {
    setState(defaultState);
  }, []);

  // 清理 timer
  useEffect(() => {
    return () => {
      if (focusBlinkTimerRef.current) {
        clearTimeout(focusBlinkTimerRef.current);
      }
    };
  }, []);

  const value: UIContextValue = {
    ...state,
    setChatScroll,
    setLogScroll,
    setSkillScroll,
    setAgentScroll,
    setFocusPanel,
    triggerFocusBlink,
    setIsStreaming,
    addToHistory,
    navigateHistory,
    addLog,
    resetUIState,
  };

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
};

// ============ Hook 导出 ============

export const useUI = (): UIContextValue => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};

export const useFocus = () => {
  const { focusPanel, focusBlink, setFocusPanel, triggerFocusBlink } = useUI();
  return { focusPanel, focusBlink, setFocusPanel, triggerFocusBlink };
};

export const useScroll = () => {
  const {
    chatScrollOffset,
    logScrollOffset,
    skillScrollOffset,
    agentScrollOffset,
    setChatScroll,
    setLogScroll,
    setSkillScroll,
    setAgentScroll,
  } = useUI();
  return {
    chatScrollOffset,
    logScrollOffset,
    skillScrollOffset,
    agentScrollOffset,
    setChatScroll,
    setLogScroll,
    setSkillScroll,
    setAgentScroll,
  };
};

export const useHistory = () => {
  const { inputHistory, historyIndex, addToHistory, navigateHistory } = useUI();
  return { inputHistory, historyIndex, addToHistory, navigateHistory };
};

export const useLogs = () => {
  const { logs, addLog } = useUI();
  return { logs, addLog };
};