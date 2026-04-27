/**
 * Human-in-the-Loop 人在回路交互管理器
 *
 * 统一管理中断创建、决策提交、状态编辑、等待决策等操作
 * 是执行器与用户界面（CLI/TUI/API）之间的桥梁
 */

import {
  HitlLevel,
  HitlConfig,
  HumanDecision,
  InterruptState,
  InterruptType,
  DecisionAction,
  HitlEvent,
} from './hitl-types';
import { GraphState, AgentEvent } from './types';
import { InterruptStore, MemoryInterruptStore } from './hitl-store';

// ============ 事件发射器 ============

/**
 * 事件发射函数类型
 */
export type HitlEventEmitter = (event: HitlEvent | AgentEvent) => void;

// ============ 人在回路管理器 ============

/**
 * 人在回路交互管理器
 *
 * 核心职责：
 * 1. 创建中断（由执行器调用）
 * 2. 等待决策（阻塞执行器）
 * 3. 提交决策（由 UI/CLI 调用）
 * 4. 编辑状态（由 UI/CLI 调用）
 * 5. 超时自动批准
 */
export class HumanInteractionManager {
  /** 活跃的中断（threadId -> InterruptState） */
  private activeInterrupts: Map<string, InterruptState> = new Map();

  /** 决策完成信号（threadId -> resolve 函数） */
  private decisionResolvers: Map<string, () => void> = new Map();

  /** 持久化存储 */
  private store: InterruptStore;

  /** 事件发射器 */
  private emitter?: HitlEventEmitter;

  /** 图 ID（用于事件） */
  private graphId?: string;

  constructor(options?: {
    store?: InterruptStore;
    emitter?: HitlEventEmitter;
    graphId?: string;
  }) {
    this.store = options?.store || new MemoryInterruptStore();
    this.emitter = options?.emitter;
    this.graphId = options?.graphId;
  }

  // ============ 公共 API ============

  /**
   * 创建中断
   *
   * 由执行器在需要人类决策时调用。创建后执行器应调用 waitForDecision()
   * 阻塞等待，直到用户通过 submitDecision() 提交决策。
   *
   * @param threadId   线程 ID
   * @param nodeId     当前节点 ID
   * @param reason     中断原因
   * @param type       中断类型
   * @param state      当前图状态快照
   * @param timeoutMs  超时自动批准时间（可选）
   */
  async createInterrupt(
    threadId: string,
    nodeId: string,
    reason: string,
    type: InterruptType,
    state: GraphState,
    timeoutMs?: number
  ): Promise<InterruptState> {
    const interrupt: InterruptState = {
      threadId,
      nodeId,
      reason,
      interruptType: type,
      currentState: JSON.parse(JSON.stringify(state)),
      pending: true,
      timeoutMs,
      createdAt: Date.now(),
    };

    // 保存到内存和持久化
    this.activeInterrupts.set(threadId, interrupt);
    await this.store.save(interrupt);
    await this.store.saveCheckpoint(threadId, state);

    // 发射事件
    this.emit({
      type: 'hitl_interrupt',
      graphId: this.graphId || '',
      threadId,
      nodeId,
      reason,
      interruptState: interrupt,
      timestamp: Date.now(),
    });

    return interrupt;
  }

  /**
   * 创建工具调用审批中断
   *
   * @param threadId   线程 ID
   * @param nodeId     当前节点 ID
   * @param toolName   工具名称
   * @param toolArgs   工具参数
   * @param state      当前图状态
   */
  async createToolApproval(
    threadId: string,
    nodeId: string,
    toolName: string,
    toolArgs: Record<string, unknown>,
    state: GraphState
  ): Promise<InterruptState> {
    return this.createInterrupt(
      threadId,
      nodeId,
      `Tool "${toolName}" requires approval`,
      'tool_call',
      state
    );
  }

  /**
   * 提交人类决策
   *
   * 由 CLI/TUI/API 在用户做出决策后调用。
   * 调用后，waitForDecision() 将返回此决策。
   *
   * @param threadId  线程 ID
   * @param decision  决策内容
   */
  async submitDecision(
    threadId: string,
    decision: HumanDecision
  ): Promise<void> {
    const interrupt = this.activeInterrupts.get(threadId);
    if (!interrupt) {
      throw new Error(`No active interrupt for thread: ${threadId}`);
    }

    interrupt.decision = decision;
    interrupt.pending = false;
    interrupt.resolvedAt = Date.now();

    // 如果决策包含状态修改，更新状态快照
    if (decision.modifiedState) {
      Object.assign(interrupt.currentState, decision.modifiedState);
    }

    // 更新持久化
    await this.store.save(interrupt);

    // 发射决策事件
    this.emit({
      type: 'hitl_decision',
      graphId: this.graphId || '',
      threadId,
      nodeId: interrupt.nodeId,
      decision,
      timestamp: Date.now(),
    });

    // 唤醒等待中的执行器
    const resolver = this.decisionResolvers.get(threadId);
    if (resolver) {
      this.decisionResolvers.delete(threadId);
      resolver();
    }
  }

