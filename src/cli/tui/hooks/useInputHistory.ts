/**
 * 输入历史管理 Hook
 */
import { useState, useCallback, useRef } from 'react';
import { MAX_INPUT_HISTORY } from '../constants/index.js';

export function useInputHistory() {
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputBeforeNavRef = useRef('');

  const addToHistory = useCallback((input: string) => {
    if (!input.trim()) return;
    setInputHistory((prev) => [input, ...prev].slice(0, MAX_INPUT_HISTORY));
    setHistoryIndex(-1);
  }, []);

  const navigateUp = useCallback((): string | null => {
    if (inputHistory.length === 0) return null;
    
    const newIndex = Math.min(historyIndex + 1, inputHistory.length - 1);
    
    // 保存当前输入
    if (historyIndex === -1) {
      inputBeforeNavRef.current = inputHistory[0] || '';
    }
    
    setHistoryIndex(newIndex);
    return inputHistory[newIndex] || null;
  }, [inputHistory, historyIndex]);

  const navigateDown = useCallback((): string | null => {
    if (historyIndex === -1) return null;
    
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    
    if (newIndex === -1) {
      return inputBeforeNavRef.current;
    }
    return inputHistory[newIndex] || null;
  }, [inputHistory, historyIndex]);

  const reset = useCallback(() => {
    setHistoryIndex(-1);
  }, []);

  return {
    inputHistory,
    historyIndex,
    addToHistory,
    navigateUp,
    navigateDown,
    reset,
  };
}