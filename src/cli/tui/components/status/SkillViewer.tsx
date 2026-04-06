import React from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../../context/index.js';
import { ScrollBar } from '../common/ScrollBar.js';

const MAX_VISIBLE_SKILLS = 6;

export const SkillViewer: React.FC = () => {
  const { skills, skillScrollOffset, focusPanel } = useApp();
  const isFocused = focusPanel === 'skill';

  if (skills.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color="gray" dimColor>
          Loading skills...
        </Text>
      </Box>
    );
  }

  // 滚动切片：从末尾往前数，根据 offset 调整
  const total = skills.length;
  const endIdx = total - skillScrollOffset;
  const startIdx = Math.max(0, endIdx - MAX_VISIBLE_SKILLS);
  const visibleSkills = skills.slice(startIdx, endIdx);

  return (
    <Box flexDirection="row">
      {/* 技能列表 */}
      <Box flexDirection="column" paddingX={1} flexGrow={1} flexShrink={1}>
        {visibleSkills.map((skill) => {
          const isActive = skill.active;

          return (
            <Box key={skill.id} flexDirection="row" marginBottom={0}>
              {/* 激活标记 */}
              <Text color={isActive ? 'green' : 'gray'}>
                {isActive ? '\u25cf' : '\u25cb'}{' '}
              </Text>

              {/* 技能名称 */}
              <Text bold={isActive} color={isActive ? 'green' : 'white'}>
                {skill.name}
              </Text>

              {/* 当前激活标签 */}
              {isActive && (
                <Text color="magenta">{' [active]'}</Text>
              )}
            </Box>
          );
        })}

        {/* 滚动指示器 */}
        {skillScrollOffset > 0 && startIdx > 0 && (
          <Text color="yellow" dimColor> ... ({startIdx} older)</Text>
        )}
        {skillScrollOffset === 0 && total > MAX_VISIBLE_SKILLS && (
          <Text color="gray" dimColor>
            {' '}{total} skills
          </Text>
        )}
      </Box>

      {/* 右侧滚动条指示器 */}
      <ScrollBar
        total={total}
        visible={MAX_VISIBLE_SKILLS}
        offset={skillScrollOffset}
        color={isFocused ? 'green' : 'blue'}
        height={MAX_VISIBLE_SKILLS + 1} // skill行 + 1行提示信息
      />
    </Box>
  );
};
