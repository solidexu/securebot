/**
 * 编辑器状态管理 (Zustand)
 * 
 * 管理代码编辑器和 Shell 输出
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

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

interface EditorState {
  codeEditor: CodeEditorState | null;
  shellOutput: ShellOutputState | null;
}

interface EditorActions {
  // 代码编辑器
  startCodeWriter: (filePath: string, content: string, closeDelayMs?: number) => Promise<void>;
  startCodeEditor: (filePath: string, oldContent?: string, newContent?: string, closeDelayMs?: number) => Promise<void>;
  closeCodeWriter: () => void;

  // Shell 输出
  startShellOutput: (command: string, cwd?: string) => void;
  addShellOutput: (type: 'stdout' | 'stderr', text: string) => void;
  finishShellOutput: (exitCode: number | null) => void;
  closeShellOutput: () => void;
}

type EditorStore = EditorState & EditorActions;

// ============ Store 创建 ============

export const useEditorStore = create<EditorStore>()(
  immer((set, get) => ({
    codeEditor: null,
    shellOutput: null,

    // 代码写入动画
    startCodeWriter: async (filePath, content, closeDelayMs = 800) => {
      const rawLines = content.split('\n');
      const displayLines = rawLines.map((text) => ({
        text,
        state: 'pending' as const,
      }));

      set((state) => {
        state.codeEditor = {
          mode: 'write',
          filePath,
          displayLines,
          currentLine: 0,
          totalLines: rawLines.length,
          isComplete: false,
          additions: rawLines.length,
          deletions: 0,
        };
      });

      // 动画逻辑（简化版本）
      let globalCharIdx = 0;
      const allChars = content.split('');

      return new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          globalCharIdx += 15;

          if (globalCharIdx >= allChars.length) {
            clearInterval(interval);
            set((state) => {
              if (state.codeEditor) {
                state.codeEditor.displayLines = state.codeEditor.displayLines.map((l) => ({
                  ...l,
                  state: 'written' as const,
                }));
                state.codeEditor.currentLine = state.codeEditor.totalLines;
                state.codeEditor.isComplete = true;
              }
            });
            setTimeout(() => {
              set((state) => {
                state.codeEditor = null;
              });
              resolve();
            }, closeDelayMs);
            return;
          }

          // 更新显示
          let charCount = 0;
          set((state) => {
            if (!state.codeEditor) return;
            for (let li = 0; li < state.codeEditor.displayLines.length; li++) {
              const lineLen = state.codeEditor.displayLines[li].text.length + 1;
              if (charCount + lineLen > globalCharIdx) {
                const charsInLine = Math.min(
                  globalCharIdx - charCount,
                  state.codeEditor.displayLines[li].text.length
                );
                state.codeEditor.displayLines[li] = {
                  text: state.codeEditor.displayLines[li].text,
                  state: 'written' as const,
                  writtenChars: charsInLine,
                  totalChars: state.codeEditor.displayLines[li].text.length,
                };
                state.codeEditor.currentLine = li;
                break;
              } else {
                state.codeEditor.displayLines[li] = {
                  ...state.codeEditor.displayLines[li],
                  state: 'written' as const,
                  writtenChars: state.codeEditor.displayLines[li].text.length,
                  totalChars: state.codeEditor.displayLines[li].text.length,
                };
                state.codeEditor.currentLine = li + 1;
              }
              charCount += lineLen;
            }
          });
        }, 35);
      });
    },

    // 代码编辑动画
    startCodeEditor: async (filePath, oldContent = '', newContent = '', closeDelayMs = 800) => {
      const oldLines = oldContent.split('\n');
      const newLines = newContent.split('\n');
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

      set((state) => {
        state.codeEditor = {
          mode: 'edit',
          filePath,
          displayLines,
          currentLine: 0,
          totalLines: displayLines.length,
          isComplete: false,
          additions,
          deletions,
        };
      });

      // 动画
      return new Promise<void>((resolve) => {
        let lineIdx = 0;
        const interval = setInterval(() => {
          lineIdx++;
          set((state) => {
            if (!state.codeEditor) return;
            if (lineIdx >= state.codeEditor.totalLines) {
              clearInterval(interval);
              state.codeEditor.currentLine = lineIdx;
              state.codeEditor.isComplete = true;
              setTimeout(() => {
                set((s) => {
                  s.codeEditor = null;
                });
                resolve();
              }, closeDelayMs);
              return;
            }
            state.codeEditor.currentLine = lineIdx;
          });
        }, 100);
      });
    },

    closeCodeWriter: () => {
      set((state) => {
        state.codeEditor = null;
      });
    },

    // Shell 输出
    startShellOutput: (command, cwd) => {
      set((state) => {
        state.shellOutput = {
          command,
          outputs: [],
          isRunning: true,
          exitCode: null,
          cwd,
        };
      });
    },

    addShellOutput: (type, text) => {
      set((state) => {
        if (state.shellOutput) {
          state.shellOutput.outputs.push({
            type,
            text,
            timestamp: Date.now(),
          });
        }
      });
    },

    finishShellOutput: (exitCode) => {
      set((state) => {
        if (state.shellOutput) {
          state.shellOutput.isRunning = false;
          state.shellOutput.exitCode = exitCode;
        }
      });
      setTimeout(() => {
        set((state) => {
          state.shellOutput = null;
        });
      }, 3000);
    },

    closeShellOutput: () => {
      set((state) => {
        state.shellOutput = null;
      });
    },
  }))
);

// ============ 选择器 ============

export const useCodeEditor = () => {
  const codeEditor = useEditorStore((s) => s.codeEditor);
  const startCodeWriter = useEditorStore((s) => s.startCodeWriter);
  const startCodeEditor = useEditorStore((s) => s.startCodeEditor);
  const closeCodeWriter = useEditorStore((s) => s.closeCodeWriter);

  return { codeEditor, startCodeWriter, startCodeEditor, closeCodeWriter };
};

export const useShellOutput = () => {
  const shellOutput = useEditorStore((s) => s.shellOutput);
  const startShellOutput = useEditorStore((s) => s.startShellOutput);
  const addShellOutput = useEditorStore((s) => s.addShellOutput);
  const finishShellOutput = useEditorStore((s) => s.finishShellOutput);
  const closeShellOutput = useEditorStore((s) => s.closeShellOutput);

  return { shellOutput, startShellOutput, addShellOutput, finishShellOutput, closeShellOutput };
};