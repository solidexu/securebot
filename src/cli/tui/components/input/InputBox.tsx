import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useApp } from '../../context/index.js';
import { theme } from '../../styles/theme.js';

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
    } else if (!key.ctrl && !key.meta) {
      const newInput = input + char;
      setInput(newInput);
      setCompletions([]);
    }
  }, { isActive: !isStreaming });

  return (
    <Box flexDirection="column">
      <Box 
        borderStyle="single" 
        borderColor="green"
        paddingX={1}
      >
        <Text bold color="cyan">
          [{currentAgent}] &gt;
        </Text>
        <Text> {input}</Text>
        <Text backgroundColor="white" color="black">▌</Text>
      </Box>
      
      {completions.length > 0 && (
        <Box paddingX={1}>
          <Text color="gray">提示: </Text>
          {completions.slice(0, 5).map((c, i) => (
            <Text key={i} color="cyan">{c} </Text>
          ))}
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