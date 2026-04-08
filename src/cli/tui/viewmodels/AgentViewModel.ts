/**
 * Agent ViewModel
 * 
 * 封装 Agent 面板的业务逻辑
 */

import { useCallback, useMemo } from 'react';
import { 
  useAgentList, 
  useCurrentAgent,
  useTaskState,
} from '../cli/tui/selectors/index.js';
import { emitEvent, EventType } from '../core/event-bus.js';

// ============ 类型定义 ============

export interface AgentInfo {
  id: string;
  name: string;
  status: 'idle' | 'working' | 'error';
  currentTask?: string;
}

export interface AgentViewModel {
  // 状态
  agents: AgentInfo[];
  currentAgent: string;
  taskStatus: {
    phase: string;
    progress?: number;
    message?: string;
  } | null;
  
  // 操作
  selectAgent: (agentId: string) => void;
  refreshAgents: () => void;
}

// ============ ViewModel Hook ============

/**
 * Agent 面板 ViewModel
 */
export function useAgentViewModel(): AgentViewModel {
  const agents = useAgentList();
  const { currentAgent, setCurrentAgent } = useCurrentAgent();
  const { taskStatus } = useTaskState();

  // 选择 Agent
  const selectAgent = useCallback((agentId: string) => {
    setCurrentAgent(agentId);
    
    // 发射事件
    emitEvent(EventType.AGENT_SWITCH, {
      agentId,
      timestamp: Date.now(),
    });
  }, [setCurrentAgent]);

  // 刷新 Agent 列表
  const refreshAgents = useCallback(() => {
    // 触发 Agent 状态刷新
    emitEvent(EventType.SYSTEM_LOG, {
      message: 'Refreshing agents...',
      level: 'info',
    });
  }, []);

  // 转换 Agent 格式
  const formattedAgents = useMemo(() => {
    return agents.map(agent => ({
      id: agent.id,
      name: agent.name || agent.id,
      status: agent.status || 'idle',
      currentTask: agent.currentTask,
    }));
  }, [agents]);

  return useMemo(() => ({
    agents: formattedAgents,
    currentAgent,
    taskStatus,
    selectAgent,
    refreshAgents,
  }), [formattedAgents, currentAgent, taskStatus, selectAgent, refreshAgents]);
}