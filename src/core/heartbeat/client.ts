/**
 * Agent 心跳客户端
 * 
 * Agent 端用于发送心跳到心跳管理器
 */

import {
  AgentHeartbeat,
  AgentHeartbeatStatus,
  AgentMetrics,
  HeartbeatConfig,
  DEFAULT_HEARTBEAT_CONFIG,
} from './types';

/**
 * 心跳发送器接口
 */
export interface HeartbeatSender {
  send(heartbeat: AgentHeartbeat): Promise<void>;
}

/**
 * HTTP 心跳发送器
 */
export class HttpHeartbeatSender implements HeartbeatSender {
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async send(heartbeat: AgentHeartbeat): Promise<void> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(heartbeat),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('[HeartbeatClient] Failed to send heartbeat:', error);
      throw error;
    }
  }
}

/**
 * 本地心跳发送器（直接调用管理器）
 */
export class LocalHeartbeatSender implements HeartbeatSender {
  private manager: { receiveHeartbeat(heartbeat: AgentHeartbeat): void };

  constructor(manager: { receiveHeartbeat(heartbeat: AgentHeartbeat): void }) {
    this.manager = manager;
  }

  async send(heartbeat: AgentHeartbeat): Promise<void> {
    this.manager.receiveHeartbeat(heartbeat);
  }
}

/**
 * Agent 心跳客户端
 */
export class HeartbeatClient {
  private agentId: string;
  private sender: HeartbeatSender;
  private config: HeartbeatConfig;
  private timer?: ReturnType<typeof setInterval>;
  private currentTask?: string;
  private status: AgentHeartbeatStatus = 'idle';
  private isRunning = false;

  constructor(
    agentId: string,
    sender: HeartbeatSender,
    config?: Partial<HeartbeatConfig>
  ) {
    this.agentId = agentId;
    this.sender = sender;
    this.config = { ...DEFAULT_HEARTBEAT_CONFIG, ...config };
  }

  /**
   * 启动心跳
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // 立即发送一次
    this.sendHeartbeat();

    // 定时发送
    this.timer = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.interval);
  }

  /**
   * 停止心跳
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * 设置状态
   */
  setStatus(status: AgentHeartbeatStatus): void {
    this.status = status;
  }

  /**
   * 设置当前任务
   */
  setCurrentTask(taskId: string | undefined): void {
    this.currentTask = taskId;
    this.status = taskId ? 'working' : 'idle';
  }

  /**
   * 标记错误
   */
  markError(): void {
    this.status = 'error';
  }

  /**
   * 发送心跳
   */
  private async sendHeartbeat(): Promise<void> {
    const heartbeat: AgentHeartbeat = {
      agentId: this.agentId,
      status: this.status,
      currentTask: this.currentTask,
      metrics: await this.collectMetrics(),
      timestamp: Date.now(),
    };

    try {
      await this.sender.send(heartbeat);
    } catch (error) {
      console.error('[HeartbeatClient] Send failed:', error);
    }
  }

  /**
   * 收集指标
   */
  private async collectMetrics(): Promise<AgentMetrics> {
    const metrics: AgentMetrics = {};

    // Node.js 环境
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const mem = process.memoryUsage();
      metrics.memoryUsage = Math.round(mem.heapUsed / 1024 / 1024);
      
      const cpu = process.cpuUsage();
      metrics.cpuUsage = Math.round((cpu.user + cpu.system) / 1000000);
    }

    return metrics;
  }

  /**
   * 获取 Agent ID
   */
  getAgentId(): string {
    return this.agentId;
  }

  /**
   * 获取状态
   */
  getStatus(): AgentHeartbeatStatus {
    return this.status;
  }

  /**
   * 是否运行中
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

/**
 * 快捷方法：创建 HTTP 心跳客户端
 */
export function createHttpHeartbeatClient(
  agentId: string,
  endpoint: string,
  config?: Partial<HeartbeatConfig>
): HeartbeatClient {
  const sender = new HttpHeartbeatSender(endpoint);
  return new HeartbeatClient(agentId, sender, config);
}

/**
 * 快捷方法：创建本地心跳客户端
 */
export function createLocalHeartbeatClient(
  agentId: string,
  manager: { receiveHeartbeat(heartbeat: AgentHeartbeat): void },
  config?: Partial<HeartbeatConfig>
): HeartbeatClient {
  const sender = new LocalHeartbeatSender(manager);
  return new HeartbeatClient(agentId, sender, config);
}