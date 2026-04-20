import React, { useMemo } from 'react';
import { Box, Text } from 'ink';

/** 单行输出最大字符宽度（超出截断） */
const OUTPUT_MAX_WIDTH = 100;

/**
 * Shell 输出面板 — 沙箱风格
 * 模拟终端窗口效果，带有命令行提示符和彩色输出
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
  cwd,
}) => {
  // 取最后几行输出显示
  const recentOutputs = useMemo(() => {
    if (outputs.length === 0) return [];
    
    const allLines: Array<{ text: string; type: 'stdout' | 'stderr' }> = [];
    outputs.forEach(output => {
      const raw = stripAnsi(output.text);
      const lines = raw.split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          allLines.push({ text: line, type: output.type });
        }
      });
    });
    
    // 最多显示最近 5 行
    return allLines.slice(-5);
  }, [outputs]);

  const shortCmd = command.length > 60 ? command.slice(0, 57) + '...' : command;

  // 状态颜色和图标
  const { statusColor, statusIcon, statusLabel } = useMemo(() => {
    if (isRunning) {
      return { statusColor: '#00ffff', statusIcon: '\u25b6', statusLabel: 'running' };
    }
    if (exitCode === 0) {
      return { statusColor: '#88ffaa', statusIcon: '\u2713', statusLabel: 'success' };
    }
    return { statusColor: '#ff6666', statusIcon: '\u2717', statusLabel: `exit ${exitCode ?? '-'}` };
  }, [isRunning, exitCode]);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="#374151"
      paddingLeft={1} paddingRight={1}
      backgroundColor="#0d1117"
      marginTop={1}
    >
      {/* 标题栏：沙箱标识 + 状态 */}
      <Box justifyContent="space-between" paddingBottom={0}>
        <Box>
          <Text bold color="#f59e0b">
            {'\u{1f9ed} '}Sandbox Terminal
          </Text>
          <Text color="#6b7280" dimColor>
            {' '}—{' '}{cwd?.split('/').pop() || 'workspace'}
          </Text>
        </Box>
        <Box>
          <Text color={statusColor} bold>
            {statusIcon} {statusLabel}
          </Text>
        </Box>
      </Box>

      {/* 分隔线 */}
      <Text color="#374151" dimColor>
        {'─'.repeat(60)}
      </Text>

      {/* 命令行 */}
      <Box>
        <Text color="#8b5cf6" bold>
          {'user@securebot'}
        </Text>
        <Text color="#6b7280">
          {' '}{'in'}{' '}
        </Text>
        <Text color="#10b981" bold>
          {cwd?.split('/').pop() || '~'}
        </Text>
        <Text color="#6b7280">
          {' '}{'$'}{' '}
        </Text>
        <Text color="#e5e7eb">
          {shortCmd}
        </Text>
      </Box>

      {/* 输出内容 */}
      {recentOutputs.length > 0 ? (
        recentOutputs.map((output, idx) => (
          <Text 
            key={idx} 
            color={output.type === 'stderr' ? '#ef4444' : '#9ca3af'}
            dimColor={!isRunning}
          >
            {'  '}{output.text.length > OUTPUT_MAX_WIDTH 
              ? output.text.slice(0, OUTPUT_MAX_WIDTH - 3) + '...' 
              : output.text}
          </Text>
        ))
      ) : (
        !isRunning && (
          <Text color="#6b7280" dimColor>
            {'  '}(no output)
          </Text>
        )
      )}

      {/* 运行状态指示器 */}
      {isRunning && (
        <Text color="#00ffff">
          {'  '}\u25b6 running...
        </Text>
      )}
    </Box>
  );
};
