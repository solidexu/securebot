import React, { useMemo } from 'react';
import { Box, Text } from 'ink';

/** 单行输出最大字符宽度（超出截断） */
const OUTPUT_MAX_WIDTH = 80;

/**
 * Shell 输出面板 — 紧凑内联模式
 * 只占 1-2 行，紧跟在 exec 命令下方显示
 */
export interface ShellOutputPanelProps {
  /** 执行的命令 */
  command: string;
  /** 输出内容 */
  outputs: Array<{
    type: 'stdout' | 'stderr';
    text: string;
    timestamp: number;
  }>;
  /** 是否正在运行 */
  isRunning: boolean;
  /** 退出码（null 表示运行中） */
  exitCode: number | null;
  /** 当前工作目录 */
  cwd?: string;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

export const ShellOutputPanel: React.FC<ShellOutputPanelProps> = ({
  command,
  outputs,
  isRunning,
  exitCode,
}) => {
  // 取最新一行输出显示
  const lastLine = useMemo(() => {
    if (outputs.length === 0) return '';
    const raw = stripAnsi(outputs[outputs.length - 1]!.text);
    // 去掉换行，限制长度
    const trimmed = raw.replace(/\n/g, ' ').trim();
    return trimmed.length > OUTPUT_MAX_WIDTH 
      ? trimmed.slice(0, OUTPUT_MAX_WIDTH - 3) + '...' 
      : trimmed;
  }, [outputs]);

  const shortCmd = command.length > 50 ? command.slice(0, 47) + '...' : command;

  const statusColor = isRunning ? '#00ffff' : exitCode === 0 ? '#88ffaa' : '#ff6666';
  const statusLabel = isRunning ? '▶ running' : `exit ${exitCode ?? '-'}`;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={statusColor}
      paddingLeft={1} paddingRight={1}
      backgroundColor="#0d1117"
    >
      {/* 第1行：$ 命令 + 状态 */}
      <Box>
        <Text bold color={statusColor}>
          {'$ '}{shortCmd}
        </Text>
        <Text color="#666" dimColor>
          {'  '}<Text color={statusColor}>●</Text>{' '}{statusLabel}
        </Text>
      </Box>

      {/* 第2行：最新输出（仅当有输出时显示） */}
      {(lastLine || !isRunning) && (
        <Text color={isRunning ? '#cccccc' : '#888888'} dimColor={!isRunning}>
          {'  '}{isRunning ? lastLine : (lastLine || '(no output)')}
        </Text>
      )}
    </Box>
  );
};
