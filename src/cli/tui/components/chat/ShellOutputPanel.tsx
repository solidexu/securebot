import React, { useMemo } from 'react';
import { Box, Text } from 'ink';

/** Shell 输出面板显示行数 */
const SHELL_PANEL_HEIGHT = 12;

/** 最大输出行数（超出则滚动） */
const MAX_OUTPUT_LINES = 100;

/**
 * Shell 输出面板 Props
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

/**
 * 解析 ANSI 颜色代码（简化版）
 * 只处理基本颜色，完整实现需要 ansi-regex 等库
 */
function stripAnsiColors(text: string): string {
  // 移除常见的 ANSI 转义序列
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * 渲染单行输出
 */
function renderOutputLine(
  output: { type: 'stdout' | 'stderr'; text: string; timestamp: number },
  index: number
): React.ReactNode {
  const text = stripAnsiColors(output.text);
  const timestamp = new Date(output.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (output.type === 'stderr') {
    return (
      <Text key={index} color="#ff6666" dimColor>
        {text}
      </Text>
    );
  }

  return (
    <Text key={index} color="#dddddd">
      {text}
    </Text>
  );
}

/**
 * Shell 输出面板组件
 * 实时显示 exec 命令的 stdout/stderr 输出
 */
export const ShellOutputPanel: React.FC<ShellOutputPanelProps> = ({
  command,
  outputs,
  isRunning,
  exitCode,
  cwd,
}) => {
  // 使用 useMemo 优化输出处理
  const displayOutputs = useMemo(() => {
    // 限制最大行数，超出则截取最新部分
    const limitedOutputs = outputs.length > MAX_OUTPUT_LINES
      ? outputs.slice(-MAX_OUTPUT_LINES)
      : outputs;
    return limitedOutputs;
  }, [outputs]);

  // 截断显示的命令（避免过长）
  const shortCommand = command.length > 60 ? command.substring(0, 57) + '...' : command;
  const shortCwd = cwd ? (cwd.length > 30 ? '...' + cwd.substring(cwd.length - 27) : cwd) : '';

  return (
    <Box
      flexDirection="column"
      borderTop="double"
      borderColor={isRunning ? '#00ffff' : (exitCode === 0 ? 'green' : 'red')}
      height={SHELL_PANEL_HEIGHT + 2}
      backgroundColor="#0d1117"
    >
      {/* 标题栏：命令 + 状态 */}
      <Box flexShrink={0}>
        <Text bold color={isRunning ? '#00ffff' : (exitCode === 0 ? 'green' : 'red')}>
          {' $ '}{shortCommand}
        </Text>
        {shortCwd && (
          <Text color="#888" dimColor>
            {' '}({shortCwd})
          </Text>
        )}
        {/* 状态指示器 */}
        {isRunning ? (
          <Text color="#00ffff" bold> {'[running]'}</Text>
        ) : (
          <Text color={exitCode === 0 ? 'green' : 'red'}>
            {' '}[exit: {exitCode}]
          </Text>
        )}
      </Box>

      {/* 输出区域 */}
      <Box flexDirection="column" flexGrow={1}>
        {displayOutputs.length === 0 ? (
          <Text color="#555" dimColor>
            {isRunning ? 'Waiting for output...' : 'No output'}
          </Text>
        ) : (
          displayOutputs.map((output, index) => renderOutputLine(output, index))
        )}
      </Box>

      {/* 底部信息栏 */}
      {displayOutputs.length > 0 && (
        <Box flexShrink={0}>
          <Text color="#666" dimColor>
            {' '}lines: {displayOutputs.length}
            {outputs.length > MAX_OUTPUT_LINES && (
              <Text color="#888"> (truncated)</Text>
            )}
          </Text>
        </Box>
      )}
    </Box>
  );
};