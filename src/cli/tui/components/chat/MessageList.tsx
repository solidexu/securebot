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

/** 可见行数 - 固定窗口大小 */
const VISIBLE_LINES = 25;

/** 单条消息最大渲染行数 */
const MSG_MAX_LINES = 8;

/**
 * 将消息数组展开为扁平化行列表
 */
function flattenMessages(messages: Message[]): Array<{ line: string; msgIndex: number; isHeader: boolean }> {
  const lines: Array<{ line: string; msgIndex: number; isHeader: boolean }> = [];
  messages.forEach((msg, idx) => {
    // 消息头部
    const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    if (msg.type === 'tool') {
      const meta = msg.meta as { name?: string } | undefined;
      lines.push({
        line: `# ${meta?.name || 'Tool'} | ${time}`,
        msgIndex: idx,
        isHeader: true,
      });
    } else {
      const iconMap: Record<string, string> = {
        user: '>', agent: '*', system: '-', error: '!', skill: '\u{1f527}', warn: '~',
      };
      const icon = iconMap[msg.type] || '?';
      lines.push({
        line: `${icon} ${msg.sender} | ${time}`,
        msgIndex: idx,
        isHeader: true,
      });
    }
    // 消息内容行
    const contentLines = msg.content.split('\n');
    for (let i = 0; i < Math.min(contentLines.length, MSG_MAX_LINES); i++) {
      lines.push({ line: contentLines[i]!, msgIndex: idx, isHeader: false });
    }
    if (contentLines.length > MSG_MAX_LINES) {
      // 截断标记也算一行
      lines.push({
        line: `   [... ${contentLines.length - MSG_MAX_LINES} more lines]`,
        msgIndex: idx,
        isHeader: false,
      });
    }
  });
  return lines;
}

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

  // 展开所有消息为行
  const allLines = flattenMessages(messages);
  const totalLines = allLines.length;

  // 基于行偏移计算可见范围
  const maxOffset = Math.max(0, totalLines - VISIBLE_LINES);
  const clampedOffset = Math.min(scrollOffset, maxOffset);

  // 可见的行范围
  const visibleLines = allLines.slice(clampedOffset, clampedOffset + VISIBLE_LINES);

  // 当前选中的消息
  const selectedMessage = selectedMessageId
    ? messages.find(m => m.id === selectedMessageId) ?? null
    : null;

  return (
    <Box flexDirection="column">
      {/* 按行显示内容 */}
      <Box flexDirection="row" flexGrow={0}>
        <Box flexDirection="column" flexGrow={1} width="100%">
          {visibleLines.map((item, displayIdx) => {
            const msg = messages[item.msgIndex];
            const isSelected = msg?.id === selectedMessageId;

            if (item.isHeader) {
              // 头部行特殊样式
              let headerColor: string = 'white';
              let bold = false;
              if (msg?.type === 'tool') {
                headerColor = 'blue';
                bold = true;
              }

              return (
                <Text key={displayIdx} color={headerColor} bold={bold}>
                  {isSelected ? '\u25b6 ' : ''}{item.line}
                </Text>
              );
            }

            // 内容行
            if (msg?.type === 'tool') {
              return (
                <Text key={displayIdx} color="cyan">{isSelected && item.msgIndex === visibleLines[0]?.msgIndex ? '\u25b6' : '  '}{item.line}</Text>
              );
            }

            return <Text key={displayIdx}>{item.line}</Text>;
          })}
          {/* 滚动指示器 */}
          {clampedOffset > 0 && clampedOffset + VISIBLE_LINES < totalLines && (
            <Text color="yellow" dimColor>
              {' '}lines {clampedOffset + 1}-{Math.min(clampedOffset + VISIBLE_LINES, totalLines)}/{totalLines}
            </Text>
          )}
          {clampedOffset === 0 && totalLines > VISIBLE_LINES && (
            <Text color="gray" dimColor>
              {' '}{totalLines} lines | {totalMessages} msgs
            </Text>
          )}
        </Box>

        {/* 右侧滚动条 - 基于总行数 */}
        {totalLines > VISIBLE_LINES && (
          <ScrollBar
            total={totalLines}
            visible={VISIBLE_LINES}
            offset={clampedOffset}
            color={isFocused ? 'green' : 'blue'}
          />
        )}
      </Box>

      {/* 消息查看器 - 固定14行高度 */}
      {messageViewerOpen && selectedMessage && (
        <Box
          flexDirection="column"
          borderTop="single"
          borderColor="yellow"
          height={14}
          backgroundColor="#1a1b26"
        >
          <Box flexShrink={0}>
            <Text bold color="yellow">
              {'\u25b6 '} Full Content [{messageScrollOffset + 1}-{Math.min(messageScrollOffset + 12, selectedMessage.content.split('\n').length)}/{selectedMessage.content.split('\n').length}]
            </Text>
            <Text color="gray" dimColor> (Wheel/PgUp/PgDn | Enter next | Esc)</Text>
          </Box>
          <Box flexDirection="column" flexShrink={0}>
            {selectedMessage.content.split('\n')
              .slice(messageScrollOffset, messageScrollOffset + 12)
              .map((line, i) => (
                <Text key={i} color="white">{line || ' '}</Text>
              ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};