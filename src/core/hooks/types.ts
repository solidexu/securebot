/**
 * Session Hook 类型定义
 * 
 * 生命周期 Hook 用于自动捕获 session 事件
 */

// ============ Hook 接口 ============

/**
 * Hook 触发时机
 */
export type HookTrigger = 'start' | 'prompt' | 'stop' | 'end';

/**
 * Hook 执行上下文
 */
export interface HookContext {
  /** Agent ID */
  agentId: string;
  /** Session ID */
  sessionId: string;
  /** 用户输入（prompt Hook） */
  prompt?: string;
  /** 响应内容（stop Hook） */
  response?: string;
  /** 使用的工具列表（stop Hook） */
  toolsUsed?: string[];
  /** Session 开始时间 */
  startTime?: Date;
  /** Session 结束时间（end Hook） */
  endTime?: Date;
}

/**
 * Hook 接口
 */
export interface SessionHook {
  /** Hook 名称 */
  name: string;
  /** 触发时机 */
  trigger: HookTrigger;
  /** 执行函数 */
  execute(context: HookContext): Promise<void>;
}

/**
 * Hook 注册器接口
 */
export interface HookRegistry {
  /** 注册 Hook */
  register(hook: SessionHook): void;
  /** 获取指定触发点的 Hook 列表 */
  getHooks(trigger: HookTrigger): SessionHook[];
  /** 执行指定触发点的所有 Hook */
  executeHooks(trigger: HookTrigger, context: HookContext): Promise<void>;
}
