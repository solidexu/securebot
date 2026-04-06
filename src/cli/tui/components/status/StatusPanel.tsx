import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { TaskStatusPanel } from './TaskStatus.js';
import { AgentList } from './AgentList.js';
import { SkillViewer } from './SkillViewer.js';
import { theme } from '../../styles/theme.js';
import { useApp } from '../../context/index.js';

export const StatusPanel: React.FC = () => {
  const panelStyle = theme.borders.normal;
  const { focusPanel, focusBlink } = useApp();
  const [agentBlinkOn, setAgentBlinkOn] = useState(false);
  const [skillBlinkOn, setSkillBlinkOn] = useState(false);
  const isAgentFocused = focusPanel === 'agent';
  const isSkillFocused = focusPanel === 'skill';

  // Agent 闪烁效果
  useEffect(() => {
    if (focusBlink && isAgentFocused) {
      let count = 0;
      const interval = setInterval(() => {
        setAgentBlinkOn(prev => !prev);
        count++;
        if (count >= 6) {
          setAgentBlinkOn(false);
          clearInterval(interval);
        }
      }, 50);
      return () => clearInterval(interval);
    }
  }, [focusBlink, isAgentFocused]);

  // Skill 闪烁效果
  useEffect(() => {
    if (focusBlink && isSkillFocused) {
      let count = 0;
      const interval = setInterval(() => {
        setSkillBlinkOn(prev => !prev);
        count++;
        if (count >= 6) {
          setSkillBlinkOn(false);
          clearInterval(interval);
        }
      }, 50);
      return () => clearInterval(interval);
    }
  }, [focusBlink, isSkillFocused]);

  const agentBorderColor = isAgentFocused ? (agentBlinkOn ? 'white' : 'green') : theme.panel.agent.border;
  const skillBorderColor = isSkillFocused ? (skillBlinkOn ? 'white' : 'green') : theme.panel.log.border;
  const agentTitleIndicator = isAgentFocused ? (agentBlinkOn ? ' \u2605 ' : ' \u25cf ') : ' \u25cf ';
  const skillTitleIndicator = isSkillFocused ? (skillBlinkOn ? ' \u2605 ' : ' \u25cf ') : ' \u25cf ';

  return (
    <Box
      flexDirection="column"
      width={theme.layout.statusWidth}
      height="100%"
      paddingX={0}
    >
      {/* 任务状态面板 */}
      <Box
        height={theme.layout.taskHeight}
        borderStyle={panelStyle}
        borderColor={theme.panel.task.border}
        flexDirection="column"
        marginBottom={0}
        paddingX={1}
      >
        <Box borderBottom borderColor={theme.panel.task.border} paddingY={0} marginBottom={0}>
          <Text bold color={theme.panel.task.title}>
            {' \u25cf '} Task Status
          </Text>
        </Box>
        <TaskStatusPanel />
      </Box>

      {/* Agent 列表面板 */}
      <Box
        height={theme.layout.agentHeight}
        borderStyle={isAgentFocused && agentBlinkOn ? theme.borders.focus : panelStyle}
        borderColor={agentBorderColor}
        flexDirection="column"
        marginTop={0}
        paddingX={1}
      >
        <Box borderBottom borderColor={agentBorderColor} paddingY={0} marginBottom={1}>
          <Text bold color={isAgentFocused ? 'green' : theme.panel.agent.title}>
            {agentTitleIndicator} Agents
          </Text>
        </Box>
        <AgentList />
      </Box>

      {/* 技能列表面板 */}
      <Box
        height={theme.layout.logHeight}
        borderStyle={isSkillFocused && skillBlinkOn ? theme.borders.focus : panelStyle}
        borderColor={skillBorderColor}
        flexDirection="column"
        marginTop={0}
        paddingX={1}
      >
        <Box borderBottom borderColor={skillBorderColor} paddingY={0} marginBottom={1}>
          <Text bold color={isSkillFocused ? 'green' : theme.panel.log.title}>
            {skillTitleIndicator} Skills
          </Text>
        </Box>
        <SkillViewer />
      </Box>
    </Box>
  );
};