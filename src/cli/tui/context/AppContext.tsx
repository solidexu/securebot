/**
 * 应用全局状态 Context
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { Message, AgentInfo, TaskStatus, LogEntry, SkillInfo } from '../types/index.js';
import { AnimationManager } from '../utils/AnimationManager.js';

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
  /** 代码编辑面板（write/edit 统一） */
  codeEditor: {
    mode: 'write' | 'edit';
    filePath: string;
    displayLines: { text: string; state: 'written' | 'changed' | 'added' | 'deleted' | 'pending'; writtenChars?: number; totalChars?: number }[];
    currentLine: number;
    totalLines: number;
    isComplete: boolean;
    additions: number;
    deletions: number;
  } | null;
  /** Shell 输出面板（exec 工具流式输出） */
  shellOutput: {
    command: string;
    outputs: Array<{ type: 'stdout' | 'stderr'; text: string; timestamp: number }>;
    isRunning: boolean;
    exitCode: number | null;
    cwd?: string;
  } | null;
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
  startCodeWriter: (filePath: string, content: string) => Promise<void>;  // 启动代码写入动画（write 模式）
  /** 启动代码编辑动画（edit 模式，显示 diff 风格） */
  startCodeEditor: (filePath: string, oldContent?: string, newContent?: string) => Promise<void>;
  closeCodeWriter: () => void;                       // 关闭编辑窗口
  /** 启动 Shell 输出面板（exec 工具） */
  startShellOutput: (command: string, cwd?: string) => void;
  /** 添加 Shell 输出 */
  addShellOutput: (type: 'stdout' | 'stderr', text: string) => void;
  /** 完成 Shell 输出 */
  finishShellOutput: (exitCode: number | null) => void;
  /** 关闭 Shell 输出面板 */
  closeShellOutput: () => void;
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
  // 代码编辑面板状态（统一 write/edit 两种模式）
  const [codeEditor, setCodeEditor] = useState<{
    mode: 'write' | 'edit';
    filePath: string;
    displayLines: { text: string; state: 'written' | 'added' | 'deleted' | 'changed' | 'pending'; writtenChars?: number; totalChars?: number }[];
    currentLine: number;
    totalLines: number;
    isComplete: boolean;
    additions: number;
    deletions: number;
  } | null>(null);
  // 用 ref 存储可变数据（避免每次创建新对象）
  const codeEditorDataRef = useRef<{
    mode: 'write' | 'edit';
    filePath: string;
    displayLines: { text: string; state: 'written' | 'added' | 'deleted' | 'changed' | 'pending'; writtenChars?: number; totalChars?: number }[];
    currentLine: number;
    totalLines: number;
    additions: number;
    deletions: number;
  } | null>(null);
  // 版本计数器：每次递增强制 React 重渲染（这是关键！ref 变化不触发渲染）
  const [editorVersion, setEditorVersion] = useState(0);
  const codeEditorTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 将 ref 数据同步到 state 并触发渲染 */
  const syncToState = useCallback(() => {
    const d = codeEditorDataRef.current;
    if (!d) return;
    setCodeEditor({
      mode: d.mode,
      filePath: d.filePath,
      displayLines: [...d.displayLines],  // 新数组引用确保 React 检测到变化
      currentLine: d.currentLine,
      totalLines: d.totalLines,
      isComplete: d.currentLine >= d.totalLines,
      additions: d.additions,
      deletions: d.deletions,
    });
    setEditorVersion(v => v + 1);
  }, []);

  /** write 模式：逐字符写入动画（返回 Promise，await 可暂停推理）
   *  完成后自动关闭面板（delayMs 后关闭，让用户看到完成状态）
   */
  const startCodeWriter = useCallback((
    filePath: string, 
    content: string, 
    closeDelayMs: number = 800
  ): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (codeEditorTimerRef.current) clearInterval(codeEditorTimerRef.current);
      const rawLines = content.split('\n');
      const displayLines = rawLines.map(text => ({ text, state: 'pending' as const }));
      codeEditorDataRef.current = {
        mode: 'write', filePath, displayLines,
        currentLine: 0, totalLines: rawLines.length,
        additions: rawLines.length, deletions: 0,
        writtenChars: 0,  // 当前行已写字符数
        totalChars: 0,    // 当前行总字符数
      };
      syncToState();

      let globalCharIdx = 0;
      const allChars = content.split('');

      codeEditorTimerRef.current = setInterval(() => {
        const d = codeEditorDataRef.current;
        if (!d) { clearInterval(codeEditorTimerRef.current!); resolve(); return; }

        // 计算当前应该写到哪个字符位置
        globalCharIdx += 15; // 每帧写 15 个字符 — 600字/秒，100行代码~6秒
        
        if (globalCharIdx >= allChars.length) {
          // 全部写完
          clearInterval(codeEditorTimerRef.current!);
          d.displayLines = d.displayLines.map(l => ({ ...l, state: 'written' as const }));
          d.currentLine = d.totalLines;
          syncToState();
          // 延迟后自动关闭
          setTimeout(() => { setCodeEditor(null); }, closeDelayMs);
          resolve();
          return;
        }

        // 根据全局字符位置计算每行的状态
        let charCount = 0;
        for (let li = 0; li < d.displayLines.length; li++) {
          const lineLen = d.displayLines[li].text.length + 1; // +1 for \n
          if (charCount + lineLen > globalCharIdx) {
            // 当前行（部分写入）
            const charsInLine = Math.min(globalCharIdx - charCount, d.displayLines[li].text.length);
            d.displayLines[li] = { 
              text: d.displayLines[li].text, 
              state: 'written' as const,
              writtenChars: charsInLine,
              totalChars: d.displayLines[li].text.length,
            };
            d.currentLine = li;
            break;
          } else {
            // 已写完的整行
            d.displayLines[li] = { ...d.displayLines[li], state: 'written' as const, writtenChars: d.displayLines[li].text.length, totalChars: d.displayLines[li].text.length };
            d.currentLine = li + 1;
          }
          charCount += lineLen;
        }
        syncToState();
      }, 35); // ~28fps，每帧 3 字符 ≈ 84 字符/秒（舒适阅读速度）
    });
  }, [syncToState]);

  /** edit 模式：diff 风格动画（返回 Promise，完成后自动关闭） */
  const startCodeEditor = useCallback((
    filePath: string, 
    oldContent?: string, 
    newContent?: string,
    closeDelayMs: number = 800
  ): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (codeEditorTimerRef.current) clearInterval(codeEditorTimerRef.current);
      const oldLines = (oldContent || '').split('\n');
      const newLines = (newContent || '').split('\n');
      const additions = Math.max(0, newLines.length - oldLines.length);
      const deletions = Math.max(0, oldLines.length - newLines.length);
      const maxLen = Math.max(oldLines.length, newLines.length);
      const displayLines: { text: string; state: 'written' | 'added' | 'deleted' | 'changed' | 'pending'; writtenChars?: number; totalChars?: number }[] = [];
      for (let i = 0; i < maxLen; i++) {
        const oLine = oldLines[i];
        const nLine = newLines[i];
        if (i >= oldLines.length) {
          displayLines.push({ text: nLine, state: 'added' });
        } else if (i >= newLines.length) {
          displayLines.push({ text: oLine, state: 'deleted' });
        } else if (oLine !== nLine) {
          displayLines.push({ text: oLine, state: 'deleted' });
          displayLines.push({ text: nLine, state: 'added' });
        } else {
          displayLines.push({ text: oLine, state: 'written' });
        }
      }
      codeEditorDataRef.current = {
        mode: 'edit', filePath, displayLines,
        currentLine: 0, totalLines: displayLines.length,
        additions, deletions,
      };
      syncToState();
      
      let lineIdx = 0;
      codeEditorTimerRef.current = setInterval(() => {
        lineIdx++;
        const d = codeEditorDataRef.current;
        if (!d) { clearInterval(codeEditorTimerRef.current!); resolve(); return; }
        if (lineIdx >= d.totalLines) {
          clearInterval(codeEditorTimerRef.current!);
          d.currentLine = lineIdx;
          syncToState();
          // 延迟后自动关闭
          setTimeout(() => { setCodeEditor(null); }, closeDelayMs);
          resolve();
          return;
        }
        if (lineIdx < d.displayLines.length) {
          const line = d.displayLines[lineIdx];
          if (line.state === 'pending') {
            d.displayLines[lineIdx] = { ...line, state: 'written' };
          }
        }
        d.currentLine = lineIdx;
        syncToState();
      }, 100); // edit 行扫描速度
    });
  }, [syncToState]);

  const closeCodeWriter = useCallback(() => {
    if (codeEditorTimerRef.current) clearInterval(codeEditorTimerRef.current);
    setCodeEditor(null);
  }, []);

  // ===== Shell 输出状态管理 =====
  const [shellOutput, setShellOutput] = useState<{
    command: string;
    outputs: Array<{ type: 'stdout' | 'stderr'; text: string; timestamp: number }>;
    isRunning: boolean;
    exitCode: number | null;
    cwd?: string;
  } | null>(null);

  /** 启动 Shell 输出面板 */
  const startShellOutput = useCallback((command: string, cwd?: string) => {
    setShellOutput({
      command,
      outputs: [],
      isRunning: true,
      exitCode: null,
      cwd,
    });
  }, []);

  /** 添加 Shell 输出 */
  const addShellOutput = useCallback((type: 'stdout' | 'stderr', text: string) => {
    setShellOutput(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        outputs: [...prev.outputs, { type, text, timestamp: Date.now() }],
      };
    });
  }, []);

  /** 完成 Shell 输出（延迟后自动关闭面板） */
  const finishShellOutput = useCallback((exitCode: number | null, closeDelayMs: number = 1500) => {
    setShellOutput(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        isRunning: false,
        exitCode,
      };
    });
    // 延迟关闭，让用户看到执行结果（exit code）
    setTimeout(() => { setShellOutput(null); }, closeDelayMs);
  }, []);

  /** 关闭 Shell 输出面板 */
  const closeShellOutput = useCallback(() => {
    setShellOutput(null);
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
    if (codeEditorTimerRef.current) clearInterval(codeEditorTimerRef.current);
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
    setCodeEditor(null);
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
    codeEditor,
    startCodeWriter,
    startCodeEditor,
    closeCodeWriter,
    shellOutput,
    startShellOutput,
    addShellOutput,
    finishShellOutput,
    closeShellOutput,
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