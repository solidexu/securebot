/**
 * Agent 协作图类型定义
 * 
 * 定义图结构、节点、边等核心类型
 */

// ============ 图核心类型 ============

/**
 * Agent 图定义
 */
export interface AgentGraph {
  /** 图 ID */
  id: string;
  /** 图名称 */
  name: string;
  /** 描述 */
  description?: string;
  /** 版本 */
  version?: string;
  /** 节点（Agents） */
  nodes: Map<string, AgentNode>;
  /** 边（关系） */
  edges: GraphEdge[];
  /** 入口点 */
  entryPoint: string;
  /** 执行模式 */
  executionMode: ExecutionMode;
  /** 高级配置（LangGraph 模式） */
  config?: GraphConfig;
}

/**
 * 执行模式
 */
export type ExecutionMode = 'lightweight' | 'langgraph';

/**
 * Agent 节点
 */
export interface AgentNode {
  /** 节点 ID */
  id: string;
  /** 名称 */
  name: string;
  /** 角色 */
  role: string;
  /** 描述 */
  description?: string;
  /** 系统提示词 */
  systemPrompt: string | ((context: GraphContext) => string);
  /** 工具列表 */
  tools?: string[];
  /** 模型配置 */
  model?: ModelConfig;
  /** 节点行为 */
  behavior?: AgentBehavior;
}

/**
 * 模型配置
 */
export interface ModelConfig {
  /** 提供商 */
  provider: string;
  /** 模型名称 */
  name: string;
  /** 参数 */
  params?: Record<string, unknown>;
}

/**
 * 重试策略
 */
export interface RetryPolicy {
  /** 最大尝试次数 */
  maxAttempts: number;
  /** 初始间隔（毫秒） */
  initialInterval: number;
  /** 最大间隔（毫秒） */
  maxInterval: number;
  /** 退避因子 */
  backoffFactor: number;
  /** 是否添加抖动 */
  jitter: boolean;
}

/**
 * Agent 行为配置
 */
export interface AgentBehavior {
  /** 是否异步执行 */
  isAsync?: boolean;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 重试策略 */
  retryPolicy?: Partial<RetryPolicy>;
}

/**
 * 重试策略
 */
export interface RetryPolicy {
  /** 最大重试次数 */
  maxAttempts: number;
  /** 初始延迟（毫秒） */
  initialDelay: number;
  /** 最大延迟（毫秒） */
  maxDelay?: number;
  /** 倍数 */
  multiplier?: number;
}

/**
 * 图边（Agent 关系）
 */
export interface GraphEdge {
  /** 边 ID */
  id: string;
  /** 起点 Agent ID */
  source: string;
  /** 终点 Agent ID */
  target: string;
  /** 边类型 */
  type: EdgeType;
  /** 条件（条件边） */
  condition?: EdgeCondition;
  /** 元数据 */
  metadata?: EdgeMetadata;
}

/**
 * 边类型
 */
export type EdgeType = 'direct' | 'conditional';

/**
 * 边条件
 */
export interface EdgeCondition {
  /** 关键词匹配 */
  keywords?: string[];
  /** 表达式 */
  expression?: string;
  /** 函数名 */
  functionName?: string;
}

/**
 * 边元数据
 */
export interface EdgeMetadata {
  /** 标签 */
  label?: string;
  /** 描述 */
  description?: string;
  /** 优先级 */
  priority?: number;
  /** 是否默认边 */
  isDefault?: boolean;
}

/**
 * 图配置（LangGraph 模式）
 */
export interface GraphConfig {
  /** 检查点配置 */
  checkpointer?: CheckpointerConfig;
  /** 中断配置 */
  interrupts?: InterruptConfig;
  /** 状态 Schema */
  stateSchema?: StateSchema;
  /** 并行配置 */
  parallel?: ParallelConfig;
}

/**
 * 检查点配置
 */
export interface CheckpointerConfig {
  /** 类型 */
  type: 'memory' | 'sqlite' | 'postgres' | 'redis';
  /** 路径 */
  path?: string;
}

/**
 * 中断配置
 */
export interface InterruptConfig {
  /** 在哪些节点前中断 */
  before?: string[];
  /** 在哪些节点后中断 */
  after?: string[];
}

/**
 * 状态 Schema
 */
export interface StateSchema {
  /** 字段定义 */
  fields: Record<string, StateField>;
}

/**
 * 状态字段
 */
export interface StateField {
  /** 类型 */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** 默认值 */
  default?: unknown;
  /** Reducer 类型 */
  reducer?: 'append' | 'replace' | 'merge' | 'last';
}

/**
 * 并行配置
 */
export interface ParallelConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 最大并发数 */
  maxConcurrency?: number;
}

