import React, { useMemo, useRef } from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../../types/index.js';

/**
 * 虚拟化消息列表 Props
 */
export interface VirtualMessageListProps {
  /** 消息列表 */
  messages: Message[];
  /** 视口高度（行数） */
  height: number;
  /** 滚动偏移（0=最新） */
  scrollOffset?: number;
  /** 滚动偏移变化回调 */
  onScrollChange?: (offset: number) => void;
  /** 渲染单个消息的函数 */
  renderItem: (message: Message, index: number) => React.ReactNode;
  /** 预渲染行数（缓冲区） */
  overscan?: number;
}

/**
 * 消息行（扁平化后的单行）
 */
interface MessageLine {
  /** 消息索引 */
  messageIndex: number;
  /** 行类型：header（头部） | content（内容） */
  type: 'header' | 'content';
  /** 行内容 */
  content: string;
  /** 行样式 */
  style: {
    color?: string;
    bold?: boolean;
    dimColor?: boolean;
    align?: 'left' | 'right';
    prefix?: string;
  };
}

/**
 * 将消息列表扁平化为行列表
 * 每条消息包含头部 + 内容行
 */
function flattenMessages(
  messages: Message[],
  startIndex: number,
  endIndex: number
): MessageLine[] {
  const lines: MessageLine[] = [];
  
  for (let i = startIndex; i < Math.min(endIndex, messages.length); i++) {
    const msg = messages[i];
    const isUser = msg.type === 'user';
    
    // 消息头部
    lines.push({
      messageIndex: i,
      type: 'header',
      content: `${msg.sender} ${new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
      style: {
        color: msg.type === 'user' ? 'green' : 'cyan',
        bold: true,
        align: isUser ? 'right' : 'left',
      },
    });

    // 消息内容（按行分割）
    const contentLines = msg.content.split('\n');
    for (const line of contentLines) {
      lines.push({
        messageIndex: i,
        type: 'content',
        content: line,
        style: {
          color: msg.type === 'system' ? '#666688' : 'white',
          dimColor: msg.type === 'system',
          align: isUser ? 'right' : 'left',
          prefix: isUser ? '' : ' │ ',
        },
      });
    }
  }
  
  return lines;
}

/**
 * 虚拟化消息列表组件
 * 只渲染视口内可见的消息，性能优化
 */
export const VirtualMessageList: React.FC<VirtualMessageListProps> = ({
  messages,
  height,
  scrollOffset = 0,
  onScrollChange,
  renderItem,
  overscan = 3,
}) => {
  // 计算总行数（消息头部 + 内容行）
  const totalLines = useMemo(() => {
    return messages.reduce((sum, msg) => {
      // 每条消息：头部1行 + 内容N行
      return sum + 1 + msg.content.split('\n').length;
    }, 0);
  }, [messages]);

  // 计算可见范围（虚拟化）
  const viewport = useMemo(() => {
    // 底部锚定模式：offset=0 显示最新内容
    const maxOffset = Math.max(0, totalLines - height);
    const clampedOffset = Math.min(scrollOffset, maxOffset);
    
    // 计算起始位置（从后往前）
    const startLine = Math.max(0, totalLines - height - clampedOffset);
    const endLine = startLine + height;
    
    return {
      startLine,
      endLine,
      totalLines,
      offset: clampedOffset,
    };
  }, [messages, height, scrollOffset, totalLines]);

  // 扁平化消息（只处理可见范围）
  const visibleLines = useMemo(() => {
    // 简化版本：按消息分割，不精确计算行数
    // TODO: 精确计算行数，实现真正的虚拟化
    const startIndex = Math.max(0, messages.length - height - overscan);
    const endIndex = messages.length;
    return flattenMessages(messages, startIndex, endIndex);
  }, [messages, height, overscan]);

  // 渲染可见行
  const renderedLines = useMemo(() => {
    // 截取可见部分
    const startIdx = Math.max(0, visibleLines.length - height);
    const lines = visibleLines.slice(startIdx, startIdx + height);
    
    return lines.map((line, i) => {
      const { style, content } = line;
      
      if (style.align === 'right') {
        return (
          <Box key={i} width="100%" justifyContent="flex-end">
            <Text color={style.color} bold={style.bold}>
              {content}
            </Text>
          </Box>
        );
      }
      
      return (
        <Text key={i} color={style.color} bold={style.bold} dimColor={style.dimColor}>
          {style.prefix}{content}
        </Text>
      );
    });
  }, [visibleLines, height]);

  return (
    <Box flexDirection="column" height={height}>
      {renderedLines}
      
      {/* 底部信息栏 */}
      {totalLines > height && (
        <Text color="gray" dimColor>
          {' '}lines {viewport.startLine + 1}-{Math.min(viewport.endLine, totalLines)}/{totalLines}
        </Text>
      )}
    </Box>
  );
};