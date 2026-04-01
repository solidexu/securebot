/**
 * 监控类型定义
 */

/**
 * Agent 事件类型
 */
export type AgentEvent =
  // 节点生命周期
  | { type: 'node_enter'; nodeId: string; nodeName: string; timestamp: number }
  | { type: 'node_exit'; nodeId: string; result: string; duration: number; timestamp: number }
  | { type: 'node_error'; nodeId: string; error: string; timestamp: number }
  
  // 边切换
  | { type: 'edge_traverse'; from: string; to: string; condition?: string; timestamp: number }
  
  // LLM 调用
  | { type: 'llm_call'; nodeId: string; tokens?: number; duration?: number; timestamp: number }
  | { type: 'llm_stream'; nodeId: string; chunk: string; timestamp: number }
  
  // 工具调用
  | { type: 'tool_call'; nodeId: string; tool: string; args: Record<string, unknown>; timestamp: number }
  | { type: 'tool_result'; nodeId: string; tool: string; result: unknown; timestamp: number }
  
  // Handoff
  | { type: 'handoff'; from: string; to: string; message: string; timestamp: number }
  
  // 状态变更
  | { type: 'state_update'; key: string; value: unknown; timestamp: number }
  
  // 工作流生命周期
  | { type: 'workflow_start'; graphId: string; threadId: string; input: string; timestamp: number }
  | { type: 'workflow_complete'; graphId: string; threadId: string; result?: string; error?: string; timestamp: number }
  | { type: 'workflow_interrupt'; graphId: string; threadId: string; nodeId: string; reason: string; timestamp: number };

/**
 * 监控配置
 */
export interface MonitoringConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 日志级别 */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** 历史保留条数 */
  historyLimit: number;
  /** 是否启用 WebSocket */
  websocketEnabled: boolean;
  /** WebSocket 端口 */
  websocketPort?: number;
}

/**
 * 默认监控配置
 */
export const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  enabled: true,
  logLevel: 'info',
  historyLimit: 1000,
  websocketEnabled: false,
};

/**
 * Agent 指标
 */
export interface AgentMetrics {
  /** Agent ID */
  agentId: string;
  /** 调用次数 */
  callCount: number;
  /** 成功次数 */
  successCount: number;
  /** 失败次数 */
  errorCount: number;
  /** 平均耗时（毫秒） */
  avgDuration: number;
  /** 总 Token 数 */
  totalTokens: number;
  /** 最后活动时间 */
  lastActiveAt: number;
}

/**
 * 工作流指标
 */
export interface WorkflowMetrics {
  /** 图 ID */
  graphId: string;
  /** 执行次数 */
  executionCount: number;
  /** 成功次数 */
  successCount: number;
  /** 失败次数 */
  errorCount: number;
  /** 平均耗时（毫秒） */
  avgDuration: number;
  /** 总 Token 数 */
  totalTokens: number;
  /** 当前活跃数 */
  activeCount: number;
}

/**
 * 系统指标
 */
export interface SystemMetrics {
  /** 总工作流数 */
  totalWorkflows: number;
  /** 总 Agent 数 */
  totalAgents: number;
  /** 活跃工作流数 */
  activeWorkflows: number;
  /** 总事件数 */
  totalEvents: number;
  /** 总 Token 数 */
  totalTokens: number;
  /** 平均延迟（毫秒） */
  avgLatency: number;
  /** 错误率 */
  errorRate: number;
  /** 最后更新时间 */
  lastUpdatedAt: number;
}

/**
 * 告警规则
 */
export interface AlertRule {
  /** 规则 ID */
  id: string;
  /** 规则名称 */
  name: string;
  /** 条件表达式 */
  condition: string;
  /** 通知渠道 */
  channels: AlertChannel[];
  /** 严重级别 */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** 是否启用 */
  enabled: boolean;
  /** 冷却时间（毫秒） */
  cooldown?: number;
}

/**
 * 告警渠道
 */
export type AlertChannel = 'feishu' | 'email' | 'webhook' | 'log';

/**
 * 告警事件
 */
export interface AlertEvent {
  /** 告警 ID */
  id: string;
  /** 规则 ID */
  ruleId: string;
  /** 规则名称 */
  ruleName: string;
  /** 严重级别 */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** 消息 */
  message: string;
  /** 上下文 */
  context: Record<string, unknown>;
  /** 时间戳 */
  timestamp: number;
}

/**
 * WebSocket 消息
 */
export interface WebSocketMessage {
  /** 消息类型 */
  type: 'event' | 'metrics' | 'alert' | 'command';
  /** 数据 */
  data: unknown;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 订阅配置
 */
export interface SubscriptionConfig {
  /** 线程 ID */
  threadId?: string;
  /** 图 ID */
  graphId?: string;
  /** 事件类型过滤 */
  eventTypes?: string[];
}