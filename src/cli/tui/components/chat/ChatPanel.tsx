import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../../context/index.js';
import { MessageList } from './MessageList.js';
import { theme } from '../../styles/theme.js';

export const ChatPanel: React.FC = () => {
  const { messages, isStreaming, chatScrollOffset, focusPanel, focusBlink } = useApp();
  const [blinkOn, setBlinkOn] = useState(false);
  const isFocused = focusPanel === 'chat';

  // 闪烁效果：当 focusBlink 为 true 时，交替显示/隐藏高亮
  useEffect(() => {
    if (focusBlink && isFocused) {
      let count = 0;
      const interval = setInterval(() => {
        setBlinkOn(prev => !prev);
        count++;
        if (count >= 6) {  // 6 次切换 ≈ 300ms
          setBlinkOn(false);
          clearInterval(interval);
        }
      }, 50);
      return () => clearInterval(interval);
    }
  }, [focusBlink, isFocused]);

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
          <Text color="yellow">
            {' '}
            <Spinner type="dots" /> stream
          </Text>
        )}
      </Box>

      {/* 消息列表 - 填充剩余空间，高度由父容器决定，内容不撑大 */}
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        <MessageList messages={messages} scrollOffset={chatScrollOffset} />
      </Box>
    </Box>
  );
};

// 内联 Spinner 避免额外导入问题
const Spinner: React.FC<{ type?: string }> = () => (
  <Text color="yellow">{'\u25a0'}</Text>
);
