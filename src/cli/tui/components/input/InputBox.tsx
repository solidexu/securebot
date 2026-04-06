import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useApp } from '../../context/index.js';

interface Props {
  onSubmit?: (input: string) => void;
  commands?: string[];
  agents?: string[];
}

const SCROLL_STEP = 10;       // PgUp/PgDn 翻页（10行）
const SCROLL_FINE_STEP = 1;  // 上下箭头/Wheel 微调（1行）

/** 计算消息完整展开行数（所有内容，不截断） */
function calcTotalLines(messages: { content: string }[]): number {
  let total = 0;
  for (let i = 0; i < messages.length; i++) {
    total += 1; // header
    total += messages[i]!.content.split('\n').length; // 全部内容行
  }
  return total;
}

const CHAT_WINDOW_HEIGHT = 30;  // 与 MessageList.WINDOW_HEIGHT 保持一致

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
    // 消息查看器相关
    selectedMessageId,
    messageViewerOpen,
    messageScrollOffset,
    selectMessage,
    closeMessageViewer,
    setMessageScrollOffset,
  } = useApp();

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  // 注册滚轮事件回调（在 render 之后设置全局回调）
  useEffect(() => {
    const wheelCallback = (deltaY: number) => {
      if (isStreaming) return;

      // deltaY: 负数=向上滚动(新内容), 正数=向下滚动(旧内容)
      // 消息查看器打开时：在消息内容中滚动
      if (messageViewerOpen) {
        const selectedMsg = messages.find(m => m.id === selectedMessageId);
        if (selectedMsg) {
          const maxScroll = Math.max(0, selectedMsg.content.split('\n').length - 12);
          if (deltaY < 0) {
            // 向上滚动 = 向新内容 = 减少 offset（内容向上滚）
            setMessageScrollOffset(Math.max(messageScrollOffset - 1, 0));
          } else {
            // 向下滚动 = 向旧内容 = 增加 offset
            setMessageScrollOffset(Math.min(messageScrollOffset + 1, maxScroll));
          }
        }
        return;
      }

      // 消息查看器关闭时：在消息列表中滚动（底部锚定模式）
      if (focusPanel === 'chat') {
        // 底部锚定：offset=0 显示最新内容，offset 增大往旧内容滚动
        const totalLines = calcTotalLines(messages);
        const maxScroll = Math.max(0, totalLines - CHAT_WINDOW_HEIGHT);
        if (deltaY < 0) {
          // 向上滚动（鼠标前滚）→ 看旧内容 → 增加 offset
          setChatScroll(Math.min(chatScrollOffset + SCROLL_FINE_STEP, maxScroll));
        } else {
          // 向下滚动（鼠标后滚）→ 看新内容 → 减少 offset
          setChatScroll(Math.max(chatScrollOffset - SCROLL_FINE_STEP, 0));
        }
      } else if (focusPanel === 'skill') {
        if (deltaY < 0) {
          setSkillScroll(Math.max(skillScrollOffset - 1, 0));
        } else {
          setSkillScroll(Math.min(skillScrollOffset + 1, Math.max(0, skills.length - 6)));
        }
      } else if (focusPanel === 'agent') {
        if (deltaY < 0) {
          setAgentScroll(Math.max(agentScrollOffset - 1, 0));
        } else {
          setAgentScroll(Math.min(agentScrollOffset + 1, Math.max(0, agents.length - 4)));
        }
      }
    };

    // 通过全局回调注册
    (global as any).__tuiWheelCallback?.(wheelCallback);

    return () => {
      (global as any).__tuiWheelCallback?.(null);
    };
  }, [isStreaming, messageViewerOpen, messageScrollOffset, selectedMessageId, messages, chatScrollOffset, focusPanel, skillScrollOffset, agentScrollOffset, skills, agents]);

  // Tab 循环顺序: chat → agent → skill → chat
  const cycleFocusPanel = () => {
    const order: Array<'chat' | 'agent' | 'skill'> = ['chat', 'agent', 'skill'];
    const idx = order.indexOf(focusPanel);
    setFocusPanel(order[(idx + 1) % order.length]);
  };

  // 获取当前可见行范围内第一条消息（用于空Enter选择）
  const getFirstVisibleMsgId = () => {
    if (messages.length === 0) return null;
    const totalLines = calcTotalLines(messages);
    // 底部锚定模式：计算实际起始行索引
    const startIdx = Math.max(0, totalLines - CHAT_WINDOW_HEIGHT - chatScrollOffset);
    let lineIdx = 0;
    for (let i = 0; i < messages.length; i++) {
      const msgLines = 1 + messages[i]!.content.split('\n').length;
      if (lineIdx + msgLines > startIdx && lineIdx < startIdx + CHAT_WINDOW_HEIGHT) {
        return messages[i]!.id;
      }
      lineIdx += msgLines;
    }
    return messages[messages.length - 1]?.id ?? null;
  };

  // 切换到下一条可见消息
  const cycleToNextMessage = () => {
    const allMsgIds = messages.map(m => m.id);
    if (allMsgIds.length === 0) return;
    if (!selectedMessageId || !allMsgIds.includes(selectedMessageId)) {
      selectMessage(allMsgIds[allMsgIds.length - 1]!);
      return;
    }
    const currentIdx = allMsgIds.indexOf(selectedMessageId);
    // 向前切换一条（更旧的消息）
    const nextIdx = currentIdx > 0 ? currentIdx - 1 : allMsgIds.length - 1;
    selectMessage(allMsgIds[nextIdx]!);
  };

  useInput((char, key) => {
    if (isStreaming) return;

    // 消息查看器打开时的特殊处理
    if (messageViewerOpen) {
      if (key.escape) {
        closeMessageViewer();
        return;
      }
      if (key.return) {
        // Enter: 切换到下一条可见消息
        cycleToNextMessage();
        return;
      }
      if (key.pageUp) {
        // PgUp: 在消息内容中向上滚动
        const selectedMsg = messages.find(m => m.id === selectedMessageId);
        if (selectedMsg) {
          const maxScroll = Math.max(0, selectedMsg.content.split('\n').length - 12);
          setMessageScrollOffset(Math.max(messageScrollOffset - SCROLL_STEP, 0));
        }
        return;
      }
      if (key.pageDown) {
        // PgDn: 在消息内容中向下滚动
        const selectedMsg = messages.find(m => m.id === selectedMessageId);
        if (selectedMsg) {
          const maxScroll = Math.max(0, selectedMsg.content.split('\n').length - 12);
          setMessageScrollOffset(Math.min(messageScrollOffset + SCROLL_STEP, maxScroll));
        }
        return;
      }
      if (key.upArrow) {
        // 微调滚动
        const selectedMsg = messages.find(m => m.id === selectedMessageId);
        if (selectedMsg) {
          const maxScroll = Math.max(0, selectedMsg.content.split('\n').length - 12);
          setMessageScrollOffset(Math.max(messageScrollOffset - SCROLL_FINE_STEP, 0));
        }
        return;
      }
      if (key.downArrow) {
        // 微调滚动
        const selectedMsg = messages.find(m => m.id === selectedMessageId);
        if (selectedMsg) {
          const maxScroll = Math.max(0, selectedMsg.content.split('\n').length - 12);
          setMessageScrollOffset(Math.min(messageScrollOffset + SCROLL_FINE_STEP, maxScroll));
        }
        return;
      }
      // 其他按键：关闭查看器
      if (char && !key.escape) {
        closeMessageViewer();
      }
      return;
    }

    // 正常模式（非消息查看器）
    if (key.return) {
      if (input.trim()) {
        onSubmit?.(input.trim());
        addToHistory(input.trim());
        setInput('');
        setCompletions([]);
        // 发送消息后自动回到最新
        if (chatScrollOffset > 0) setChatScroll(0);
      } else {
        // 空输入 + Enter: 选择最旧的消息查看完整内容
        const visibleId = getFirstVisibleMsgId();
        if (visibleId) {
          selectMessage(visibleId);
        }
      }
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
      setCompletions([]);
    } else if (key.escape) {
      // Esc: 关闭查看器（如果打开的话）
      closeMessageViewer();
    } else if (key.upArrow) {
      // 输入为空时，上箭头用于向上微调滚动（底部锚定：↑=看旧内容）
      if (input.length === 0) {
        if (focusPanel === 'chat') {
          const totalLines = calcTotalLines(messages);
          const maxScroll = Math.max(0, totalLines - CHAT_WINDOW_HEIGHT);
          // ↑ 向上滚动 = 看旧内容 = 增加 offset
          if (chatScrollOffset < maxScroll) {
            setChatScroll(Math.min(chatScrollOffset + SCROLL_FINE_STEP, maxScroll));
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
      // 输入为空时，下箭头用于向下微调滚动（底部锚定：↓=看新内容）
      if (input.length === 0) {
        if (focusPanel === 'chat') {
          const totalLines = calcTotalLines(messages);
          const maxScroll = Math.max(0, totalLines - CHAT_WINDOW_HEIGHT);
          // ↓ 向下滚动 = 看新内容 = 减少 offset
          if (chatScrollOffset > 0) {
            setChatScroll(Math.max(chatScrollOffset - SCROLL_FINE_STEP, 0));
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
      // 根据当前焦点面板向上翻页（底部锚定：PgUp=看旧内容）
      if (focusPanel === 'chat') {
        const totalLines = calcTotalLines(messages);
        const maxScroll = Math.max(0, totalLines - CHAT_WINDOW_HEIGHT);
        if (chatScrollOffset < maxScroll) {
          setChatScroll(Math.min(chatScrollOffset + SCROLL_STEP, maxScroll));
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
      // 根据当前焦点面板向下翻页（底部锚定：PgDn=看新内容）
      if (focusPanel === 'chat') {
        const totalLines = calcTotalLines(messages);
        const maxScroll = Math.max(0, totalLines - CHAT_WINDOW_HEIGHT);
        if (chatScrollOffset > 0) {
          setChatScroll(Math.max(chatScrollOffset - SCROLL_STEP, 0));
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
  const viewerHint = messageViewerOpen
    ? 'Enter=next msg | Wheel/PgUp/PgDn scroll | Esc close'
    : 'Enter=view full | Wheel/PgUp/PgDn scroll | Tab=switch';

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
      {(completions.length > 0 || focusPanel !== 'chat' || messageViewerOpen) && (
        <Box paddingLeft={2}>
          {completions.length > 0 ? (
            <Text color="cyan" dimColor>
              {completions.slice(0, 5).map((c, i) => (
                c + (i < Math.min(completions.length, 5) - 1 ? ' | ' : '')
              ))}
            </Text>
          ) : (
            <Text color="gray" dimColor>
              {messageViewerOpen ? viewerHint : `focus: ${focusLabel} | ${viewerHint}`}
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
