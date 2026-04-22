/**
 * 消息状态 Context
 * 
 * 管理聊天消息的存储和更新
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { Message } from '../types/message.js';

// ============ 类型定义 ============

interface MessagesState {
  messages: Message[];
  selectedMessageId: string | null;
  messageViewerOpen: boolean;
  messageScrollOffset: number;
}

interface MessagesContextValue extends MessagesState {
  /** 添加新消息，返回消息 ID */
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => string;
  /** 更新消息内容 */
  updateMessage: (id: string, content: string) => void;
  /** 清空所有消息 */
  clearMessages: () => void;
  /** 选择消息查看 */
  selectMessage: (id: string | null) => void;
  /** 设置消息查看器状态 */
  setMessageViewerOpen: (open: boolean) => void;
  /** 关闭消息查看器 */
  closeMessageViewer: () => void;
  /** 设置消息滚动偏移 */
  setMessageScrollOffset: (offset: number) => void;
  /** 切换消息折叠状态 */
  toggleCollapse: (id: string) => void;
  /** 折叠所有消息 */
  collapseAll: () => void;
  /** 展开所有消息 */
  expandAll: () => void;
}

// ============ Context 创建 ============

const MessagesContext = createContext<MessagesContextValue | null>(null);

// ============ Provider 组件 ============

export const MessagesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [messageViewerOpen, setMessageViewerOpen] = useState(false);
  const [messageScrollOffset, setMessageScrollOffset] = useState(0);

  const addMessage = useCallback((message: Omit<Message, 'id' | 'timestamp'>): string => {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newMessage: Message = {
      ...message,
      id,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, newMessage]);
    return id;
  }, []);

  const updateMessage = useCallback((id: string, content: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content } : m))
    );
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSelectedMessageId(null);
    setMessageViewerOpen(false);
  }, []);

  const selectMessage = useCallback((id: string | null) => {
    setSelectedMessageId(id);
    if (id) {
      setMessageViewerOpen(true);
    }
  }, []);

  const closeMessageViewer = useCallback(() => {
    setMessageViewerOpen(false);
    setSelectedMessageId(null);
    setMessageScrollOffset(0);
  }, []);

  const toggleCollapse = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        // 正确切换：undefined/true 表示折叠，false 表示展开
        const isCurrentlyCollapsed = m.collapsed !== false;
        return { ...m, collapsed: isCurrentlyCollapsed ? false : true };
      })
    );
  }, []);

  const collapseAll = useCallback(() => {
    setMessages((prev) =>
      prev.map((m) => ({ ...m, collapsed: true }))
    );
  }, []);

  const expandAll = useCallback(() => {
    setMessages((prev) =>
      prev.map((m) => ({ ...m, collapsed: false }))
    );
  }, []);

  const value: MessagesContextValue = {
    messages,
    selectedMessageId,
    messageViewerOpen,
    messageScrollOffset,
    addMessage,
    updateMessage,
    clearMessages,
    selectMessage,
    setMessageViewerOpen,
    closeMessageViewer,
    setMessageScrollOffset,
    toggleCollapse,
    collapseAll,
    expandAll,
  };

  return (
    <MessagesContext.Provider value={value}>
      {children}
    </MessagesContext.Provider>
  );
};

// ============ Hook 导出 ============

/**
 * 使用消息状态
 */
export const useMessages = (): MessagesContextValue => {
  const context = useContext(MessagesContext);
  if (!context) {
    throw new Error('useMessages must be used within a MessagesProvider');
  }
  return context;
};

/**
 * 只获取消息列表（优化重渲染）
 */
export const useMessageList = () => {
  const { messages } = useMessages();
  return messages;
};

/**
 * 只获取消息操作方法（优化重渲染）
 */
export const useMessageActions = () => {
  const { addMessage, updateMessage, clearMessages, selectMessage, toggleCollapse, collapseAll, expandAll } = useMessages();
  return { addMessage, updateMessage, clearMessages, selectMessage, toggleCollapse, collapseAll, expandAll };
};