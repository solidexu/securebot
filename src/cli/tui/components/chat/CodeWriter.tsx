import React from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../../context/index.js';

const CODE_WINDOW_LINES = 5; // 显示5行代码窗口

export const CodeWriterPanel: React.FC = () => {
  const { codeWriter } = useApp();

  if (!codeWriter) return null;

  const { filePath, lines, currentLine, totalLines } = codeWriter;
  const shortName = filePath.split('/').pop() || filePath;

  // 计算可见行范围（显示最后写入的5行）
  // 当 currentLine < 5 时从头开始，否则滚动到最新位置
  const windowStart = Math.max(0, Math.min(currentLine - CODE_WINDOW_LINES, totalLines - CODE_WINDOW_LINES));
  const visibleLines = lines.slice(windowStart, windowStart + CODE_WINDOW_LINES);
  const lastWrittenIdx = currentLine - 1 - windowStart; // 窗口内最后一行已写入的索引

  return (
    <Box
      flexDirection="column"
      borderTop="single"
      borderColor="#00ffff"
      height={CODE_WINDOW_LINES + 2} // 标题 + 代码行
      backgroundColor="#0d1117"
    >
      {/* 标题栏 */}
      <Box flexShrink={0}>
        <Text bold color="#00ffff">
          {'\u270E '}{shortName}
        </Text>
        <Text color="#888" dimColor>
          {' '}{currentLine}/{totalLines}
        </Text>
        {currentLine >= totalLines && (
          <Text color="green"> ✓</Text>
        )}
      </Box>

      {/* 代码内容区 */}
      {visibleLines.map((line, i) => {
        const lineNum = windowStart + i + 1;
        const isWritten = i <= lastWrittenIdx;
        const isCurrentLine = i === lastWrittenIdx + 1 && currentLine < totalLines;
        return (
          <Text key={i}>
            <Text color="#555">{String(lineNum).padStart(2)} </Text>
            {isWritten ? (
              <Text color="#a8d1ff">{line || ' '}</Text>
            ) : isCurrentLine ? (
              <Text color="#00ffff" bold>▸{' '}</Text>
            ) : (
              <Text color="#333">{'~'}</Text>
            )}
          </Text>
        );
      })}
    </Box>
  );
};
