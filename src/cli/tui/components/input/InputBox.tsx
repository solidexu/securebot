import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useApp } from '../../context/index.js';

interface Props {
  onSubmit?: (input: string) => void;
  commands?: string[];
  agents?: string[];
}

const SCROLL_STEP = 5;

export const InputBox: React.FC<Props> = ({
  onSubmit,
  commands = [],
  agents = [],
}) => {
  const [input, setInput] = useState('');
  const [completions, setCompletions] = useState<string[]>([]);
  const inputRef = useRef(input);
  const {
    currentAgent,
    addToHistory,
    navigateHistory,
    isStreaming,
    messages,
    chatScrollOffset,
    setChatScroll,
  } = useApp();

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  useInput((char, key) => {
    if (isStreaming) return;

    if (key.return) {
      if (input.trim()) {
        onSubmit?.(input.trim());
        addToHistory(input.trim());
        setInput('');
        setCompletions([]);
        // 发送消息后自动回到最新
        if (chatScrollOffset > 0) setChatScroll(0);
      }
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
      setCompletions([]);
    } else if (key.upArrow) {
      const historyItem = navigateHistory('up');
      if (historyItem) setInput(historyItem);
      setCompletions([]);
    } else if (key.downArrow) {
      const historyItem = navigateHistory('down');
      if (historyItem) setInput(historyItem);
      setCompletions([]);
    } else if (key.pageUp) {
      // 向上滚动聊天记录（查看更早的历史）
      const maxScroll = Math.max(0, messages.length - 15);
      if (chatScrollOffset < maxScroll) {
        setChatScroll(Math.min(chatScrollOffset + SCROLL_STEP, maxScroll));
      }
    } else if (key.pageDown) {
      // 向下滚动 / 回到最新
      if (chatScrollOffset > 0) {
        setChatScroll(Math.max(chatScrollOffset - SCROLL_STEP, 0));
      }
    } else if (key.tab) {
      // @agent 切换: 直接补全并立即切换
      if (input.startsWith('@')) {
        const matches = getAgentMatches(input, agents);
        if (matches.length === 1) {
          onSubmit?.(matches[0]!);
          addToHistory(matches[0]!);
          setInput('');
          setCompletions([]);
          return;
        }
        if (matches.length > 1) {
          setCompletions(matches);
          const next = matches[(completions.indexOf(input) + 1) % matches.length];
          if (next) setInput(next);
          return;
        }
      }

      // 命令补全
      if (completions.length > 0) {
        setInput(completions[0]!);
        setCompletions([]);
      } else {
        const matches = getCompletions(input, commands, agents);
        if (matches.length === 1) {
          setInput(matches[0]!);
        } else if (matches.length > 1) {
          setCompletions(matches);
        }
      }
    } else if (char) {
      const isControlKey =
        (key.escape) ||
        (key.ctrl && char === 'c') ||
        (key.ctrl && char === 'd') ||
        (key.ctrl && char === 'z');

      if (!isControlKey) {
        setInput(input + char);
        setCompletions([]);
      }
    }
  }, { isActive: !isStreaming });

  return (
    <Box flexDirection="column">
      {/* 输入行 */}
      <Box paddingLeft={1} paddingRight={1}>
        <Text bold color="green">
          {'['}{currentAgent}{']>'}{' '}
        </Text>
        <Text>{input}</Text>
        <Text color="white" backgroundColor="green">{' '}</Text>
      </Box>

      {/* 补全提示 */}
      {completions.length > 0 && (
        <Box paddingLeft={2}>
          <Text color="cyan" dimColor>
            {completions.slice(0, 5).map((c, i) => (
              c + (i < Math.min(completions.length, 5) - 1 ? ' | ' : '')
            ))}
          </Text>
        </Box>
      )}
    </Box>
  );
};

function getCompletions(input: string, commands: string[], agents: string[]): string[] {
  if (input.startsWith('/')) {
    return commands.filter(c => c.startsWith(input));
  }
  if (input.startsWith('@')) {
    return agents.map(a => `@${a}`).filter(a => a.startsWith(input));
  }
  return [];
}

function getAgentMatches(input: string, agents: string[]): string[] {
  return agents.map(a => `@${a}`).filter(a => a.startsWith(input));
}
