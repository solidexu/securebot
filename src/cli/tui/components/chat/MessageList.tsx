import React from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../../types/index.js';
import { MessageItem } from './MessageItem.js';
import { ScrollBar } from '../common/ScrollBar.js';
import { useApp } from '../../context/index.js';

interface Props {
  messages: Message[];
  scrollOffset?: number;
}

/**
 * 与 AgentList(MAX_VISIBLE_AGENTS=4)、SkillViewer(MAX_VISIBLE_SKILLS=6) 完全相同的滚动模式：
 * - 固定可见条数
 * - 每条消息内容截断
 * - 总渲染行数有硬上限
 *
 * 调整为约25行可见窗口（2条消息 x 约12行/条 + header）
 */
const MAX_VISIBLE_MSGS = 2;  // 约25行窗口

/**
 * 消息查看器 - 显示选中消息的完整内容（固定12行，覆盖在消息列表上方）
 */
const MessageViewer: React.FC<{ message: Message; scrollOffset: number; onScroll: (offset: number) => void }> = ({
  message,
  scrollOffset,
  onScroll,
}) => {
  const lines = message.content.split('\n');
  const totalLines = lines.length;
  const VIEWER_LINES = 12; // 固定显示 12 行

  const maxScroll = Math.max(0, totalLines - VIEWER_LINES);
  const clampedScroll = Math.min(scrollOffset, maxScroll);
  const visibleLines = lines.slice(clampedScroll, clampedScroll + VIEWER_LINES);

  return (
    <Box
      flexDirection="column"
      borderTop="single"
      borderColor="yellow"
      // 覆盖在消息列表上方，不挤占 flex 空间
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      backgroundColor="#1a1b26"
    >
      <Box paddingY={0} flexShrink={0}>
        <Text bold color="yellow">
          {'\u25b6 '} Full Content [{clampedScroll + 1}-{Math.min(clampedScroll + VIEWER_LINES, totalLines)}/{totalLines}]
        </Text>
        <Text color="gray" dimColor> (Wheel/PgUp/PgDn scroll | Enter next | Esc close)</Text>
      </Box>
      <Box flexDirection="column" flexShrink={1} overflow="hidden">
        {visibleLines.map((line, i) => (
          <Text key={i} color="white">
            {line || ' '}
          </Text>
        ))}
      </Box>
      {/* 内嵌滚动条 */}
      {totalLines > VIEWER_LINES && (
        <ScrollBar
          total={totalLines}
          visible={VIEWER_LINES}
          offset={clampedScroll}
          color="yellow"
        />
      )}
    </Box>
  );
};

export const MessageList: React.FC<Props> = ({
  messages,
  scrollOffset = 0,
}) => {
  const {
    focusPanel,
    selectedMessageId,
    messageViewerOpen,
    messageScrollOffset,
    setMessageScrollOffset,
    selectMessage,
  } = useApp();
  const isFocused = focusPanel === 'chat';
  const totalMessages = messages.length;

  if (totalMessages === 0) {
    return (
      <Box paddingX={2}>
        <Text color="gray">No messages yet</Text>
      </Box>
    );
  }

  // 计算可见消息范围（基于 scrollOffset 在消息间滚动）
  // scrollOffset 是行偏移（0 = 从最新消息开始）
  // 计算从最新消息往上看，累计了多少行
  let accumulatedLines = 0;
  let endIdx = totalMessages; // 从最新消息开始

  // 找到 endIdx：累计行数刚好 >= scrollOffset 的位置
  for (let i = totalMessages - 1; i >= 0; i--) {
    const msgLines = Math.min(messages[i]!.content.split('\n').length, 12) + 1; // +1 for header
    if (accumulatedLines + msgLines > scrollOffset) {
      endIdx = i + 1;
      break;
    }
    accumulatedLines += msgLines;
    if (i === 0) {
      endIdx = 0;
    }
  }

  // startIdx：从 endIdx 往上看，最多 MAX_VISIBLE_MSGS 条消息
  const startIdx = Math.max(0, endIdx - MAX_VISIBLE_MSGS);
  const visibleMessages = messages.slice(startIdx, endIdx);

  // 获取当前选中的消息（用于查看完整内容）
  const selectedMessage = selectedMessageId
    ? messages.find(m => m.id === selectedMessageId) ?? null
    : null;

  // 当前可见范围的起始行偏移（相对于 scrollOffset=0 的位置）
  const visibleStartLine = accumulatedLines;
  const visibleEndLine = visibleStartLine + visibleMessages.reduce(
    (sum, m) => sum + Math.min(m.content.split('\n').length, 12) + 1,
    0
  );

  return (
    // 使用相对定位作为 absolute 子元素的容器
    <Box flexDirection="column" height="100%" position="relative">
      {/* 消息列表主体 */}
      <Box flexDirection="row" flexGrow={1} flexShrink={1}>
        <Box flexDirection="column" flexGrow={1} flexShrink={1} width="100%">
          {visibleMessages.map((msg) => (
            <MessageItem
              key={msg.id}
              message={msg}
              isSelected={msg.id === selectedMessageId}
              onSelect={() => selectMessage(msg.id)}
            />
          ))}
          {/* 滚动指示器 */}
          {scrollOffset > 0 && (
            <Text color="yellow" dimColor>
              {' ... ('}{startIdx} older){' '}
              <Text color="cyan">(Wheel/PgUp/PgDn)</Text>
            </Text>
          )}
          {scrollOffset === 0 && totalMessages > 1 && (
            <Text color="gray" dimColor>
              {' '}{totalMessages} msgs
            </Text>
          )}
        </Box>

        {/* 右侧滚动条 — 与 AgentList / SkillViewer 完全相同 */}
        {totalMessages > 1 && (
          <ScrollBar
            total={totalMessages}
            visible={MAX_VISIBLE_MSGS}
            offset={scrollOffset}
            color={isFocused ? 'green' : 'blue'}
          />
        )}
      </Box>

      {/* 消息查看器 — 覆盖在消息列表上方（当选中消息时） */}
      {messageViewerOpen && selectedMessage && (
        <MessageViewer
          message={selectedMessage}
          scrollOffset={messageScrollOffset}
          onScroll={setMessageScrollOffset}
        />
      )}
    </Box>
  );
};