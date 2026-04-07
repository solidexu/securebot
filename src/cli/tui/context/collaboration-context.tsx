/**
 * 协作状态 Context
 * 
 * 管理 Agent、技能、任务状态等协作相关状态
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { AgentInfo, TaskStatus, SkillInfo } from '../types/index.js';

// ============ 类型定义 ============

interface CollaborationState {
  agents: AgentInfo[];
  currentAgent: string;
  taskStatus: TaskStatus | null;
  skills: SkillInfo[];
}

interface CollaborationContextValue extends CollaborationState {
  // Agent 管理
  setAgents: (agents: AgentInfo[]) => void;
  setCurrentAgent: (id: string) => void;
  updateAgentStatus: (id: string, status: AgentInfo['status'], task?: string) => void;

  // 任务状态
  setTaskStatus: (status: TaskStatus | null) => void;

  // 技能管理
  setSkills: (skills: SkillInfo[]) => void;

  // 重置
  resetCollaborationState: () => void;
}

// ============ 默认状态 ============

const defaultState: CollaborationState = {
  agents: [],
  currentAgent: 'dev',
  taskStatus: null,
  skills: [],
};

// ============ Context 创建 ============

const CollaborationContext = createContext<CollaborationContextValue | null>(null);

// ============ Provider 组件 ============

export const CollaborationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [currentAgent, setCurrentAgent] = useState('dev');
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
  const [skills, setSkillsState] = useState<SkillInfo[]>([]);

  const updateAgentStatus = useCallback(
    (id: string, status: AgentInfo['status'], task?: string) => {
      setAgents((prev) =>
        prev.map((agent) =>
          agent.id === id ? { ...agent, status, currentTask: task } : agent
        )
      );
    },
    []
  );

  const setSkills = useCallback((newSkills: SkillInfo[]) => {
    setSkillsState(newSkills);
  }, []);

  const resetCollaborationState = useCallback(() => {
    setAgents([]);
    setCurrentAgent('dev');
    setTaskStatus(null);
    setSkillsState([]);
  }, []);

  const value: CollaborationContextValue = {
    agents,
    currentAgent,
    taskStatus,
    skills,
    setAgents,
    setCurrentAgent,
    updateAgentStatus,
    setTaskStatus,
    setSkills,
    resetCollaborationState,
  };

  return (
    <CollaborationContext.Provider value={value}>
      {children}
    </CollaborationContext.Provider>
  );
};

// ============ Hook 导出 ============

export const useCollaboration = (): CollaborationContextValue => {
  const context = useContext(CollaborationContext);
  if (!context) {
    throw new Error('useCollaboration must be used within a CollaborationProvider');
  }
  return context;
};

export const useAgents = () => {
  const { agents, currentAgent, setAgents, setCurrentAgent, updateAgentStatus } =
    useCollaboration();
  return { agents, currentAgent, setAgents, setCurrentAgent, updateAgentStatus };
};

export const useTaskStatus = () => {
  const { taskStatus, setTaskStatus } = useCollaboration();
  return { taskStatus, setTaskStatus };
};

export const useSkills = () => {
  const { skills, setSkills } = useCollaboration();
  return { skills, setSkills };
};