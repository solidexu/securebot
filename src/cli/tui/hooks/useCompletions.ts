/**
 * 命令补全 Hook
 */
import { useState, useCallback, useMemo } from 'react';

interface UseCompletionsOptions {
  commands?: string[];
  agents?: string[];
  skills?: { id: string; name: string }[];
}

export function useCompletions(options: UseCompletionsOptions = {}) {
  const { commands = [], agents = [], skills = [] } = options;
  const [completions, setCompletions] = useState<string[]>([]);
  const [completionIndex, setCompletionIndex] = useState(0);

  // 所有可补全项
  const allCompletions = useMemo(() => {
    const items: string[] = [];
    
    // 命令补全
    items.push(...commands.map((c) => (c.startsWith('/') ? c : `/${c}`)));
    
    // Agent 补全
    items.push(...agents.map((a) => `@${a}`));
    
    // 技能补全
    items.push(...skills.map((s) => `/${s.id}`));
    
    return items;
  }, [commands, agents, skills]);

  // 获取补全建议
  const getCompletions = useCallback(
    (input: string): string[] => {
      if (!input) {
        setCompletions([]);
        return [];
      }

      const matches = allCompletions.filter((item) =>
        item.toLowerCase().startsWith(input.toLowerCase())
      );

      setCompletions(matches);
      setCompletionIndex(0);
      return matches;
    },
    [allCompletions]
  );

  // 选择下一个补全
  const nextCompletion = useCallback((): string | null => {
    if (completions.length === 0) return null;

    const nextIndex = (completionIndex + 1) % completions.length;
    setCompletionIndex(nextIndex);
    return completions[nextIndex] || null;
  }, [completions, completionIndex]);

  // 选择上一个补全
  const prevCompletion = useCallback((): string | null => {
    if (completions.length === 0) return null;

    const prevIndex = (completionIndex - 1 + completions.length) % completions.length;
    setCompletionIndex(prevIndex);
    return completions[prevIndex] || null;
  }, [completions, completionIndex]);

  // 当前选中补全
  const currentCompletion = completions[completionIndex] || null;

  // 清除补全
  const clearCompletions = useCallback(() => {
    setCompletions([]);
    setCompletionIndex(0);
  }, []);

  return {
    completions,
    completionIndex,
    currentCompletion,
    getCompletions,
    nextCompletion,
    prevCompletion,
    clearCompletions,
  };
}