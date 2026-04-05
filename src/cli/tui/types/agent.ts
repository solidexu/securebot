/**
 * Agent 类型定义
 */

export type AgentStatus = 'idle' | 'working' | 'completed';

export interface AgentInfo {
  id: string;
  name: string;
  status: AgentStatus;
  currentTask?: string;
}

export interface TaskStatus {
  id: string;
  task: string;
  status: string;
  delegator: string;
  delegatee: string;
  round: number;
  maxRounds: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  level: 'info' | 'warn' | 'error';
}