import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useApp } from '../../context/index.js';

interface Props {
  onSubmit?: (input: string) => void;
  commands?: string[];
  agents?: string[];
}

export const InputBox: React.FC<Props> = ({
  onSubmit,
  commands = [],
  agents = [],
}) => {
  const [input, setInput] = useState('');
  const [completions, setCompletions] = useState<string[]>([]);
  const inputRef = useRef(input);
  const { currentAgent, addToHistory, navigateHistory, isStreaming } = useApp();

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
    } else if (key.tab) {
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
      // 接受所有非控制字符（包括中文等多字节字符）
      // 只排除明确的控制键组合
      const isControlKey =
        (key.escape) ||
        (key.ctrl && char === 'c') ||
        (key.ctrl && char === 'd') ||
        (key.ctrl && char === 'z');

      if (!isControlKey) {
        const newInput = input + char;
        setInput(newInput);
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