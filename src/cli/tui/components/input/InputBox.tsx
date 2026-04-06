import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useApp } from '../../context/index.js';

interface Props {
  onSubmit?: (input: string) => void;
  commands?: string[];
  agents?: string[];
}

const SCROLL_STEP = 5;
const SCROLL_FINE_STEP = 1;  // 上下箭头微调
const CHAT_VISIBLE_COUNT = 6;  // 与 MessageList.MAX_VISIBLE_MSGS 保持一致

export const InputBox: React.FC<Props> = ({
  onSubmit,
  commands = [],
  agents: availableAgents = [],
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
    skills,
    agents,
    chatScrollOffset,
    skillScrollOffset,
    agentScrollOffset,
    setChatScroll,
    setSkillScroll,
    setAgentScroll,
    focusPanel,
    setFocusPanel,
  } = useApp();

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  // Tab 循环顺序: chat → agent → skill → chat
  const cycleFocusPanel = () => {
    const order: Array<'chat' | 'agent' | 'skill'> = ['chat', 'agent', 'skill'];
    const idx = order.indexOf(focusPanel);
    setFocusPanel(order[(idx + 1) % order.length]);
  };

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
      // 输入为空时，上箭头用于向上微调滚动（向新消息方向）
      if (input.length === 0) {
        if (focusPanel === 'chat') {
          const maxScroll = Math.max(0, messages.length - CHAT_VISIBLE_COUNT);
          if (chatScrollOffset > 0) {
            setChatScroll(Math.max(chatScrollOffset - SCROLL_FINE_STEP, 0));
          }
        } else if (focusPanel === 'skill') {
          const maxScroll = Math.max(0, skills.length - 6);
          if (skillScrollOffset > 0) {
            setSkillScroll(Math.max(skillScrollOffset - SCROLL_FINE_STEP, 0));
          }
        } else if (focusPanel === 'agent') {
          const maxScroll = Math.max(0, agents.length - 4);
          if (agentScrollOffset > 0) {
            setAgentScroll(Math.max(agentScrollOffset - SCROLL_FINE_STEP, 0));
          }
        }
      } else {
        // 有输入内容时，上箭头用于历史导航
        const historyItem = navigateHistory('up');
        if (historyItem) setInput(historyItem);
        setCompletions([]);
      }
    } else if (key.downArrow) {
      // 输入为空时，下箭头用于向下微调滚动（向旧消息方向）
      if (input.length === 0) {
        if (focusPanel === 'chat') {
          const maxScroll = Math.max(0, messages.length - CHAT_VISIBLE_COUNT);
          if (chatScrollOffset < maxScroll) {
            setChatScroll(Math.min(chatScrollOffset + SCROLL_FINE_STEP, maxScroll));
          }
        } else if (focusPanel === 'skill') {
          const maxScroll = Math.max(0, skills.length - 6);
          if (skillScrollOffset < maxScroll) {
            setSkillScroll(Math.min(skillScrollOffset + SCROLL_FINE_STEP, maxScroll));
          }
        } else if (focusPanel === 'agent') {
          const maxScroll = Math.max(0, agents.length - 4);
          if (agentScrollOffset < maxScroll) {
            setAgentScroll(Math.min(agentScrollOffset + SCROLL_FINE_STEP, maxScroll));
          }
        }
      } else {
        // 有输入内容时，下箭头用于历史导航
        const historyItem = navigateHistory('down');
        if (historyItem) setInput(historyItem);
        setCompletions([]);
      }
    } else if (key.pageUp) {
      // 根据当前焦点面板向上翻页（向新消息方向）
      if (focusPanel === 'chat') {
        if (chatScrollOffset > 0) {
          setChatScroll(Math.max(chatScrollOffset - SCROLL_STEP, 0));
        }
      } else if (focusPanel === 'skill') {
        if (skillScrollOffset > 0) {
          setSkillScroll(Math.max(skillScrollOffset - SCROLL_STEP, 0));
        }
      } else if (focusPanel === 'agent') {
        if (agentScrollOffset > 0) {
          setAgentScroll(Math.max(agentScrollOffset - SCROLL_STEP, 0));
        }
      }
    } else if (key.pageDown) {
      // 根据当前焦点面板向下翻页（向旧消息方向）
      if (focusPanel === 'chat') {
        const maxScroll = Math.max(0, messages.length - CHAT_VISIBLE_COUNT);
        if (chatScrollOffset < maxScroll) {
          setChatScroll(Math.min(chatScrollOffset + SCROLL_STEP, maxScroll));
        }
      } else if (focusPanel === 'skill') {
        const maxScroll = Math.max(0, skills.length - 6);
        if (skillScrollOffset < maxScroll) {
          setSkillScroll(Math.min(skillScrollOffset + SCROLL_STEP, maxScroll));
        }
      } else if (focusPanel === 'agent') {
        const maxScroll = Math.max(0, availableAgents.length - 4);
        if (agentScrollOffset < maxScroll) {
          setAgentScroll(Math.min(agentScrollOffset + SCROLL_STEP, maxScroll));
        }
      }
    } else if (key.tab) {
      // @agent 切换: 直接补全并立即切换
      if (input.startsWith('@')) {
        const matches = getAgentMatches(input, availableAgents);
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
        const matches = getCompletions(input, commands, availableAgents);
        if (matches.length === 1) {
          setInput(matches[0]!);
        } else if (matches.length > 1) {
          setCompletions(matches);
        } else {
          // 无匹配时，Tab 切换焦点面板
          cycleFocusPanel();
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

  const focusLabel = focusPanel === 'chat' ? 'Chat' : focusPanel === 'agent' ? 'Agents' : 'Skills';

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

      {/* 焦点提示 + 补全提示 */}
      {(completions.length > 0 || focusPanel !== 'chat') && (
        <Box paddingLeft={2}>
          {completions.length > 0 ? (
            <Text color="cyan" dimColor>
              {completions.slice(0, 5).map((c, i) => (
                c + (i < Math.min(completions.length, 5) - 1 ? ' | ' : '')
              ))}
            </Text>
          ) : (
            <Text color="gray" dimColor>
              focus: {focusLabel} | \u2191\u2193 scroll | PgUp/Dn page | Tab switch
            </Text>
          )}
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