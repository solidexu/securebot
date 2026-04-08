/**
 * 细粒度状态选择器
 * 
 * 从 Context 中选择特定状态，避免不必要的重渲染
 */

import { useMemo, useCallback } from 'react';
import { useMessages, useEditor, useUI, useCollaboration } from './context/index.js';

// ============ 消息选择器 ============

/**
 * 仅获取消息列表
 */
export function useMessageList() {
  const { messages } = useMessages();
  return messages;
}

/**
 * 仅获取消息数量
 */
export function useMessageCount() {
  const { messages } = useMessages();
  return messages.length;
}

/**
 * 仅获取最后一条消息
 */
export function useLastMessage() {
  const { messages } = useMessages();
  return messages[messages.length - 1];
}

/**
 * 仅获取消息操作方法
 */
export function useMessageActions() {
  const { addMessage, updateMessage, clearMessages } = useMessages();
  return useMemo(() => ({ addMessage, updateMessage, clearMessages }), 
    [addMessage, updateMessage, clearMessages]);
}

// ============ 编辑器选择器 ============

/**
 * 仅获取代码编辑器状态
 */
export function useCodeEditorState() {
  const { codeEditor } = useEditor();
  return codeEditor;
}

/**
 * 仅获取 Shell 输出状态
 */
export function useShellState() {
  const { shellOutput } = useEditor();
  return shellOutput;
}

/**
 * 仅获取编辑器操作方法
 */
export function useEditorActions() {
  const { 
    startCodeWriter, 
    startCodeEditor, 
    closeCodeWriter,
    startShellOutput,
    addShellOutput,
    finishShellOutput,
    closeShellOutput,
  } = useEditor();
  
  return useMemo(() => ({
    startCodeWriter,
    startCodeEditor,
    closeCodeWriter,
    startShellOutput,
    addShellOutput,
    finishShellOutput,
    closeShellOutput,
  }), [
    startCodeWriter,
    startCodeEditor,
    closeCodeWriter,
    startShellOutput,
    addShellOutput,
    finishShellOutput,
    closeShellOutput,
  ]);
}

// ============ UI 选择器 ============

/**
 * 仅获取流式状态
 */
export function useStreaming() {
  const { isStreaming, setIsStreaming } = useUI();
  return { isStreaming, setIsStreaming };
}

/**
 * 仅获取焦点状态
 */
export function useFocusState() {
  const { focusPanel, focusBlink, setFocusPanel } = useUI();
  return { focusPanel, focusBlink, setFocusPanel };
}

/**
 * 仅获取输入历史
 */
export function useHistoryState() {
  const { inputHistory, historyIndex, addToHistory, navigateHistory } = useUI();
  return { inputHistory, historyIndex, addToHistory, navigateHistory };
}

/**
 * 仅获取日志
 */
export function useLogState() {
  const { logs, addLog } = useUI();
  return { logs, addLog };
}

// ============ 协作选择器 ============

/**
 * 仅获取 Agent 列表
 */
export function useAgentList() {
  const { agents } = useCollaboration();
  return agents;
}

/**
 * 仅获取当前 Agent
 */
export function useCurrentAgent() {
  const { currentAgent, setCurrentAgent } = useCollaboration();
  return { currentAgent, setCurrentAgent };
}

/**
 * 仅获取任务状态
 */
export function useTaskState() {
  const { taskStatus, setTaskStatus } = useCollaboration();
  return { taskStatus, setTaskStatus };
}

/**
 * 仅获取技能列表
 */
export function useSkillList() {
  const { skills } = useCollaboration();
  return skills;
}

// ============ 组合选择器 ============

/**
 * 聊天面板所需状态（优化版）
 */
export function useChatPanelState() {
  const messages = useMessageList();
  const { isStreaming } = useStreaming();
  const { currentAgent } = useCurrentAgent();
  
  return useMemo(() => ({
    messages,
    isStreaming,
    currentAgent,
  }), [messages, isStreaming, currentAgent]);
}

/**
 * 输入框所需状态（优化版）
 */
export function useInputBoxState() {
  const { addMessage } = useMessageActions();
  const { isStreaming, setIsStreaming } = useStreaming();
  const { currentAgent } = useCurrentAgent();
  const { inputHistory, addToHistory, navigateHistory } = useHistoryState();
  
  return useMemo(() => ({
    addMessage,
    isStreaming,
    setIsStreaming,
    currentAgent,
    inputHistory,
    addToHistory,
    navigateHistory,
  }), [
    addMessage,
    isStreaming,
    setIsStreaming,
    currentAgent,
    inputHistory,
    addToHistory,
    navigateHistory,
  ]);
}

/**
 * Agent 面板所需状态（优化版）
 */
export function useAgentPanelState() {
  const agents = useAgentList();
  const { currentAgent, setCurrentAgent } = useCurrentAgent();
  const { taskStatus } = useTaskState();
  
  return useMemo(() => ({
    agents,
    currentAgent,
    setCurrentAgent,
    taskStatus,
  }), [agents, currentAgent, setCurrentAgent, taskStatus]);
}