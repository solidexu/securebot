/**
 * 输入 ViewModel
 * 
 * 封装输入框的业务逻辑
 */

import { useState, useCallback, useMemo } from 'react';
import { useHistoryState } from '../cli/tui/selectors/index.js';
import { emitEvent, EventType } from '../core/event-bus.js';

// ============ 类型定义 ============

export interface InputViewModel {
  // 状态
  value: string;
  isMultiline: boolean;
  historyIndex: number;
  historyLength: number;
  
  // 操作
  setValue: (value: string) => void;
  submit: () => void;
  toggleMultiline: () => void;
  navigateHistory: (direction: 'up' | 'down') => string | null;
  addToHistory: (input: string) => void;
}

// ============ ViewModel Hook ============

/**
 * 输入框 ViewModel
 */
export function useInputViewModel(
  onSubmit: (content: string) => Promise<void>
): InputViewModel {
  const [value, setValue] = useState('');
  const [isMultiline, setIsMultiline] = useState(false);
  
  const { inputHistory, historyIndex, addToHistory, navigateHistory } = useHistoryState();

  // 提交输入
  const submit = useCallback(() => {
    const trimmedValue = value.trim();
    if (!trimmedValue) return;

    // 添加到历史
    addToHistory(trimmedValue);

    // 清空输入
    setValue('');

    // 发射事件
    emitEvent(EventType.UI_MESSAGE_ADD, {
      id: `input-${Date.now()}`,
      role: 'user',
      content: trimmedValue,
      timestamp: Date.now(),
    });

    // 调用提交回调
    onSubmit(trimmedValue);
  }, [value, addToHistory, onSubmit]);

  // 切换多行模式
  const toggleMultiline = useCallback(() => {
    setIsMultiline(prev => !prev);
  }, []);

  return useMemo(() => ({
    value,
    isMultiline,
    historyIndex,
    historyLength: inputHistory.length,
    setValue,
    submit,
    toggleMultiline,
    navigateHistory,
    addToHistory,
  }), [
    value,
    isMultiline,
    historyIndex,
    inputHistory.length,
    submit,
    toggleMultiline,
    navigateHistory,
    addToHistory,
  ]);
}