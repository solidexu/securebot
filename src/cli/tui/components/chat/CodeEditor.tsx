import React from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../../context/index.js';

/** 编辑面板显示行数 */
const EDITOR_LINES = 10;

export const CodeEditorPanel: React.FC = () => {
  const { codeEditor } = useApp();

  if (!codeEditor) return null;

  const {
    mode, filePath, displayLines, currentLine,
    totalLines, isComplete, additions, deletions,
  } = codeEditor;

  const shortName = filePath.split('/').pop() || filePath;

  // 计算可见行范围（滚动跟随当前写入位置）
  const windowStart = Math.max(0, Math.min(
    currentLine - Math.floor(EDITOR_LINES / 2),
    Math.max(0, totalLines - EDITOR_LINES)
  ));
  const visibleLines = displayLines.slice(windowStart, windowStart + EDITOR_LINES);
  // 填充固定高度
  while (visibleLines.length < EDITOR_LINES) {
    visibleLines.push({ text: '', state: 'pending' });
  }

  const lastWrittenIdx = currentLine - 1 - windowStart;

  // 状态标签
  const borderStyle = mode === 'edit' ? 'double' : 'single';
  const borderColor = mode === 'edit' ? '#ffaa00' : '#00ffff';
  const icon = mode === 'edit' ? '\u270E' : '\u270F';  // ✎ vs ✏
  const modeLabel = mode === 'edit' ? 'modifying' : 'writing';

  return (
    <Box
      flexDirection="column"
      borderTop={borderStyle}
      borderColor={borderColor}
      height={EDITOR_LINES + 2}
      backgroundColor="#0d1117"
    >
      {/* 标题栏：文件名 + diff 统计 + 状态 */}
      <Box flexShrink={0}>
        <Text bold color={borderColor}>
          {` ${icon} ${shortName}`}
        </Text>
        {mode === 'edit' && additions > 0 && (
          <Text color="green"> +{additions}</Text>
        )}
        {mode === 'edit' && deletions > 0 && (
          <Text color="red"> -{deletions}</Text>
        )}
        <Text color="#555" dimColor>
          {' '}({modeLabel})
        </Text>
        <Text color="#333" dimColor>
          {' ── '}{mode === 'edit' ? 'editing file' : 'writing file'}
        </Text>
        {isComplete && (
          <Text color="green"> ✓</Text>
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
        const isCurrentLine = i === lastWrittenIdx + 1 && currentLine < totalLines;

        return (
          <Text key={i}>
            <Text color="#333">{String(lineNum).padStart(3)} </Text>

            {isAdded ? (
              <Text color="#88ffaa" bold>+ {line.text}</Text>
            ) : isDeleted ? (
              <Text color="#ff6666" strikethrough>- {line.text}</Text>
            ) : isChanged ? (
              <Text color="#ffcc00">~ {line.text}</Text>
            ) : isWritten ? (
              <Text color="#7ecfff" bold>{line.text}</Text>
            ) : isCurrentLine ? (
              <Text color={borderColor} bold>▸ {line.text}</Text>
            ) : isPending ? (
              <Text color="#333">{line.text || ' '}</Text>
            ) : (
              <Text color="#a8d1ff">{line.text}</Text>
            )}
          </Text>
        );
      })}
    </Box>
  );
};
