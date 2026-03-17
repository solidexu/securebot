/**
 * 事件驱动架构 - 事件类型定义
 * 
 * 所有系统间通信通过事件进行，实现松耦合
 */

// ============ 基础事件接口 ============

/**
 * 事件基础接口
 */
export interface BaseEvent<T = unknown> {
  /** 事件类型 */
  type: string;
  /** 时间戳 */
  timestamp: Date;
  /** Agent ID */
  agentId: string;
  /** 会话 ID */
  sessionId: string;
  /** 事件负载 */
  payload: T;
}

// ============ 用户消息事件 ============

/**
 * 用户消息事件
 */
export interface UserMessageEvent extends BaseEvent<{
  message: string;
  complexity: 'simple' | 'complex';
}> {
  type: 'user:message';
}

// ============ 工具调用事件 ============

/**
 * 工具调用开始事件
 */
export interface ToolCallStartEvent extends BaseEvent<{
  toolName: string;
  arguments: Record<string, unknown>;
}> {
  type: 'tool:call:start';
}

/**
 * 工具调用成功事件
 */
export interface ToolCallSuccessEvent extends BaseEvent<{
  toolName: string;
  arguments: Record<string, unknown>;
  result: unknown;
  duration: number;
}> {
  type: 'tool:call:success';
}

/**
 * 工具调用失败事件
 */
export interface ToolCallFailureEvent extends BaseEvent<{
  toolName: string;
  arguments: Record<string, unknown>;
  error: string;
  duration: number;
}> {
  type: 'tool:call:failure';
}

/**
 * 工具确认请求事件
 */
export interface ToolConfirmationRequestEvent extends BaseEvent<{
  toolName: string;
  arguments: Record<string, unknown>;
  risk: string;
  suggestions?: string[];
}> {
  type: 'tool:confirmation:request';
}

/**
 * 工具确认结果事件
 */
export interface ToolConfirmationResultEvent extends BaseEvent<{
  toolName: string;
  arguments: Record<string, unknown>;
  decision: 'approved' | 'denied';
  remember?: boolean;
  rememberScope?: 'tool' | 'pattern';
}> {
  type: 'tool:confirmation:result';
}

// ============ 任务事件 ============

/**
 * 任务开始事件
 */
export interface TaskStartEvent extends BaseEvent<{
  taskDescription: string;
  planId?: string;
}> {
  type: 'task:start';
}

/**
 * 任务完成事件
 */
export interface TaskCompleteEvent extends BaseEvent<{
  taskDescription: string;
  planId?: string;
  stepsCompleted: number;
  stepsTotal: number;
}> {
  type: 'task:complete';
}

/**
 * 任务失败事件
 */
export interface TaskFailureEvent extends BaseEvent<{
  taskDescription: string;
  error: string;
}> {
  type: 'task:fail';
}

/**
 * 任务计划创建事件
 */
export interface TaskPlanEvent extends BaseEvent<{
  planId: string;
  title: string;
  steps: Array<{
    id: string;
    description: string;
    status: string;
  }>;
  originalTask: string;
}> {
  type: 'task:plan';
}

/**
 * 任务步骤更新事件
 */
export interface TaskStepUpdateEvent extends BaseEvent<{
  planId: string;
  stepId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
}> {
  type: 'task:step:update';
}

// ============ 会话事件 ============

/**
 * 会话开始事件
 */
export interface SessionStartEvent extends BaseEvent<{
  agentName: string;
}> {
  type: 'session:start';
}

/**
 * 会话结束事件
 */
export interface SessionEndEvent extends BaseEvent<{
  reason: 'user_exit' | 'error' | 'timeout';
}> {
  type: 'session:end';
}

/**
 * 会话保存事件
 */
export interface SessionSaveEvent extends BaseEvent<{
  messageCount: number;
  hasPlan: boolean;
}> {
  type: 'session:save';
}

/**
 * 会话恢复事件
 */
export interface SessionRestoreEvent extends BaseEvent<{
  messageCount: number;
  planStatus?: {
    hasPlan: boolean;
    completedSteps: number;
    totalSteps: number;
  };
}> {
  type: 'session:restore';
}

// ============ Agent 切换事件 ============

