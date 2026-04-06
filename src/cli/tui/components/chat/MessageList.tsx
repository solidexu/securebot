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
 * 每条消息最多约 13 行 (1 header + 12 content)，3 条消息 ≈ 39 行。
 * 配合 ChatPanel 的 flexGrow={1} + overflow="hidden"，不会撑大 TUI。
 */
const MAX_VISIBLE_MSGS = 3;

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
        <Text color="gray" dimColor> (PgUp/PgDn scroll | Enter next | Esc close)</Text>
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
  const endIdx = totalMessages - scrollOffset;
  const startIdx = Math.max(0, endIdx - MAX_VISIBLE_MSGS);
  const visibleMessages = messages.slice(startIdx, endIdx);

  // 获取当前选中的消息（用于查看完整内容）
  const selectedMessage = selectedMessageId
    ? messages.find(m => m.id === selectedMessageId) ?? null
    : null;

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
          {scrollOffset > 0 && startIdx > 0 && (
            <Text color="yellow" dimColor>
              {' ... ('}{startIdx} older){' '}
              <Text color="cyan">(PgUp/PgDn)</Text>
            </Text>
          )}
          {scrollOffset === 0 && totalMessages > MAX_VISIBLE_MSGS && (
            <Text color="gray" dimColor>
              {' '}{endIdx}/{totalMessages}
            </Text>
          )}
        </Box>

        {/* 右侧滚动条 — 与 AgentList / SkillViewer 完全相同 */}
        {totalMessages > MAX_VISIBLE_MSGS && (
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