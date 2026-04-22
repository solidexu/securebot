import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Box, Text, useStdout } from 'ink';
import { Spinner } from '@inkjs/ui';
import { useApp } from '../../context/index.js';
import { MessageList } from './MessageList.js';
import { flattenCollapsibleMessage } from './CollapsibleMessage.js';
import { useMouse } from '../../hooks/useMouse.js';
import { theme } from '../../styles/theme.js';

/** 消息列表窗口高度（与 MessageList.WINDOW_HEIGHT 保持一致） */
const WINDOW_HEIGHT = 30;
/** 标题栏行数 */
const HEADER_HEIGHT = 1;

/** 消息类型视觉风格 */
const MSG_STYLES: Record<string, { headerColor: string; contentColor: string; icon: string; prefix: string }> = {
  user:   { headerColor: 'green',   contentColor: 'white',   icon: '\u25b6', prefix: '' },
  agent:  { headerColor: 'cyan',    contentColor: 'white',   icon: '\u2728', prefix: ' \u2503 ' },
  system: { headerColor: '#8888aa', contentColor: '#666688', icon: '\u25a1', prefix: ' \u25cb ' },
  tool:   { headerColor: 'yellow',  contentColor: '#dddd77', icon: '\u2699', prefix: ' \u25aa ' },
  error:  { headerColor: 'red',     contentColor: 'red',     icon: '\u26a0', prefix: '' },
  skill:  { headerColor: 'magenta',colorColor: 'white',   icon: '\u{1f527}', prefix: '' },
  warn:   { headerColor: 'yellow',  contentColor: 'yellow',  icon: '~',     prefix: '' },
  thinking: { headerColor: 'magenta', contentColor: 'magenta', icon: '\u{1f4ad}', prefix: ' \u2503 ' },
};

/** 扁平化行数据 */
interface FlatLine {
  text: string;
  messageId?: string;
  clickable?: boolean;
}

/** 将所有消息展开为扁平化行列表 */
function flattenAllMessagesForClick(messages: import('../../types/message.js').Message[]): FlatLine[] {
  const lines: FlatLine[] = [];
  messages.forEach((msg) => {
    const isUser = msg.type === 'user';
    const style = MSG_STYLES[msg.type] || MSG_STYLES.system;
    const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    // 工具调用和思考消息使用折叠组件逻辑
    if (msg.type === 'tool' || msg.type === 'thinking' || msg.subType === 'thinking') {
      const collapsibleLines = flattenCollapsibleMessage(msg, false);
      collapsibleLines.forEach((cl) => {
        lines.push({
          text: cl.text,
          messageId: cl.messageId,
          clickable: cl.clickable,
        });
      });
      return;
    }

    // 普通消息
    lines.push({
      text: `${style.icon} ${msg.sender} ${time}`,
      messageId: msg.id,
      clickable: false,
    });

    for (const line of msg.content.split('\n')) {
      lines.push({
        text: line,
        messageId: msg.id,
        clickable: false,
      });
    }
  });
  return lines;
}

export const ChatPanel: React.FC = () => {
  const { messages, isStreaming, chatScrollOffset, focusPanel, focusBlink, setChatScroll, toggleCollapse, selectMessage } = useApp();
  const { stdout } = useStdout();
  const [blinkOn, setBlinkOn] = useState(false);
  const isFocused = focusPanel === 'chat';

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const setChatScrollRef = useRef(setChatScroll);
  setChatScrollRef.current = setChatScroll;
  const toggleCollapseRef = useRef(toggleCollapse);
  toggleCollapseRef.current = toggleCollapse;
  const selectMessageRef = useRef(selectMessage);
  selectMessageRef.current = selectMessage;

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

  // 扁平化消息行（用于点击计算）
  const allLines = useMemo(() => flattenAllMessagesForClick(messages), [messages]);
  const totalLines = allLines.length;

  /** 处理鼠标点击 */
  const handleMouseEvent = useCallback((mouseData: import('../../hooks/useMouse.js').MouseData) => {
    if (!mouseData.press) return; // 只处理按下事件

    const cols = stdout.columns;
    const rows = stdout.rows;

    // 计算 ChatPanel 宽度
    const chatWidth = Math.floor(cols * 0.78);
    const scrollBarX = chatWidth;
    const scrollBarXMin = chatWidth - 5;

    const { x, y } = mouseData;

    // 计算消息区域的 Y 范围
    const messageAreaTop = HEADER_HEIGHT + 1;
    const messageAreaHeight = WINDOW_HEIGHT;
    const messageAreaBottom = messageAreaTop + messageAreaHeight - 1;

    if (y < messageAreaTop || y > messageAreaBottom) return;

    // 判断是否点击在滚动条区域
    if (x >= scrollBarXMin && x <= scrollBarX + 3) {
      // 滚动条点击
      const clickRatio = (y - messageAreaTop) / (messageAreaBottom - messageAreaTop);
      const maxOffset = Math.max(0, totalLines - WINDOW_HEIGHT);
      if (maxOffset <= 0) return;
      const newOffset = Math.round(maxOffset * (1 - clickRatio));
      setChatScrollRef.current(Math.max(0, Math.min(newOffset, maxOffset)));
      return;
    }

    // 消息区域点击：计算点击的行索引
    const maxOffset = Math.max(0, totalLines - WINDOW_HEIGHT);
    const clampedOffset = Math.min(chatScrollOffset, maxOffset);
    const startIdx = Math.max(0, totalLines - WINDOW_HEIGHT - clampedOffset);

    // 点击的行在可见窗口中的位置（从上到下，0-indexed）
    const visibleLineIndex = y - messageAreaTop;
    // 对应的全局行索引
    const globalLineIndex = startIdx + visibleLineIndex;

    if (globalLineIndex >= 0 && globalLineIndex < allLines.length) {
      const clickedLine = allLines[globalLineIndex];
      if (clickedLine?.clickable && clickedLine.messageId) {
        // 切换折叠状态
        toggleCollapseRef.current(clickedLine.messageId);
        selectMessageRef.current(clickedLine.messageId);
      }
    }
  }, [stdout.columns, stdout.rows, allLines, totalLines, chatScrollOffset]);

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
