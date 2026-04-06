import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../../context/index.js';
import { theme } from '../../styles/theme.js';
import { ScrollBar } from '../common/ScrollBar.js';

const MAX_VISIBLE_AGENTS = 4;
const MAX_AGENT_ID_WIDTH = 10;

export const AgentList: React.FC = () => {
  const { agents, currentAgent, focusPanel, focusBlink, agentScrollOffset } = useApp();
  const [blinkOn, setBlinkOn] = useState(false);
  const isFocused = focusPanel === 'agent';

  // 闪烁效果
  useEffect(() => {
    if (focusBlink && isFocused) {
      let count = 0;
      const interval = setInterval(() => {
        setBlinkOn(prev => !prev);
        count++;
        if (count >= 6) {
          setBlinkOn(false);
          clearInterval(interval);
        }
      }, 50);
      return () => clearInterval(interval);
    }
  }, [focusBlink, isFocused]);

  const borderColor = isFocused ? (blinkOn ? 'white' : 'green') : theme.panel.agent.border;
  const titleIndicator = isFocused ? (blinkOn ? ' \u2605 ' : ' \u25cf ') : ' \u25cf ';

  if (agents.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color="gray" dimColor>
          No agents available
        </Text>
      </Box>
    );
  }

  // 根据滚动偏移计算可见范围
  // offset=0 显示最新 agents[offset..offset+MAX_VISIBLE_AGENTS-1]
  // offset=maxOffset 显示最旧 agents[maxOffset..maxOffset+MAX_VISIBLE_AGENTS-1]
  const maxScroll = Math.max(0, agents.length - MAX_VISIBLE_AGENTS);
  const startIdx = Math.min(agentScrollOffset, maxScroll);
  const visibleAgents = agents.slice(startIdx, startIdx + MAX_VISIBLE_AGENTS);

  // 截断过长的 agent id
  const truncateId = (id: string) =>
    id.length > MAX_AGENT_ID_WIDTH ? id.slice(0, MAX_AGENT_ID_WIDTH) : id;

  return (
    <Box flexDirection="row">
      {/* Agent 列表 */}
      <Box flexDirection="column" paddingX={1} flexGrow={1} flexShrink={1}>
        {visibleAgents.map((agent) => {
          const config = theme.agent[agent.status];
          const isCurrent = agent.id === currentAgent;

          return (
            <Box key={agent.id} flexDirection="row" marginBottom={isCurrent ? 1 : 0}>
              {/* 状态指示器 */}
              <Text color={config.color as any}>
                {config.icon}{' '}
              </Text>

              {/* Agent ID（固定宽度） */}
              <Text bold={isCurrent} color={isCurrent ? 'white' : (config.color as any)}>
                {truncateId(agent.id)}
              </Text>

              {/* 当前标记 */}
              {isCurrent && (
                <Text color="yellow">{' *current'}</Text>
              )}

              {/* 工作状态下的任务信息 */}
              {agent.status === 'working' && agent.currentTask && (
                <Text color="gray" dimColor marginLeft={1}>
                  {'\u2502'} {agent.currentTask.slice(0, 22)}
                  {agent.currentTask.length > 22 && '...'}
                </Text>
              )}
            </Box>
          );
        })}

        {/* 滚动提示 */}
        {agentScrollOffset > 0 && startIdx > 0 && (
          <Text color="yellow" dimColor> ... ({startIdx} older)</Text>
        )}
        {agentScrollOffset === 0 && agents.length > MAX_VISIBLE_AGENTS && (
          <Text color="gray" dimColor>
            {' '}{agents.length} agents
          </Text>
        )}
      </Box>

      {/* 右侧滚动条指示器（仅当超过可见数量时显示） */}
      {agents.length > MAX_VISIBLE_AGENTS && (
        <ScrollBar
          total={agents.length}
          visible={MAX_VISIBLE_AGENTS}
          offset={agentScrollOffset}
          color={isFocused ? 'green' : 'cyan'}
          height={MAX_VISIBLE_AGENTS + 1} // agent行 + 1行提示信息
        />
      )}
    </Box>
  );
};