/**
 * Agent 切换事件
 */
export interface AgentSwitchEvent extends BaseEvent<{
  fromAgentId: string;
  toAgentId: string;
  toAgentName: string;
}> {
  type: 'agent:switch';
}

// ============ 记忆事件 ============

/**
 * 记忆记录事件
 */
export interface MemoryRememberEvent extends BaseEvent<{
  type: 'conversation' | 'task' | 'knowledge' | 'event' | 'preference';
  content: string;
  importance: number;
  tags?: string[];
}> {
  type: 'memory:remember';
}

// ============ 错误事件 ============

/**
 * 错误事件
 */
export interface ErrorEvent extends BaseEvent<{
  error: string;
  stack?: string;
  context?: Record<string, unknown>;
}> {
  type: 'error';
}

// ============ 事件类型联合 ============

/**
 * 所有事件类型的联合
 */
export type AppEvent =
  | UserMessageEvent
  | ToolCallStartEvent
  | ToolCallSuccessEvent
  | ToolCallFailureEvent
  | ToolConfirmationRequestEvent
  | ToolConfirmationResultEvent
  | TaskStartEvent
  | TaskCompleteEvent
  | TaskFailureEvent
  | TaskPlanEvent
  | TaskStepUpdateEvent
  | SessionStartEvent
  | SessionEndEvent
  | SessionSaveEvent
  | SessionRestoreEvent
  | AgentSwitchEvent
  | MemoryRememberEvent
  | ErrorEvent;

/**
 * 事件类型常量
 */
export const EventTypes = {
  // 用户消息
  USER_MESSAGE: 'user:message',
  
  // 工具调用
  TOOL_CALL_START: 'tool:call:start',
  TOOL_CALL_SUCCESS: 'tool:call:success',
  TOOL_CALL_FAILURE: 'tool:call:failure',
  TOOL_CONFIRMATION_REQUEST: 'tool:confirmation:request',
  TOOL_CONFIRMATION_RESULT: 'tool:confirmation:result',
  
  // 任务
  TASK_START: 'task:start',
  TASK_COMPLETE: 'task:complete',
  TASK_FAILURE: 'task:fail',
  TASK_PLAN: 'task:plan',
  TASK_STEP_UPDATE: 'task:step:update',
  
  // 会话
  SESSION_START: 'session:start',
  SESSION_END: 'session:end',
  SESSION_SAVE: 'session:save',
  SESSION_RESTORE: 'session:restore',
  
  // Agent
  AGENT_SWITCH: 'agent:switch',
  
  // 记忆
  MEMORY_REMEMBER: 'memory:remember',
  
  // 错误
  ERROR: 'error',
} as const;

/**
 * 事件类型映射
 */
export type EventTypeMap = {
  [EventTypes.USER_MESSAGE]: UserMessageEvent;
  [EventTypes.TOOL_CALL_START]: ToolCallStartEvent;
  [EventTypes.TOOL_CALL_SUCCESS]: ToolCallSuccessEvent;
  [EventTypes.TOOL_CALL_FAILURE]: ToolCallFailureEvent;
  [EventTypes.TOOL_CONFIRMATION_REQUEST]: ToolConfirmationRequestEvent;
  [EventTypes.TOOL_CONFIRMATION_RESULT]: ToolConfirmationResultEvent;
  [EventTypes.TASK_START]: TaskStartEvent;
  [EventTypes.TASK_COMPLETE]: TaskCompleteEvent;
  [EventTypes.TASK_FAILURE]: TaskFailureEvent;
  [EventTypes.TASK_PLAN]: TaskPlanEvent;
  [EventTypes.TASK_STEP_UPDATE]: TaskStepUpdateEvent;
  [EventTypes.SESSION_START]: SessionStartEvent;
  [EventTypes.SESSION_END]: SessionEndEvent;
  [EventTypes.SESSION_SAVE]: SessionSaveEvent;
  [EventTypes.SESSION_RESTORE]: SessionRestoreEvent;
  [EventTypes.AGENT_SWITCH]: AgentSwitchEvent;
  [EventTypes.MEMORY_REMEMBER]: MemoryRememberEvent;
  [EventTypes.ERROR]: ErrorEvent;
};