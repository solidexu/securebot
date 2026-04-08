/**
 * 聊天 ViewModel
 * 
 * 封装聊天面板的业务逻辑
 */

import { useCallback, useMemo } from 'react';
import { 
  useMessageList, 
  useMessageActions, 
  useStreaming,
  useCurrentAgent,
  useAgentList,
} from '../cli/tui/selectors/index.js';
import { emitEvent, EventType } from '../core/event-bus.js';
import { getSessionServiceInstance } from '../services/index.js';

// ============ 类型定义 ============

export interface ChatViewModel {
  // 状态
  messages: ReturnType<typeof useMessageList>;
  isStreaming: boolean;
  currentAgent: string;
  agents: ReturnType<typeof useAgentList>;
  
  // 操作
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  switchAgent: (agentId: string) => void;
}

// ============ ViewModel Hook ============

/**
 * 聊天面板 ViewModel
 * 
 * 封装所有聊天相关的业务逻辑
 */
export function useChatViewModel(): ChatViewModel {
  // 从选择器获取状态
  const messages = useMessageList();
  const { addMessage, clearMessages } = useMessageActions();
  const { isStreaming, setIsStreaming } = useStreaming();
  const { currentAgent, setCurrentAgent } = useCurrentAgent();
  const agents = useAgentList();

  // 发送消息
  const sendMessage = useCallback(async (content: string) => {
    if (isStreaming || !content.trim()) return;

    // 添加用户消息
    addMessage({
      sender: 'User',
      content,
      type: 'user',
    });

    // 发射流式开始事件
    emitEvent(EventType.UI_STREAM_START, {});
    setIsStreaming(true);

    try {
      // 使用会话服务发送消息
      const sessionService = getSessionServiceInstance();
      
      // 创建或获取会话
      const session = await sessionService.createSession({
        agentId: currentAgent,
      });

      // 发送消息到 Agent
      await sessionService.sendMessage(session.sessionId, content);

      // Agent 响应会通过事件总线返回
    } catch (error) {
      // 发射错误事件
      emitEvent(EventType.SYSTEM_ERROR, {
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });

      // 添加错误消息
      addMessage({
        sender: 'System',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });
    } finally {
      setIsStreaming(false);
      emitEvent(EventType.UI_STREAM_END, {});
    }
  }, [isStreaming, currentAgent, addMessage, setIsStreaming]);

  // 切换 Agent
  const switchAgent = useCallback((agentId: string) => {
    setCurrentAgent(agentId);
    
    // 发射焦点变化事件
    emitEvent(EventType.UI_FOCUS_CHANGE, { panel: 'agent' });
  }, [setCurrentAgent]);

  return useMemo(() => ({
    messages,
    isStreaming,
    currentAgent,
    agents,
    sendMessage,
    clearMessages,
    switchAgent,
  }), [messages, isStreaming, currentAgent, agents, sendMessage, clearMessages, switchAgent]);
}