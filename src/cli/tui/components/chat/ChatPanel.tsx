import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Box, Text, useStdout } from 'ink';
import { Spinner } from '@inkjs/ui';
import { useApp } from '../../context/index.js';
import { MessageList } from './MessageList.js';
import { useMouse } from '../../hooks/useMouse.js';
import { theme } from '../../styles/theme.js';

/** 消息列表窗口高度（与 MessageList.WINDOW_HEIGHT 保持一致） */
const WINDOW_HEIGHT = 30;
/** 标题栏行数 */
const HEADER_HEIGHT = 1;

/** 计算消息完整展开行数（与 InputBox 保持一致） */
function calcTotalLines(messages: { content: string }[]): number {
  let total = 0;
  for (let i = 0; i < messages.length; i++) {
    total += 1; // header
    total += messages[i]!.content.split('\n').length;
  }
  return total;
}

export const ChatPanel: React.FC = () => {
  const { messages, isStreaming, chatScrollOffset, focusPanel, focusBlink, setChatScroll } = useApp();
  const { stdout } = useStdout();
  const [blinkOn, setBlinkOn] = useState(false);
  const isFocused = focusPanel === 'chat';

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const setChatScrollRef = useRef(setChatScroll);
  setChatScrollRef.current = setChatScroll;

  // 闪烁效果
  useEffect(() => {
    if (focusBlink && isFocused) {
      let count = 0;
      const interval = setInterval(() => {
        setBlinkOn(prev => !prev);
        count++;
        if (count >= 6) {
          setBlinkOn(false);
          clearInterval(interval);
        }
      }, 50);
      return () => clearInterval(interval);
    }
  }, [focusBlink, isFocused]);

  /** 处理鼠标点击滚动条区域 */
  const handleMouseEvent = useCallback((mouseData: import('../../hooks/useMouse.js').MouseData) => {
    if (!mouseData.press) return; // 只处理按下事件

    const cols = stdout.columns;
    const rows = stdout.rows;

    // 计算 ChatPanel 宽度
    const chatWidth = Math.floor(cols * 0.78);
    // 滚动条在 ChatPanel 最右侧（border + padding + 内容 + scrollBar）
    const scrollBarX = chatWidth; // 终端 1-indexed，约等于 chatWidth
    const scrollBarXMin = chatWidth - 5; // 容差范围（5列）

    const { x, y } = mouseData;

    // 判断是否点击在滚动条区域（右边缘附近）
    if (x < scrollBarXMin || x > scrollBarX + 3) return;

    // 计算消息区域的 Y 范围（跳过标题栏 1 行，终端行号从 1 开始）
    const messageAreaTop = HEADER_HEIGHT + 1;
    const messageAreaHeight = WINDOW_HEIGHT;
    const messageAreaBottom = messageAreaTop + messageAreaHeight - 1;

    if (y < messageAreaTop || y > messageAreaBottom) return;

    // 点击位置在消息区域中的比例 (0=顶部, 1=底部)
    const clickRatio = (y - messageAreaTop) / (messageAreaBottom - messageAreaTop);

    // 计算最大滚动偏移（基于实际行数）
    const totalLines = calcTotalLines(messagesRef.current);
    const maxOffset = Math.max(0, totalLines - WINDOW_HEIGHT);
    if (maxOffset <= 0) return;

    // 映射: 点击顶部 = 最大偏移(看最旧消息), 点击底部 = 0(看最新消息)
    const newOffset = Math.round(maxOffset * (1 - clickRatio));
    setChatScrollRef.current(Math.max(0, Math.min(newOffset, maxOffset)));
  }, [stdout.columns, stdout.rows]);

  // 启用鼠标支持（仅在 chat panel 聚焦时）
  useMouse({
    onMouseEvent: handleMouseEvent,
    isActive: isFocused,
  });

  const borderColor = isFocused ? (blinkOn ? 'white' : 'green') : 'blue';
  const titleIndicator = isFocused ? (blinkOn ? ' \u2605 ' : ' \u25cf ') : ' \u25cf ';

  return (
    <Box
      flexDirection="column"
      width={theme.layout.chatWidth}
      height="100%"
      borderStyle={isFocused && blinkOn ? theme.borders.focus : theme.borders.normal}
      borderColor={borderColor}
      paddingX={theme.layout.paddingX}
    >
      {/* 标题栏 - 固定1行高度，不伸缩 */}
      <Box
        height={1}
        borderBottom
        borderColor={borderColor}
        flexShrink={0}
        flexGrow={0}
      >
        <Text bold color={isFocused ? 'green' : 'white'}>
          {titleIndicator} Chat
        </Text>
        <Text color="gray">
          {' | '}{messages.length} msgs
        </Text>
        {chatScrollOffset > 0 && (
          <Text color="yellow"> (scroll:{chatScrollOffset})</Text>
        )}
        {isStreaming && (
          <Box>
            <Text color="yellow"> </Text>
            <Spinner type="dots" />
            <Text color="yellow"> stream</Text>
          </Box>
        )}
      </Box>

      {/* 消息列表 - 填充剩余空间，高度由父容器决定，内容不撑大 */}
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        <MessageList messages={messages} scrollOffset={chatScrollOffset} />
      </Box>
    </Box>
  );
};
