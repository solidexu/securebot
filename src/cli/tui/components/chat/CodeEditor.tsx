import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../../context/index.js';

/** 编辑面板显示行数 */
const EDITOR_LINES = 10;

/** 缓冲区行数（上下各缓冲，提前渲染） */
const BUFFER_LINES = 2;

/** 进度条：生成 █░ 形式 */
function progressBar(current: number, total: number, width: number): string {
  const pct = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * 计算滚动窗口的可见范围（虚拟化）
 */
function calculateViewport(
  currentLine: number,
  totalLines: number,
  viewportHeight: number,
  bufferLines: number = BUFFER_LINES
): { start: number; end: number; cursorIdx: number } {
  const cursorTargetRow = Math.floor(viewportHeight / 2) + 1;
  
  const windowStart = Math.max(0, Math.min(
    currentLine - cursorTargetRow,
    Math.max(0, totalLines - viewportHeight)
  ));
  
  const bufferedStart = Math.max(0, windowStart - bufferLines);
  const bufferedEnd = Math.min(totalLines, windowStart + viewportHeight + bufferLines);
  
  const cursorIdx = currentLine < totalLines 
    ? (currentLine - windowStart) 
    : -1;
  
  return {
    start: bufferedStart,
    end: bufferedEnd,
    cursorIdx,
  };
}

/**
 * 渲染单行代码 — 支持逐字符打字效果
 */
function renderCodeLine(
  line: { text: string; state: 'written' | 'changed' | 'added' | 'deleted' | 'pending'; writtenChars?: number; totalChars?: number },
  lineNum: number,
  isCursor: boolean,
  borderColor: string
): React.ReactNode {
  // 光标行：高亮背景色，显示打字进度
  if (isCursor) {
    const written = line.writtenChars ?? 0;
    const total = line.totalChars ?? line.text.length;
    // 已写出的部分
    const writtenText = line.text.slice(0, written);
    // 未写出的部分（暗灰）
    const pendingText = line.text.slice(written);
    
    return (
      <Text key={lineNum}>
        <Text color={borderColor} bold>{String(lineNum).padStart(3)} </Text>
        <Text color={borderColor} bold bgHex="#1a2030">
          {'▸ '}
          {/* 已写入文字 */}
          <Text color="#ffffff" bold>{writtenText}</Text>
          {/* 光标闪烁块 */}
          <Text backgroundColor="#00ffff" color="#000" bold> </Text>
          {/* 待写入文字（暗淡） */}
          <Text color="#446688">{pendingText || ''}</Text>
        </Text>
      </Text>
    );
  }

  // 已写入完整行（亮蓝）
  if (line.state === 'written') {
    const isPartial = (line.writtenChars ?? 0) > 0 && (line.writtenChars ?? 0) < (line.totalChars ?? line.text.length);
    if (isPartial) {
      // 正在写入中的非光标行
      const written = line.writtenChars ?? 0;
      return (
        <Text key={lineNum}>
          <Text color="#333">{String(lineNum).padStart(3)} </Text>
          <Text color="#7ecfff">{line.text.slice(0, written)}</Text>
          <Text color="#446688">{line.text.slice(written) || ' '}</Text>
        </Text>
      );
    }
    return (
      <Text key={lineNum}>
        <Text color="#333">{String(lineNum).padStart(3)} </Text>
        <Text color="#7ecfff">{line.text || ' '}</Text>
      </Text>
    );
  }

  // 新增行（绿色+）
  if (line.state === 'added') {
    return (
      <Text key={lineNum}>
        <Text color="#333">{String(lineNum).padStart(3)} </Text>
        <Text color="#88ffaa" bold>+ {line.text}</Text>
      </Text>
    );
  }

  // 删除行（红色-）
  if (line.state === 'deleted') {
    return (
      <Text key={lineNum}>
        <Text color="#333">{String(lineNum).padStart(3)} </Text>
        <Text color="#ff6666" strikethrough>- {line.text}</Text>
      </Text>
    );
  }

  // 修改行（黄色~）
  if (line.state === 'changed') {
    return (
      <Text key={lineNum}>
        <Text color="#333">{String(lineNum).padStart(3)} </Text>
        <Text color="#ffcc00">~ {line.text}</Text>
      </Text>
    );
  }

  // 待写入行（暗灰）
  return (
    <Text key={lineNum}>
      <Text color="#222">{String(lineNum).padStart(3)} </Text>
      <Text color="#444" dimColor>{line.text || ' '}</Text>
    </Text>
  );
}

export const CodeEditorPanel: React.FC = () => {
  const { codeEditor } = useApp();

  if (!codeEditor) return null;

  const {
    mode, filePath, displayLines, currentLine,
    totalLines, isComplete, additions, deletions,
  } = codeEditor;

  const shortName = filePath.split('/').pop() || filePath;
  const pct = Math.min(100, Math.round((currentLine / totalLines) * 100));

  // 使用 useMemo 优化视口计算
  const viewport = useMemo(() => {
    return calculateViewport(currentLine, totalLines, EDITOR_LINES, BUFFER_LINES);
  }, [currentLine, totalLines]);

  // 虚拟化渲染：只渲染可见区域 + 缓冲区
  const visibleLines = useMemo(() => {
    const lines = displayLines.slice(viewport.start, viewport.end);
    while (lines.length < EDITOR_LINES) {
      lines.push({ text: '', state: 'pending' as const });
    }
    return lines;
  }, [displayLines, viewport.start, viewport.end]);

  // 状态标签
  const borderStyle = mode === 'edit' ? 'double' : 'single';
  const borderColor = mode === 'edit' ? '#ffaa00' : '#00ffff';
  const icon = mode === 'edit' ? '\u270E' : '\u270F';
  const modeLabel = isComplete ? 'done' : (mode === 'edit' ? 'modifying' : 'writing');

  return (
    <Box
      flexDirection="column"
      borderTop={borderStyle}
      borderColor={borderColor}
      height={EDITOR_LINES + 2}
      backgroundColor="#0d1117"
    >
      {/* 标题栏：文件名 + 进度条 + 统计 */}
      <Box flexShrink={0}>
        <Text bold color={borderColor}>
          {' '}{icon} {shortName}
        </Text>
        {mode === 'edit' && (
          <>
            {additions > 0 && <Text color="#88ffaa"> +{additions}</Text>}
            {deletions > 0 && <Text color="#ff6666"> -{deletions}</Text>}
          </>
        )}
        <Text color={isComplete ? 'green' : borderColor}>
          {' '}[{progressBar(currentLine, totalLines, 12)}]{' '}
        </Text>
        <Text color={isComplete ? 'green' : '#888'} dimColor={!isComplete}>
          {pct}%
        </Text>
        {isComplete ? (
          <Text color="green"> ✓</Text>
        ) : (
          <Text color="#555" dimColor> ({modeLabel})</Text>
        )}
      </Box>

      {/* 内容区 - 虚拟化渲染 + 打字机效果 */}
      {visibleLines.map((line, i) => {
        const lineNum = viewport.start + i + 1;
        const isCursor = i === viewport.cursorIdx;
        return renderCodeLine(line, lineNum, isCursor, borderColor);
      })}
    </Box>
  );
};