// ============ 上下文与状态 ============

/**
 * 图上下文
 */
export interface GraphContext {
  /** 当前状态 */
  state: GraphState;
  /** 当前消息 */
  message: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 图状态
 */
export interface GraphState {
  /** 消息历史 */
  messages: GraphMessage[];
  /** 当前节点 */
  currentNode: string;
  /** 上下文数据 */
  context: Record<string, unknown>;
  /** 用户自定义字段 */
  [key: string]: unknown;
}

/**
 * 图消息
 */
export interface GraphMessage {
  /** 角色 */
  role: 'user' | 'assistant' | 'system' | 'tool';
  /** 内容 */
  content: string;
  /** 节点 ID */
  node?: string;
  /** 时间戳 */
  timestamp?: number;
}

// ============ 执行结果 ============

/**
 * 执行结果
 */
export interface ExecutionResult {
  /** 是否成功 */
  success: boolean;
  /** 结果内容 */
  result?: string;
  /** 错误信息 */
  error?: string;
  /** 最终状态 */
  state: GraphState;
  /** 执行历史 */
  history: ExecutionLog[];
  /** 线程 ID */
  threadId?: string;
  /** 执行模式 */
  mode: ExecutionMode;
}

/**
 * 执行日志
 */
export interface ExecutionLog {
  /** 时间戳 */
  timestamp: number;
  /** 事件类型 */
  type: string;
  /** 节点 ID */
  nodeId: string;
  /** 数据 */
  data: unknown;
}

/**
 * 节点响应
 */
export type NodeResponse =
  | { type: 'result'; content: string }
  | { type: 'handoff'; content: string; target: string; message: string };

// ============ YAML 配置 ============

/**
 * YAML 工作流配置
 */
export interface WorkflowConfig {
  /** ID */
  id: string;
  /** 名称 */
  name: string;
  /** 模式 */
  mode?: ExecutionMode;
  /** 入口 */
  entry: string;
  /** Agents */
  agents: AgentConfig[];
  /** 边 */
  edges?: EdgeConfig[];
  /** 路由 */
  routes?: Record<string, RouteConfig>;
  /** LangGraph 配置 */
  langgraph?: GraphConfig;
}

/**
 * YAML Agent 配置
 */
export interface AgentConfig {
  /** ID */
  id: string;
  /** 名称 */
  name: string;
  /** 角色 */
  role: string;
  /** 描述 */
  description?: string;
  /** 系统提示词 */
  systemPrompt: string;
  /** 工具 */
  tools?: string[];
  /** 模型 */
  model?: ModelConfig;
  /** 行为 */
  behavior?: AgentBehavior;
}

/**
 * YAML 边配置
 */
export interface EdgeConfig {
  /** 起点 */
  source: string;
  /** 终点 */
  target: string;
  /** 类型 */
  type: EdgeType;
  /** 条件 */
  condition?: EdgeCondition;
  /** 元数据 */
  metadata?: EdgeMetadata;
}

/**
 * 路由配置
 */
export interface RouteConfig {
  /** 条件映射 */
  on: Record<string, string>;
  /** 默认目标 */
  default?: string;
  /** 条件函数 */
  conditionFn?: string;
}

// ============ 常量 ============

/** 结束节点标识 */
export const END_NODE = '__end__';

/** 开始节点标识 */
export const START_NODE = '__start__';

// ============ 事件类型 ============

/**
 * Agent 事件类型（用于监控）
 */
export type AgentEvent =
  | { type: 'node_enter'; nodeId: string; nodeName: string; timestamp: number }
  | { type: 'node_exit'; nodeId: string; result: string; duration: number; timestamp: number }
  | { type: 'node_error'; nodeId: string; error: string; timestamp: number }
  | { type: 'edge_traverse'; from: string; to: string; condition?: string; timestamp: number }
  | { type: 'llm_call'; nodeId: string; tokens?: number; duration?: number; timestamp: number }
  | { type: 'llm_stream'; nodeId: string; chunk: string; timestamp: number }
  | { type: 'tool_call'; nodeId: string; tool: string; args: Record<string, unknown>; timestamp: number }
  | { type: 'tool_result'; nodeId: string; tool: string; result: unknown; timestamp: number }
  | { type: 'handoff'; from: string; to: string; message: string; timestamp: number }
  | { type: 'state_update'; key: string; value: unknown; timestamp: number }
  | { type: 'workflow_start'; graphId: string; threadId: string; input: string; timestamp: number }
  | { type: 'workflow_complete'; graphId: string; threadId: string; result?: string; error?: string; timestamp: number }
  | { type: 'workflow_interrupt'; graphId: string; threadId: string; nodeId: string; reason: string; timestamp: number };