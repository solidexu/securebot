/**
 * 指标收集器
 * 
 * 收集和统计 Agent、工作流、系统指标
 */

import { AgentEvent, AgentMetrics, WorkflowMetrics, SystemMetrics } from './types';

/**
 * 指标收集器
 */
export class MetricsCollector {
  private agentMetrics: Map<string, AgentMetricsInternal> = new Map();
  private workflowMetrics: Map<string, WorkflowMetricsInternal> = new Map();
  private systemMetrics: SystemMetrics;
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
    this.systemMetrics = this.createInitialSystemMetrics();
  }

  /**
   * 记录事件
   */
  recordEvent(event: AgentEvent): void {
    this.updateAgentMetrics(event);
    this.updateWorkflowMetrics(event);
    this.updateSystemMetrics(event);
  }

  /**
   * 更新 Agent 指标
   */
  private updateAgentMetrics(event: AgentEvent): void {
    const nodeId = (event as any).nodeId;
    if (!nodeId) return;

    if (!this.agentMetrics.has(nodeId)) {
      this.agentMetrics.set(nodeId, {
        agentId: nodeId,
        callCount: 0,
        successCount: 0,
        errorCount: 0,
        totalDuration: 0,
        totalTokens: 0,
        lastActiveAt: 0,
      });
    }

    const metrics = this.agentMetrics.get(nodeId)!;
    metrics.lastActiveAt = event.timestamp;

    switch (event.type) {
      case 'node_enter':
        metrics.callCount++;
        break;

      case 'node_exit':
        metrics.successCount++;
        metrics.totalDuration += (event as any).duration || 0;
        break;

      case 'node_error':
        metrics.errorCount++;
        break;

      case 'llm_call':
        metrics.totalTokens += (event as any).tokens || 0;
        break;
    }
  }

  /**
   * 更新工作流指标
   */
  private updateWorkflowMetrics(event: AgentEvent): void {
    const graphId = (event as any).graphId;
    if (!graphId) return;

    if (!this.workflowMetrics.has(graphId)) {
      this.workflowMetrics.set(graphId, {
        graphId,
        executionCount: 0,
        successCount: 0,
        errorCount: 0,
        totalDuration: 0,
        totalTokens: 0,
        activeCount: 0,
        lastStartTime: 0,
      });
    }

    const metrics = this.workflowMetrics.get(graphId)!;

    switch (event.type) {
      case 'workflow_start':
        metrics.executionCount++;
        metrics.activeCount++;
        metrics.lastStartTime = event.timestamp;
        break;

      case 'workflow_complete':
        metrics.activeCount--;
        if ((event as any).error) {
          metrics.errorCount++;
        } else {
          metrics.successCount++;
          const duration = event.timestamp - metrics.lastStartTime;
          metrics.totalDuration += duration;
        }
        break;

      case 'llm_call':
        metrics.totalTokens += (event as any).tokens || 0;
        break;
    }
  }

  /**
   * 更新系统指标
   */
  private updateSystemMetrics(event: AgentEvent): void {
    this.systemMetrics.totalEvents++;
    this.systemMetrics.lastUpdatedAt = event.timestamp;

    if (event.type === 'llm_call') {
      this.systemMetrics.totalTokens += (event as any).tokens || 0;
    }

    if (event.type === 'node_error' || 
        (event.type === 'workflow_complete' && (event as any).error)) {
      const totalOps = this.systemMetrics.totalEvents;
      const errors = this.countErrors();
      this.systemMetrics.errorRate = totalOps > 0 ? errors / totalOps : 0;
    }

    // 更新活跃工作流数
    this.systemMetrics.activeWorkflows = this.countActiveWorkflows();
    
    // 更新平均延迟
    this.systemMetrics.avgLatency = this.calculateAvgLatency();
  }

  /**
   * 获取 Agent 指标
   */
  getAgentMetrics(agentId: string): AgentMetrics | undefined {
    const internal = this.agentMetrics.get(agentId);
    if (!internal) return undefined;

    return {
      agentId: internal.agentId,
      callCount: internal.callCount,
      successCount: internal.successCount,
      errorCount: internal.errorCount,
      avgDuration: internal.callCount > 0 
        ? internal.totalDuration / internal.callCount 
        : 0,
      totalTokens: internal.totalTokens,
      lastActiveAt: internal.lastActiveAt,
    };
  }

  /**
   * 获取所有 Agent 指标
   */
  getAllAgentMetrics(): AgentMetrics[] {
    return Array.from(this.agentMetrics.keys())
      .map((id) => this.getAgentMetrics(id))
      .filter((m): m is AgentMetrics => m !== undefined);
  }

  /**
   * 获取工作流指标
   */
  getWorkflowMetrics(graphId: string): WorkflowMetrics | undefined {
    const internal = this.workflowMetrics.get(graphId);
    if (!internal) return undefined;

    return {
      graphId: internal.graphId,
      executionCount: internal.executionCount,
      successCount: internal.successCount,
      errorCount: internal.errorCount,
      avgDuration: internal.executionCount > 0
        ? internal.totalDuration / internal.executionCount
        : 0,
      totalTokens: internal.totalTokens,
      activeCount: internal.activeCount,
    };
  }

  /**
   * 获取所有工作流指标
   */
  getAllWorkflowMetrics(): WorkflowMetrics[] {
    return Array.from(this.workflowMetrics.keys())
      .map((id) => this.getWorkflowMetrics(id))
      .filter((m): m is WorkflowMetrics => m !== undefined);
  }

  /**
   * 获取系统指标
   */
  getSystemMetrics(): SystemMetrics {
    return {
      ...this.systemMetrics,
      totalWorkflows: this.workflowMetrics.size,
      totalAgents: this.agentMetrics.size,
    };
  }

  /**
   * 重置指标
   */
  reset(): void {
    this.agentMetrics.clear();
    this.workflowMetrics.clear();
    this.systemMetrics = this.createInitialSystemMetrics();
    this.startTime = Date.now();
  }

  /**
   * 导出指标
   */
  export(): {
    agents: Record<string, AgentMetrics>;
    workflows: Record<string, WorkflowMetrics>;
    system: SystemMetrics;
  } {
    const agents: Record<string, AgentMetrics> = {};
    for (const [id, metrics] of this.agentMetrics) {
      agents[id] = this.getAgentMetrics(id)!;
    }

    const workflows: Record<string, WorkflowMetrics> = {};
    for (const [id, metrics] of this.workflowMetrics) {
      workflows[id] = this.getWorkflowMetrics(id)!;
    }

    return {
      agents,
      workflows,
      system: this.getSystemMetrics(),
    };
  }

  // ============ 私有方法 ============

  private createInitialSystemMetrics(): SystemMetrics {
    return {
      totalWorkflows: 0,
      totalAgents: 0,
      activeWorkflows: 0,
      totalEvents: 0,
      totalTokens: 0,
      avgLatency: 0,
      errorRate: 0,
      lastUpdatedAt: Date.now(),
    };
  }

  private countErrors(): number {
    let count = 0;
    for (const metrics of this.agentMetrics.values()) {
      count += metrics.errorCount;
    }
    return count;
  }

  private countActiveWorkflows(): number {
    let count = 0;
    for (const metrics of this.workflowMetrics.values()) {
      count += metrics.activeCount;
    }
    return count;
  }

  private calculateAvgLatency(): number {
    let totalDuration = 0;
    let totalCalls = 0;

    for (const metrics of this.agentMetrics.values()) {
      totalDuration += metrics.totalDuration;
      totalCalls += metrics.callCount;
    }

    return totalCalls > 0 ? totalDuration / totalCalls : 0;
  }
}

/**
 * Agent 指标内部结构
 */
interface AgentMetricsInternal {
  agentId: string;
  callCount: number;
  successCount: number;
  errorCount: number;
  totalDuration: number;
  totalTokens: number;
  lastActiveAt: number;
}

/**
 * 工作流指标内部结构
 */
interface WorkflowMetricsInternal {
  graphId: string;
  executionCount: number;
  successCount: number;
  errorCount: number;
  totalDuration: number;
  totalTokens: number;
  activeCount: number;
  lastStartTime: number;
}