/**
 * Context 统一导出
 * 
 * 拆分后的 Context 模块：
 * - MessagesProvider: 消息状态
 * - EditorProvider: 编辑器状态
 * - UIProvider: UI 状态
 * - CollaborationProvider: 协作状态
 */

import React from 'react';
import { MessagesProvider, useMessages, useMessageList, useMessageActions } from './messages-context.js';
import { EditorProvider, useEditor, useCodeEditor, useShellOutput } from './editor-context.js';
import { UIProvider, useUI, useFocus, useScroll, useHistory, useLogs } from './ui-context.js';
import {
  CollaborationProvider,
  useCollaboration,
  useAgents,
  useTaskStatus,
  useSkills,
} from './collaboration-context.js';

// ============ 组合 Provider ============

/**
 * 应用全局 Provider 组合
 * 
 * 按顺序包装所有 Context Provider
 */
export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MessagesProvider>
    <EditorProvider>
      <UIProvider>
        <CollaborationProvider>{children}</CollaborationProvider>
      </UIProvider>
    </EditorProvider>
  </MessagesProvider>
);

// ============ Hook 导出 ============

// 消息相关
export { useMessages, useMessageList, useMessageActions };

// 编辑器相关
export { useEditor, useCodeEditor, useShellOutput };

// UI 相关
export { useUI, useFocus, useScroll, useHistory, useLogs };

// 协作相关
export { useCollaboration, useAgents, useTaskStatus, useSkills };

// ============ 向后兼容 ============

/**
 * useApp - 向后兼容的统一 Hook
 * 
 * 组合所有 Context 的值，提供与旧 AppContext 兼容的接口
 * @deprecated 建议使用细粒度的 useXxx hooks
 */
export const useApp = () => {
  const messagesCtx = useMessages();
  const editorCtx = useEditor();
  const uiCtx = useUI();
  const collabCtx = useCollaboration();

  return {
    // 消息
    messages: messagesCtx.messages,
    addMessage: messagesCtx.addMessage,
    updateMessage: messagesCtx.updateMessage,
    selectedMessageId: messagesCtx.selectedMessageId,
    messageViewerOpen: messagesCtx.messageViewerOpen,
    messageScrollOffset: messagesCtx.messageScrollOffset,
    selectMessage: messagesCtx.selectMessage,
    setMessageViewerOpen: messagesCtx.setMessageViewerOpen,
    closeMessageViewer: messagesCtx.closeMessageViewer,
    setMessageScrollOffset: messagesCtx.setMessageScrollOffset,
    toggleCollapse: messagesCtx.toggleCollapse,
    collapseAll: messagesCtx.collapseAll,
    expandAll: messagesCtx.expandAll,

    // 编辑器
    codeEditor: editorCtx.codeEditor,
    shellOutput: editorCtx.shellOutput,
    startCodeWriter: editorCtx.startCodeWriter,
    startCodeEditor: editorCtx.startCodeEditor,
    closeCodeWriter: editorCtx.closeCodeWriter,
    startShellOutput: editorCtx.startShellOutput,
    addShellOutput: editorCtx.addShellOutput,
    finishShellOutput: editorCtx.finishShellOutput,
    closeShellOutput: editorCtx.closeShellOutput,

    // UI
    chatScrollOffset: uiCtx.chatScrollOffset,
    logScrollOffset: uiCtx.logScrollOffset,
    skillScrollOffset: uiCtx.skillScrollOffset,
    agentScrollOffset: uiCtx.agentScrollOffset,
    setChatScroll: uiCtx.setChatScroll,
    setLogScroll: uiCtx.setLogScroll,
    setSkillScroll: uiCtx.setSkillScroll,
    setAgentScroll: uiCtx.setAgentScroll,
    focusPanel: uiCtx.focusPanel,
    focusBlink: uiCtx.focusBlink,
    setFocusPanel: uiCtx.setFocusPanel,
    isStreaming: uiCtx.isStreaming,
    setIsStreaming: uiCtx.setIsStreaming,
    inputHistory: uiCtx.inputHistory,
    historyIndex: uiCtx.historyIndex,
    addToHistory: uiCtx.addToHistory,
    navigateHistory: uiCtx.navigateHistory,
    logs: uiCtx.logs,
    addLog: uiCtx.addLog,

    // 协作
    agents: collabCtx.agents,
    currentAgent: collabCtx.currentAgent,
    taskStatus: collabCtx.taskStatus,
    skills: collabCtx.skills,
    setAgents: collabCtx.setAgents,
    setCurrentAgent: collabCtx.setCurrentAgent,
    updateAgentStatus: collabCtx.updateAgentStatus,
    setTaskStatus: collabCtx.setTaskStatus,
    setSkills: collabCtx.setSkills,
  };
};

/**
 * 重置所有状态
 */
export const useResetState = () => {
  const { clearMessages } = useMessages();
  const { closeCodeWriter, closeShellOutput } = useEditor();
  const { resetUIState } = useUI();
  const { resetCollaborationState } = useCollaboration();

  return () => {
    clearMessages();
    closeCodeWriter();
    closeShellOutput();
    resetUIState();
    resetCollaborationState();
  };
};