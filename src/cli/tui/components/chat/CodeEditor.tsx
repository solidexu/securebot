import React from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../../context/index.js';

/** 编辑面板显示行数 */
const EDITOR_LINES = 10;

/** 进度条：生成 █░ 形式 */
function progressBar(current: number, total: number, width: number): string {
  const pct = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
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

  // 滚动窗口：始终让光标在中间区域（偏下1/3位置）
  const cursorTargetRow = mode === 'edit' ? EDITOR_LINES - 3 : Math.floor(EDITOR_LINES / 2) + 1;
  const windowStart = Math.max(0, Math.min(
    currentLine - cursorTargetRow,
    Math.max(0, totalLines - EDITOR_LINES)
  ));
  const visibleLines = displayLines.slice(windowStart, windowStart + EDITOR_LINES);
  // 填充固定高度
  while (visibleLines.length < EDITOR_LINES) {
    visibleLines.push({ text: '', state: 'pending' });
  }

  const lastWrittenIdx = currentLine - 1 - windowStart;
  const cursorIdx = currentLine < totalLines ? lastWrittenIdx + 1 : -1;

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
        {/* diff 统计 */}
        {mode === 'edit' && (
          <>
            {additions > 0 && <Text color="#88ffaa"> +{additions}</Text>}
            {deletions > 0 && <Text color="#ff6666"> -{deletions}</Text>}
          </>
        )}
        {/* 进度条 */}
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

      {/* 内容区 */}
      {visibleLines.map((line, i) => {
        const lineNum = windowStart + i + 1;
        const isWritten = line.state === 'written';
        const isAdded = line.state === 'added';
        const isDeleted = line.state === 'deleted';
        const isChanged = line.state === 'changed';
        const isPending = line.state === 'pending';
        const isCursor = i === cursorIdx;

        // 光标行：高亮背景色，最醒目
        if (isCursor) {
          return (
            <Text key={i}>
              <Text color={borderColor} bold>{String(lineNum).padStart(3)} </Text>
              <Text color={borderColor} bold bgHex="#1a2030">
                {'▸ '}{line.text || ' '}
              </Text>
            </Text>
          );
        }

        // 已写入行（亮蓝）
        if (isWritten) {
          return (
            <Text key={i}>
              <Text color="#333">{String(lineNum).padStart(3)} </Text>
              <Text color="#7ecfff">{line.text || ' '}</Text>
            </Text>
          );
        }

        // 新增行（绿色+）
        if (isAdded) {
          return (
            <Text key={i}>
              <Text color="#333">{String(lineNum).padStart(3)} </Text>
              <Text color="#88ffaa" bold>+ {line.text}</Text>
            </Text>
          );
        }

        // 删除行（红色-）
        if (isDeleted) {
          return (
            <Text key={i}>
              <Text color="#333">{String(lineNum).padStart(3)} </Text>
              <Text color="#ff6666" strikethrough>- {line.text}</Text>
            </Text>
          );
        }

        // 修改行（黄色~）
        if (isChanged) {
          return (
            <Text key={i}>
              <Text color="#333">{String(lineNum).padStart(3)} </Text>
              <Text color="#ffcc00">~ {line.text}</Text>
            </Text>
          );
        }

        // 待写入行（暗灰显示实际代码）
        return (
          <Text key={i}>
            <Text color="#222">{String(lineNum).padStart(3)} </Text>
            <Text color="#444" dimColor>{line.text || ' '}</Text>
          </Text>
        );
      })}
    </Box>
  );
};