  /**
   * 等待人类决策
   *
   * 由执行器调用，阻塞直到用户提交决策或超时。
   *
   * @param threadId   线程 ID
   * @param timeoutMs  超时时间（毫秒），不传则使用中断自带的超时
   * @returns          人类决策
   */
  async waitForDecision(
    threadId: string,
    timeoutMs?: number
  ): Promise<HumanDecision> {
    const interrupt = this.activeInterrupts.get(threadId);
    if (!interrupt) {
      throw new Error(`No active interrupt for thread: ${threadId}`);
    }

    // 如果已有决策，直接返回
    if (interrupt.decision) {
      return interrupt.decision;
    }

    const effectiveTimeout = timeoutMs ?? interrupt.timeoutMs ?? 0;

    return new Promise<HumanDecision>((resolve) => {
      // 注册唤醒函数
      this.decisionResolvers.set(threadId, () => {
        const updated = this.activeInterrupts.get(threadId);
        if (updated?.decision) {
          resolve(updated.decision);
        }
      });

      // 超时自动批准
      if (effectiveTimeout > 0) {
        setTimeout(async () => {
          const current = this.activeInterrupts.get(threadId);
          if (current?.pending) {
            const autoDecision: HumanDecision = {
              action: 'approve',
              reason: `Auto-approved (timeout ${effectiveTimeout}ms)`,
            };
            await this.submitDecision(threadId, autoDecision);
          }
        }, effectiveTimeout);
      }
    });
  }

  /**
   * 编辑图状态
   *
   * 在暂停期间，人类可以查看并修改图状态。
   *
   * @param threadId  线程 ID
   * @param updates   要更新的状态字段
   * @returns         更新后的状态
   */
  async editState(
    threadId: string,
    updates: Record<string, unknown>
  ): Promise<GraphState> {
    const interrupt = this.activeInterrupts.get(threadId);
    if (!interrupt) {
      throw new Error(`No active interrupt for thread: ${threadId}`);
    }

    const before = JSON.parse(JSON.stringify(interrupt.currentState));

    // 应用更新
    Object.assign(interrupt.currentState, updates);

    // 持久化
    await this.store.save(interrupt);
    await this.store.saveCheckpoint(threadId, interrupt.currentState);

    // 发射事件
    this.emit({
      type: 'hitl_state_updated',
      graphId: this.graphId || '',
      threadId,
      before,
      after: interrupt.currentState,
      timestamp: Date.now(),
    });

    return interrupt.currentState;
  }

  /**
   * 获取中断状态
   *
   * @param threadId  线程 ID
   */
  getInterrupt(threadId: string): InterruptState | undefined {
    return this.activeInterrupts.get(threadId);
  }

  /**
   * 列出所有待处理的中断
   */
  async listPendingInterrupts(): Promise<InterruptState[]> {
    return this.store.listPending();
  }

  /**
   * 清除已处理的中断
   *
   * @param threadId  线程 ID
   */
  async clearInterrupt(threadId: string): Promise<void> {
    this.activeInterrupts.delete(threadId);
    await this.store.delete(threadId);
  }

  /**
   * 获取持久化存储
   */
  getStore(): InterruptStore {
    return this.store;
  }

  // ============ 内部方法 ============

  /**
   * 发射事件
   */
  private emit(event: HitlEvent | AgentEvent): void {
    this.emitter?.(event);
  }
}

// ============ 快捷工厂 ============

/**
 * 创建人在回路管理器
 */
export function createHitlManager(options?: {
  store?: InterruptStore;
  emitter?: HitlEventEmitter;
  graphId?: string;
}): HumanInteractionManager {
  return new HumanInteractionManager(options);
}

// ============ 工具方法 ============

/**
 * 判断决策是否为终止操作
 */
export function isAbortDecision(decision: HumanDecision): boolean {
  return decision.action === 'abort';
}

/**
 * 判断决策是否为跳过操作
 */
export function isSkipDecision(decision: HumanDecision): boolean {
  return decision.action === 'skip';
}

/**
 * 判断决策是否包含状态修改
 */
export function hasStateModification(decision: HumanDecision): boolean {
  return decision.action === 'modify' && !!decision.modifiedState;
}

/**
 * 获取决策指定的路由目标
 */
export function getDecisionGoto(decision: HumanDecision): string | undefined {
  return decision.goto;
}
