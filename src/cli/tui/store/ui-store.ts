/**
 * UI 状态管理 (Zustand)
 * 
 * 管理界面状态，优化性能
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { LogEntry } from '../../types/index.js';

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

interface UIActions {
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

type UIStore = UIState & UIActions;

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

// ============ Store 创建 ============

export const useUIStore = create<UIStore>()(
  immer((set, get) => ({
    ...defaultState,

    // 滚动控制
    setChatScroll: (offset) => {
      set((state) => {
        state.chatScrollOffset = offset;
      });
    },

    setLogScroll: (offset) => {
      set((state) => {
        state.logScrollOffset = offset;
      });
    },

    setSkillScroll: (offset) => {
      set((state) => {
        state.skillScrollOffset = offset;
      });
    },

    setAgentScroll: (offset) => {
      set((state) => {
        state.agentScrollOffset = offset;
      });
    },

    // 焦点控制
    setFocusPanel: (panel) => {
      set((state) => {
        state.focusPanel = panel;
        state.focusBlink = true;
      });
      // 自动重置闪烁
      setTimeout(() => {
        set((state) => {
          state.focusBlink = false;
        });
      }, 200);
    },

    triggerFocusBlink: () => {
      set((state) => {
        state.focusBlink = true;
      });
      setTimeout(() => {
        set((state) => {
          state.focusBlink = false;
        });
      }, 200);
    },

    // 流式状态
    setIsStreaming: (streaming) => {
      set((state) => {
        state.isStreaming = streaming;
      });
    },

    // 输入历史
    addToHistory: (input) => {
      if (!input.trim()) return;
      set((state) => {
        state.inputHistory = [input, ...state.inputHistory].slice(0, 100);
        state.historyIndex = -1;
      });
    },

    navigateHistory: (direction) => {
      const { inputHistory, historyIndex } = get();
      if (inputHistory.length === 0) return null;

      let newIndex = historyIndex;
      if (direction === 'up') {
        newIndex = Math.min(historyIndex + 1, inputHistory.length - 1);
      } else {
        newIndex = Math.max(historyIndex - 1, -1);
      }

      set((state) => {
        state.historyIndex = newIndex;
      });

      return newIndex === -1 ? null : inputHistory[newIndex];
    },

    // 日志
    addLog: (message, level = 'info') => {
      const entry: LogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        message,
        level,
        timestamp: Date.now(),
      };

      set((state) => {
        state.logs = [...state.logs, entry].slice(-100);
      });
    },

    // 重置
    resetUIState: () => {
      set(defaultState);
    },
  }))
);

// ============ 选择器 ============

export const useFocus = () => {
  const focusPanel = useUIStore((s) => s.focusPanel);
  const focusBlink = useUIStore((s) => s.focusBlink);
  const setFocusPanel = useUIStore((s) => s.setFocusPanel);
  const triggerFocusBlink = useUIStore((s) => s.triggerFocusBlink);

  return { focusPanel, focusBlink, setFocusPanel, triggerFocusBlink };
};

export const useScroll = () => {
  const chatScrollOffset = useUIStore((s) => s.chatScrollOffset);
  const logScrollOffset = useUIStore((s) => s.logScrollOffset);
  const skillScrollOffset = useUIStore((s) => s.skillScrollOffset);
  const agentScrollOffset = useUIStore((s) => s.agentScrollOffset);
  const setChatScroll = useUIStore((s) => s.setChatScroll);
  const setLogScroll = useUIStore((s) => s.setLogScroll);
  const setSkillScroll = useUIStore((s) => s.setSkillScroll);
  const setAgentScroll = useUIStore((s) => s.setAgentScroll);

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
  const inputHistory = useUIStore((s) => s.inputHistory);
  const historyIndex = useUIStore((s) => s.historyIndex);
  const addToHistory = useUIStore((s) => s.addToHistory);
  const navigateHistory = useUIStore((s) => s.navigateHistory);

  return { inputHistory, historyIndex, addToHistory, navigateHistory };
};

export const useLogs = () => {
  const logs = useUIStore((s) => s.logs);
  const addLog = useUIStore((s) => s.addLog);
  return { logs, addLog };
};