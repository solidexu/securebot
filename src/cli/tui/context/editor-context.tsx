/**
 * 编辑器状态 Context
 * 
 * 管理代码编辑器和 Shell 输出面板
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

// ============ 类型定义 ============

interface DisplayLine {
  text: string;
  state: 'written' | 'changed' | 'added' | 'deleted' | 'pending';
  writtenChars?: number;
  totalChars?: number;
}

interface CodeEditorState {
  mode: 'write' | 'edit';
  filePath: string;
  displayLines: DisplayLine[];
  currentLine: number;
  totalLines: number;
  isComplete: boolean;
  additions: number;
  deletions: number;
}

interface ShellOutputState {
  command: string;
  outputs: Array<{ type: 'stdout' | 'stderr'; text: string; timestamp: number }>;
  isRunning: boolean;
  exitCode: number | null;
  cwd?: string;
}

interface EditorContextValue {
  // 状态
  codeEditor: CodeEditorState | null;
  shellOutput: ShellOutputState | null;

  // 代码编辑器方法
  /** 启动代码写入动画（write 模式） */
  startCodeWriter: (filePath: string, content: string, closeDelayMs?: number) => Promise<void>;
  /** 启动代码编辑动画（edit 模式） */
  startCodeEditor: (filePath: string, oldContent?: string, newContent?: string, closeDelayMs?: number) => Promise<void>;
  /** 关闭编辑器 */
  closeCodeWriter: () => void;

  // Shell 输出方法
  /** 启动 Shell 输出面板 */
  startShellOutput: (command: string, cwd?: string) => void;
  /** 添加 Shell 输出 */
  addShellOutput: (type: 'stdout' | 'stderr', text: string) => void;
  /** 完成 Shell 输出 */
  finishShellOutput: (exitCode: number | null) => void;
  /** 关闭 Shell 输出面板 */
  closeShellOutput: () => void;
}

// ============ Context 创建 ============

const EditorContext = createContext<EditorContextValue | null>(null);

// ============ Provider 组件 ============

export const EditorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [codeEditor, setCodeEditor] = useState<CodeEditorState | null>(null);
  const [shellOutput, setShellOutput] = useState<ShellOutputState | null>(null);

  // 编辑器动画相关 ref
  const codeEditorDataRef = useRef<{
    mode: 'write' | 'edit';
    filePath: string;
    displayLines: DisplayLine[];
    currentLine: number;
    totalLines: number;
    additions: number;
    deletions: number;
  } | null>(null);
  const codeEditorTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 将 ref 数据同步到 state */
  const syncToState = useCallback(() => {
    const d = codeEditorDataRef.current;
    if (!d) return;
    setCodeEditor({
      mode: d.mode,
      filePath: d.filePath,
      displayLines: [...d.displayLines],
      currentLine: d.currentLine,
      totalLines: d.totalLines,
      isComplete: d.currentLine >= d.totalLines,
      additions: d.additions,
      deletions: d.deletions,
    });
  }, []);

  /** 启动代码写入动画 */
  const startCodeWriter = useCallback((
    filePath: string,
    content: string,
    closeDelayMs: number = 800
  ): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (codeEditorTimerRef.current) clearInterval(codeEditorTimerRef.current);

      const rawLines = content.split('\n');
      const displayLines = rawLines.map((text) => ({
        text,
        state: 'pending' as const,
      }));

      codeEditorDataRef.current = {
        mode: 'write',
        filePath,
        displayLines,
        currentLine: 0,
        totalLines: rawLines.length,
        additions: rawLines.length,
        deletions: 0,
      };
      syncToState();

      let globalCharIdx = 0;
      const allChars = content.split('');

      codeEditorTimerRef.current = setInterval(() => {
        const d = codeEditorDataRef.current;
        if (!d) {
          clearInterval(codeEditorTimerRef.current!);
          resolve();
          return;
        }

        globalCharIdx += 15; // 每帧写 15 个字符

        if (globalCharIdx >= allChars.length) {
          clearInterval(codeEditorTimerRef.current!);
          d.displayLines = d.displayLines.map((l) => ({
            ...l,
            state: 'written' as const,
          }));
          d.currentLine = d.totalLines;
          syncToState();
          setTimeout(() => setCodeEditor(null), closeDelayMs);
          resolve();
          return;
        }

        let charCount = 0;
        for (let li = 0; li < d.displayLines.length; li++) {
          const lineLen = d.displayLines[li].text.length + 1;
          if (charCount + lineLen > globalCharIdx) {
            const charsInLine = Math.min(
              globalCharIdx - charCount,
              d.displayLines[li].text.length
            );
            d.displayLines[li] = {
              text: d.displayLines[li].text,
              state: 'written' as const,
              writtenChars: charsInLine,
              totalChars: d.displayLines[li].text.length,
            };
            d.currentLine = li;
            break;
          } else {
            d.displayLines[li] = {
              ...d.displayLines[li],
              state: 'written' as const,
              writtenChars: d.displayLines[li].text.length,
              totalChars: d.displayLines[li].text.length,
            };
            d.currentLine = li + 1;
          }
          charCount += lineLen;
        }
        syncToState();
      }, 35);
    });
  }, [syncToState]);

  /** 启动代码编辑动画 */
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

      const displayLines: DisplayLine[] = [];
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
        mode: 'edit',
        filePath,
        displayLines,
        currentLine: 0,
        totalLines: displayLines.length,
        additions,
        deletions,
      };
      syncToState();

      let lineIdx = 0;
      codeEditorTimerRef.current = setInterval(() => {
        lineIdx++;
        const d = codeEditorDataRef.current;
        if (!d) {
          clearInterval(codeEditorTimerRef.current!);
          resolve();
          return;
        }

        if (lineIdx >= d.totalLines) {
          clearInterval(codeEditorTimerRef.current!);
          d.currentLine = lineIdx;
          syncToState();
          setTimeout(() => setCodeEditor(null), closeDelayMs);
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
      }, 100);
    });
  }, [syncToState]);

  const closeCodeWriter = useCallback(() => {
    if (codeEditorTimerRef.current) clearInterval(codeEditorTimerRef.current);
    setCodeEditor(null);
  }, []);

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
    setShellOutput((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        outputs: [
          ...prev.outputs,
          { type, text, timestamp: Date.now() },
        ],
      };
    });
  }, []);

  /** 完成 Shell 输出 */
  const finishShellOutput = useCallback((exitCode: number | null) => {
    setShellOutput((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        isRunning: false,
        exitCode,
      };
    });
    // 3秒后自动关闭
    setTimeout(() => setShellOutput(null), 3000);
  }, []);

  /** 关闭 Shell 输出面板 */
  const closeShellOutput = useCallback(() => {
    setShellOutput(null);
  }, []);

  const value: EditorContextValue = {
    codeEditor,
    shellOutput,
    startCodeWriter,
    startCodeEditor,
    closeCodeWriter,
    startShellOutput,
    addShellOutput,
    finishShellOutput,
    closeShellOutput,
  };

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
};

// ============ Hook 导出 ============

export const useEditor = (): EditorContextValue => {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within an EditorProvider');
  }
  return context;
};

export const useCodeEditor = () => {
  const { codeEditor, startCodeWriter, startCodeEditor, closeCodeWriter } = useEditor();
  return { codeEditor, startCodeWriter, startCodeEditor, closeCodeWriter };
};

export const useShellOutput = () => {
  const { shellOutput, startShellOutput, addShellOutput, finishShellOutput, closeShellOutput } = useEditor();
  return { shellOutput, startShellOutput, addShellOutput, finishShellOutput, closeShellOutput };
};