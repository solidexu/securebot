/**
 * 心跳管理器
 * 
 * 负责：
 * - 接收 Agent 心跳
 * - 检测超时
 * - 触发告警
 * - 处理离线 Agent
 */

import {
  HeartbeatConfig,
  DEFAULT_HEARTBEAT_CONFIG,
  AgentHeartbeat,
  AgentState,
  AgentStatus,
  HeartbeatEvent,
  HeartbeatCallback,
  TimeoutPolicy,
} from './types';

/**
 * 心跳管理器
 */
export class HeartbeatManager {
  private config: HeartbeatConfig;
  private agentStates: Map<string, AgentState> = new Map();
  private checkerTimer?: ReturnType<typeof setInterval>;
  private subscribers: HeartbeatCallback[] = [];
  private timeoutPolicies: TimeoutPolicy[] = [];

  constructor(config?: Partial<HeartbeatConfig>) {
    this.config = { ...DEFAULT_HEARTBEAT_CONFIG, ...config };
    
    // 默认超时策略
    this.timeoutPolicies = [
      { missed: 1, action: 'warn' },
      { missed: 2, action: 'alert' },
      { missed: 3, action: 'offline' },
      { missed: 3, action: 'reassignTask', hasTask: true },
    ];
  }

  /**
   * 设置超时策略
   */
  setTimeoutPolicies(policies: TimeoutPolicy[]): void {
    this.timeoutPolicies = policies;
  }

  /**
   * 注册 Agent
   */
  registerAgent(agentId: string): void {
    if (this.agentStates.has(agentId)) {
      return;
    }

    this.agentStates.set(agentId, {
      agentId,
      status: 'online',
      lastSeenAt: Date.now(),
      missedHeartbeats: 0,
    });

    this.emit({
      type: 'agent_online',
      agentId,
    });
  }

  /**
   * 注销 Agent
   */
  unregisterAgent(agentId: string): void {
    this.agentStates.delete(agentId);
  }

  /**
   * 接收心跳
   */
  receiveHeartbeat(heartbeat: AgentHeartbeat): void {
    const { agentId, status, currentTask, metrics, timestamp } = heartbeat;

    // 自动注册新 Agent
    if (!this.agentStates.has(agentId)) {
      this.registerAgent(agentId);
    }

    const state = this.agentStates.get(agentId)!;

    // 更新状态
    state.lastSeenAt = timestamp || Date.now();
    state.missedHeartbeats = 0;
    state.currentTask = currentTask;
    state.metrics = metrics;

    // 根据心跳状态更新 Agent 状态
    switch (status) {
      case 'working':
        state.status = 'busy';
        break;
      case 'error':
        state.status = 'error';
        break;
      default:
        state.status = 'online';
    }

    this.emit({
      type: 'heartbeat_received',
      agentId,
      status: state.status,
    });
  }

  /**
   * 启动心跳检查
   */
  start(): void {
    if (this.checkerTimer) {
      return;
    }

    this.checkerTimer = setInterval(() => {
      this.checkHeartbeats();
    }, this.config.checkInterval);
  }

  /**
   * 停止心跳检查
   */
  stop(): void {
    if (this.checkerTimer) {
      clearInterval(this.checkerTimer);
      this.checkerTimer = undefined;
    }
  }

  /**
   * 检查心跳
   */
  private checkHeartbeats(): void {
    const now = Date.now();

    for (const [agentId, state] of this.agentStates) {
      const elapsed = now - state.lastSeenAt;

      if (elapsed > this.config.timeout) {
        state.missedHeartbeats++;

        // 应用超时策略
        this.applyTimeoutPolicies(state);

        // 超过最大丢失次数，标记离线
        if (state.missedHeartbeats >= this.config.maxMissed) {
          if (state.status !== 'offline') {
            const previousStatus = state.status;
            state.status = 'offline';

            this.emit({
              type: 'agent_offline',
              agentId,
              missedHeartbeats: state.missedHeartbeats,
              lastSeenAt: state.lastSeenAt,
            });

            // 处理遗留任务
            if (state.currentTask) {
              this.emit({
                type: 'task_orphaned',
                agentId,
                taskId: state.currentTask,
              });
            }
          }
        } else {
          this.emit({
            type: 'heartbeat_missed',
            agentId,
            missedHeartbeats: state.missedHeartbeats,
          });
        }
      }
    }
  }

