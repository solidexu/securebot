/**
 * 心跳类型定义
 */

/**
 * 心跳配置
 */
export interface HeartbeatConfig {
  /** 心跳间隔（毫秒），默认 30000 */
  interval: number;
  /** 超时阈值（毫秒），默认 60000 */
  timeout: number;
  /** 检查间隔（毫秒），默认 10000 */
  checkInterval: number;
  /** 最大丢失次数，默认 3 */
  maxMissed: number;
}

/**
 * 默认心跳配置
 */
export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  interval: 30000,      // 30s
  timeout: 60000,       // 60s
  checkInterval: 10000, // 10s
  maxMissed: 3,
};

/**
 * Agent 心跳消息
 */
export interface AgentHeartbeat {
  /** Agent ID */
  agentId: string;
  /** 状态 */
  status: AgentHeartbeatStatus;
  /** 当前任务 ID */
  currentTask?: string;
  /** 指标 */
  metrics?: AgentMetrics;
  /** 时间戳 */
  timestamp: number;
}

/**
 * Agent 心跳状态
 */
export type AgentHeartbeatStatus = 'idle' | 'working' | 'error';

/**
 * Agent 指标
 */
export interface AgentMetrics {
  /** CPU 使用率 */
  cpuUsage?: number;
  /** 内存使用（MB） */
  memoryUsage?: number;
  /** 队列长度 */
  queueLength?: number;
  /** 自定义指标 */
  [key: string]: number | undefined;
}

/**
 * Agent 状态
 */
export interface AgentState {
  /** Agent ID */
  agentId: string;
  /** 状态 */
  status: AgentStatus;
  /** 最后心跳时间 */
  lastSeenAt: number;
  /** 丢失心跳次数 */
  missedHeartbeats: number;
  /** 当前任务 ID */
  currentTask?: string;
  /** 指标 */
  metrics?: AgentMetrics;
}

/**
 * Agent 状态
 */
export type AgentStatus = 'online' | 'offline' | 'busy' | 'error';

/**
 * 心跳事件
 */
export type HeartbeatEvent =
  | { type: 'heartbeat_received'; agentId: string; status: AgentStatus }
  | { type: 'heartbeat_missed'; agentId: string; missedHeartbeats: number }
  | { type: 'agent_offline'; agentId: string; missedHeartbeats: number; lastSeenAt: number }
  | { type: 'agent_online'; agentId: string }
  | { type: 'task_orphaned'; agentId: string; taskId: string };

/**
 * 超时策略配置
 */
export interface TimeoutPolicy {
  /** 丢失次数阈值 */
  missed: number;
  /** 动作 */
  action: 'warn' | 'alert' | 'offline' | 'reassignTask';
  /** 是否有任务 */
  hasTask?: boolean;
}

/**
 * 心跳回调
 */
export type HeartbeatCallback = (event: HeartbeatEvent) => void;