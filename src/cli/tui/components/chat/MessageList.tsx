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
 * 消息滚动模式（与 AgentList/SkillViewer 完全一致）：
 * - scrollOffset = 从最新消息往回数了多少条（0=显示最新消息）
 * - 固定显示 MAX_VISIBLE_MSGS 条消息
 * - 内容按行截断
 */
const MAX_VISIBLE_MSGS = 2;  // 固定显示 2 条消息

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
  const VIEWER_LINES = 12;

  const maxScroll = Math.max(0, totalLines - VIEWER_LINES);
  const clampedScroll = Math.min(scrollOffset, maxScroll);
  const visibleLines = lines.slice(clampedScroll, clampedScroll + VIEWER_LINES);

  return (
    <Box
      flexDirection="column"
      borderTop="single"
      borderColor="yellow"
      // 固定高度覆盖在消息区上方
      height={VIEWER_LINES + 2}
      backgroundColor="#1a1b26"
    >
      <Box paddingY={0} flexShrink={0}>
        <Text bold color="yellow">
          {'\u25b6 '} Full Content [{clampedScroll + 1}-{Math.min(clampedScroll + VIEWER_LINES, totalLines)}/{totalLines}]
        </Text>
        <Text color="gray" dimColor> (Wheel/PgUp/PgDn | Enter next | Esc)</Text>
      </Box>
      <Box flexDirection="column" flexShrink={0}>
        {visibleLines.map((line, i) => (
          <Text key={i} color="white">
            {line || ' '}
          </Text>
        ))}
      </Box>
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

  // 计算最大滚动偏移（按消息条数，而非行数）
  const maxScroll = Math.max(0, totalMessages - MAX_VISIBLE_MSGS);
  const clampedScroll = Math.min(scrollOffset, maxScroll);

  // endIdx = 下一条要显示的最新消息的索引
  // 例如: total=5, scroll=0 → endIdx=5(显示消息4,3)
  //       total=5, scroll=1 → endIdx=4(显示消息3,2)
  const endIdx = totalMessages - clampedScroll;
  const startIdx = Math.max(0, endIdx - MAX_VISIBLE_MSGS);
  const visibleMessages = messages.slice(startIdx, endIdx);

  // 获取当前选中的消息
  const selectedMessage = selectedMessageId
    ? messages.find(m => m.id === selectedMessageId) ?? null
    : null;

  return (
    <Box flexDirection="column" height="100%">
      {/* 消息列表主体 - 固定高度，最多显示 MAX_VISIBLE_MSGS 条 */}
      <Box flexDirection="row" flexGrow={0} flexShrink={0}>
        <Box flexDirection="column" flexGrow={1} flexShrink={0} width="100%">
          {visibleMessages.map((msg) => (
            <MessageItem
              key={msg.id}
              message={msg}
              isSelected={msg.id === selectedMessageId}
              onSelect={() => selectMessage(msg.id)}
            />
          ))}
          {/* 滚动指示器 */}
          {clampedScroll > 0 && (
            <Text color="yellow" dimColor>
              {' '}({clampedScroll} older){' '}
              <Text color="cyan">(Wheel/PgUp/PgDn)</Text>
            </Text>
          )}
          {clampedScroll === 0 && totalMessages > 1 && (
            <Text color="gray" dimColor>
              {' '}{totalMessages} msgs
            </Text>
          )}
        </Box>

        {/* 右侧滚动条 */}
        {totalMessages > MAX_VISIBLE_MSGS && (
          <ScrollBar
            total={totalMessages}
            visible={MAX_VISIBLE_MSGS}
            offset={clampedScroll}
            color={isFocused ? 'green' : 'blue'}
          />
        )}
      </Box>

      {/* 消息查看器 - 固定高度，单独占用空间 */}
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