/**
 * Human-in-the-Loop 人在回路类型定义
 *
 * 定义中断、决策、配置等核心类型
 */

import { GraphState } from './types';

// ============ 干预级别 ============

/**
 * 人在回路干预级别
 *
 * - full_auto:       全自动执行，无中断（默认）
 * - tool_approval:   工具调用前需要审批
 * - node_interrupt:  特定节点前暂停等待审批
 * - step_through:    每个节点后暂停（调试/审核模式）
 * - full_manual:     完全手动，每个决策都需要人类确认
 */
export enum HitlLevel {
  /** 全自动执行，无中断 */
  FULL_AUTO = 'full_auto',
  /** 工具调用前需要审批 */
  TOOL_APPROVAL = 'tool_approval',
  /** 特定节点前暂停等待审批 */
  NODE_INTERRUPT = 'node_interrupt',
  /** 每个节点后暂停（调试/审核模式） */
  STEP_THROUGH = 'step_through',
  /** 完全手动，每个决策都需要人类确认 */
  FULL_MANUAL = 'full_manual',
}

// ============ 中断类型 ============

/**
 * 中断触发时机
 */
export type InterruptType =
  /** 节点执行前中断 */
  | 'before_node'
  /** 节点执行后中断 */
  | 'after_node'
  /** 工具调用前中断 */
  | 'tool_call'
  /** 手动触发中断 */
  | 'manual';

// ============ 人类决策 ============

/**
 * 人类决策动作
 */
export type DecisionAction =
  /** 批准，继续执行 */
  | 'approve'
  /** 拒绝，跳过或走替代路径 */
  | 'reject'
  /** 修改内容后继续 */
  | 'modify'
  /** 跳过当前节点 */
  | 'skip'
  /** 终止整个工作流 */
  | 'abort';

/**
 * 人类决策
 */
export interface HumanDecision {
  /** 决策动作 */
  action: DecisionAction;
  /** 决策理由（可选） */
  reason?: string;
  /** 修改后的内容（action='modify' 时有效） */
  modifiedContent?: string;
  /** 修改后的状态字段（action='modify' 时有效） */
  modifiedState?: Record<string, unknown>;
  /** 替代路由目标（action='reject' 时指定跳往哪个节点） */
  goto?: string;
}

// ============ 中断状态 ============

/**
 * 中断状态
 *
 * 当执行器遇到需要人类介入的点时，创建此对象并暂停执行
 */
export interface InterruptState {
  /** 线程 ID，唯一标识一次工作流执行 */
  threadId: string;
  /** 当前节点 ID */
  nodeId: string;
  /** 中断原因描述 */
  reason: string;
  /** 中断触发时机 */
  interruptType: InterruptType;
  /** 触发中断的工具信息（interruptType='tool_call' 时） */
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  /** 当前图状态快照（供人类查看/编辑） */
  currentState: GraphState;
  /** 是否等待决策中 */
  pending: boolean;
  /** 已提交的决策（决策后填写） */
  decision?: HumanDecision;
  /** 超时自动批准时间（毫秒），0 或 undefined 表示不超时 */
  timeoutMs?: number;
  /** 创建时间戳 */
  createdAt: number;
  /** 决策时间戳（决策后填写） */
  resolvedAt?: number;
}

// ============ HITL 配置 ============

/**
 * 单个 Agent 节点的 HITL 配置
 */
export interface AgentHitlConfig {
  /** 此节点执行前是否中断 */
  interruptBefore?: boolean;
  /** 此节点执行后是否中断 */
  interruptAfter?: boolean;
}

/**
 * 人在回路配置
 *
 * 可在 YAML 工作流中声明，或通过 API 动态设置
 */
export interface HitlConfig {
  /** 干预级别 */
  level: HitlLevel;
  /** 需要中断的节点 ID 列表（level=NODE_INTERRUPT 时生效） */
  interruptNodes?: string[];
  /** 单个 Agent 级别的 HITL 配置（覆盖全局配置） */
  agentConfig?: Record<string, AgentHitlConfig>;
  /** 工具调用是否需要审批（level=TOOL_APPROVAL 或更高级别时生效） */
  requireToolApproval?: boolean;
  /** 白名单工具列表（即使 requireToolApproval=true 也不需要审批） */
  approvedTools?: string[];
  /** 超时自动批准时间（毫秒），0 表示永不超时 */
  autoApproveTimeoutMs?: number;
}

// ============ HITL 事件 ============

/**
 * HITL 事件类型
 *
 * 用于事件系统通知 UI/CLI 需要人类介入
 */
export type HitlEvent =
  /** 中断事件：执行器暂停，等待人类决策 */
  | {
      type: 'hitl_interrupt';
      /** 图 ID */
      graphId: string;
      /** 线程 ID */
      threadId: string;
      /** 节点 ID */
      nodeId: string;
      /** 中断原因 */
      reason: string;
      /** 完整中断状态 */
      interruptState: InterruptState;
      /** 时间戳 */
      timestamp: number;
    }
  /** 决策事件：人类已提交决策 */
  | {
      type: 'hitl_decision';
      graphId: string;
      threadId: string;
      nodeId: string;
      decision: HumanDecision;
      timestamp: number;
    }
  /** 工具审批事件：工具调用等待人类批准 */
  | {
      type: 'hitl_tool_approval';
      graphId: string;
      threadId: string;
      nodeId: string;
      /** 工具名称 */
      tool: string;
      /** 工具参数 */
      args: Record<string, unknown>;
      timestamp: number;
    }
  /** 状态编辑事件：人类修改了图状态 */
  | {
      type: 'hitl_state_updated';
      graphId: string;
      threadId: string;
      /** 编辑前状态 */
      before: GraphState;
      /** 编辑后状态 */
      after: GraphState;
      timestamp: number;
    };
