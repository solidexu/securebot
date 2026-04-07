/**
 * 消息状态管理 (Zustand)
 * 
 * 使用 Zustand 替代 Context，优化性能和开发体验
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Message } from '../../types/message.js';

// ============ 类型定义 ============

interface MessageState {
  messages: Message[];
  selectedMessageId: string | null;
  scrollOffset: number;
}

interface MessageActions {
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, content: string) => void;
  clearMessages: () => void;
  selectMessage: (id: string | null) => void;
  setScrollOffset: (offset: number) => void;
}

type MessageStore = MessageState & MessageActions;

// ============ Store 创建 ============

export const useMessageStore = create<MessageStore>()(
  immer((set, get) => ({
    // 初始状态
    messages: [],
    selectedMessageId: null,
    scrollOffset: 0,

    // 操作方法
    addMessage: (message) => {
      const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const newMessage: Message = {
        ...message,
        id,
        timestamp: Date.now(),
      };

      set((state) => {
        state.messages.push(newMessage);
      });

      return id;
    },

    updateMessage: (id, content) => {
      set((state) => {
        const message = state.messages.find((m) => m.id === id);
        if (message) {
          message.content = content;
        }
      });
    },

    clearMessages: () => {
      set((state) => {
        state.messages = [];
        state.selectedMessageId = null;
        state.scrollOffset = 0;
      });
    },

    selectMessage: (id) => {
      set((state) => {
        state.selectedMessageId = id;
      });
    },

    setScrollOffset: (offset) => {
      set((state) => {
        state.scrollOffset = offset;
      });
    },
  }))
);

// ============ 选择器 ============

/**
 * 获取消息列表（优化重渲染）
 */
export const useMessageList = () => useMessageStore((s) => s.messages);

/**
 * 获取消息操作方法（优化重渲染）
 */
export const useMessageActions = () =>
  useMessageStore((s) => ({
    addMessage: s.addMessage,
    updateMessage: s.updateMessage,
    clearMessages: s.clearMessages,
    selectMessage: s.selectMessage,
  }));

/**
 * 获取选中的消息
 */
export const useSelectedMessage = () => {
  const messages = useMessageStore((s) => s.messages);
  const selectedId = useMessageStore((s) => s.selectedMessageId);
  return messages.find((m) => m.id === selectedId);
};