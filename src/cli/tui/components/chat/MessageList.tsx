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
 * 与 AgentList(MAX_VISIBLE_AGENTS=4)、SkillViewer(MAX_VISIBLE_SKILLS=6) 相同模式：
 * 硬限制可见条数，每条内容截断，总渲染行数有上限。
 *
 * 每条消息最多约 12 行 (header + content)，所以 6 条消息最多约 72 行。
 */
const MAX_VISIBLE_MSGS = 6;

export const MessageList: React.FC<Props> = ({
  messages,
  scrollOffset = 0,
}) => {
  const { focusPanel } = useApp();
  const isFocused = focusPanel === 'chat';
  const totalMessages = messages.length;

  if (totalMessages === 0) {
    return (
      <Box paddingX={2}>
        <Text color="gray">No messages yet</Text>
      </Box>
    );
  }

  // 与 AgentList/SkillViewer 完全相同的滚动逻辑：
  // scrollOffset=0 显示最后 N 条，scrollOffset>0 向旧消息方向移动
  const endIdx = totalMessages - scrollOffset;
  const startIdx = Math.max(0, endIdx - MAX_VISIBLE_MSGS);
  const visibleMessages = messages.slice(startIdx, endIdx);

  return (
    <Box flexDirection="row" flexGrow={1}>
      {/* 消息内容区 */}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} width="100%">
        {visibleMessages.map((msg) => (
          <MessageItem key={msg.id} message={msg} />
        ))}
        {/* 滚动指示器 */}
        {scrollOffset > 0 && startIdx > 0 && (
          <Text color="yellow" dimColor>
            {' ... ('}{startIdx} older){' '}
            <Text color="cyan">(PgUp/PgDn/\u2191\u2193)</Text>
          </Text>
        )}
        {scrollOffset === 0 && totalMessages > MAX_VISIBLE_MSGS && (
          <Text color="gray" dimColor>
            {' '}{endIdx}/{totalMessages}
          </Text>
        )}
      </Box>

      {/* 右侧滚动条 — 与 AgentList/SkillViewer 完全相同 */}
      {totalMessages > MAX_VISIBLE_MSGS && (
        <ScrollBar
          total={totalMessages}
          visible={MAX_VISIBLE_MSGS}
          offset={scrollOffset}
          color={isFocused ? 'green' : 'blue'}
        />
      )}
    </Box>
  );
};