  /**
   * 应用超时策略
   */
  private applyTimeoutPolicies(state: AgentState): void {
    for (const policy of this.timeoutPolicies) {
      if (state.missedHeartbeats === policy.missed) {
        // 检查 hasTask 条件
        if (policy.hasTask !== undefined) {
          const hasTask = !!state.currentTask;
          if (hasTask !== policy.hasTask) {
            continue;
          }
        }

        this.executePolicyAction(policy, state);
      }
    }
  }

  /**
   * 执行策略动作
   */
  private executePolicyAction(policy: TimeoutPolicy, state: AgentState): void {
    switch (policy.action) {
      case 'warn':
        console.warn(`[Heartbeat] Agent ${state.agentId} missed heartbeat (${state.missedHeartbeats} times)`);
        break;

      case 'alert':
        this.sendAlert(state.agentId, state);
        break;

      case 'offline':
        // 由 checkHeartbeats 处理
        break;

      case 'reassignTask':
        if (state.currentTask) {
          this.reassignTask(state.agentId, state.currentTask);
        }
        break;
    }
  }

  /**
   * 发送告警
   */
  private sendAlert(agentId: string, state: AgentState): void {
    // 可以扩展为发送飞书、邮件等
    console.warn(
      `[Heartbeat Alert] Agent ${agentId} is unresponsive. ` +
      `Last seen: ${new Date(state.lastSeenAt).toISOString()}, ` +
      `Missed heartbeats: ${state.missedHeartbeats}`
    );
  }

  /**
   * 重新分配任务
   */
  private reassignTask(agentId: string, taskId: string): void {
    // 可以扩展为实际的任务重分配逻辑
    console.warn(
      `[Heartbeat] Reassigning task ${taskId} from offline agent ${agentId}`
    );
  }

  /**
   * 获取 Agent 状态
   */
  getAgentState(agentId: string): AgentState | undefined {
    return this.agentStates.get(agentId);
  }

  /**
   * 获取所有 Agent 状态
   */
  getAllAgentStates(): AgentState[] {
    return Array.from(this.agentStates.values());
  }

  /**
   * 获取在线 Agent
   */
  getOnlineAgents(): AgentState[] {
    return Array.from(this.agentStates.values()).filter(
      (s) => s.status !== 'offline'
    );
  }

  /**
   * 获取离线 Agent
   */
  getOfflineAgents(): AgentState[] {
    return Array.from(this.agentStates.values()).filter(
      (s) => s.status === 'offline'
    );
  }

  /**
   * 获取忙碌 Agent
   */
  getBusyAgents(): AgentState[] {
    return Array.from(this.agentStates.values()).filter(
      (s) => s.status === 'busy'
    );
  }

  /**
   * 订阅事件
   */
  subscribe(callback: HeartbeatCallback): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== callback);
    };
  }

  /**
   * 发射事件
   */
  private emit(event: HeartbeatEvent): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch (error) {
        console.error('[Heartbeat] Error in subscriber:', error);
      }
    }
  }

  /**
   * 获取配置
   */
  getConfig(): HeartbeatConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<HeartbeatConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 导出状态
   */
  exportState(): Record<string, AgentState> {
    const result: Record<string, AgentState> = {};
    for (const [id, state] of this.agentStates) {
      result[id] = { ...state };
    }
    return result;
  }

  /**
   * 导入状态
   */
  importState(states: Record<string, AgentState>): void {
    for (const [id, state] of Object.entries(states)) {
      this.agentStates.set(id, { ...state });
    }
  }
}