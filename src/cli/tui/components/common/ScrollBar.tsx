import React from 'react';
import { Box, Text } from 'ink';

interface ScrollBarProps {
  total: number;           // 总条目数
  visible: number;         // 可见条目数
  offset: number;          // 滚动偏移（0=最新/底部）
  color?: string;          // 滚动条颜色
  height?: number;         // 滚动条总高度（行数），默认 6
}

/**
 * 终端可视化滚动条 — 静态视觉指示器
 *
 * 仅用于显示当前位置和范围，不处理鼠标交互。
 * 鼠标交互（点击滚动条）在终端环境中不可靠，已移除。
 *
 * 键盘控制仍由 InputBox 处理：
 * - ↑/↓ 输入为空时微调滚动
 * - PgUp/PgDn 快速翻页
 * - Tab 切换焦点面板
 */
export const ScrollBar: React.FC<ScrollBarProps> = ({
  total,
  visible,
  offset,
  color = 'cyan',
  height = 6,
}) => {
  if (total <= visible) return null;

  const maxOffset = Math.max(0, total - visible);
  // 确保 offset 不超出范围，防止计算出错误的滑块位置
  const clampedOffset = Math.min(offset, maxOffset);

  // 滑块大小比例，至少占10%（避免内容很多时thumb太小）
  const thumbRatio = Math.max(visible / total, 0.1);
  const thumbSize = Math.max(Math.round(thumbRatio * height), 1);

  // 滑块位置：底部锚定模式
  // offset=0 在底部（最新内容），offset=maxOffset 在顶部（最旧内容）
  const positionRatio = maxOffset > 0 ? clampedOffset / maxOffset : 0;
  // 反转位置：offset越大thumb越靠上，offset=0时thumb在底部
  const thumbPosition = Math.round((1 - positionRatio) * (height - thumbSize));

  // 构建动态高度的滚动条（与内容区等高）
  const bars: React.ReactNode[] = [];
  for (let i = 0; i < height; i++) {
    const isThumb = i >= thumbPosition && i < thumbPosition + thumbSize;
    bars.push(
      <Text key={i} color={isThumb ? color : 'gray'} dimColor={!isThumb} bold={isThumb}>
        {isThumb ? '\u2588' : '\u2502'}
      </Text>
    );
  }

  return (
    <Box flexDirection="column" marginLeft={1} flexShrink={0}>
      {bars}
    </Box>
  );
};
