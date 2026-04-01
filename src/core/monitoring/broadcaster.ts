/**
 * 事件广播器
 * 
 * 负责将事件推送到多个订阅者（WebSocket、回调等）
 */

import { AgentEvent, SubscriptionConfig, WebSocketMessage } from './types';

/**
 * 事件订阅者
 */
interface Subscriber {
  id: string;
  config: SubscriptionConfig;
  callback: (event: AgentEvent) => void;
}

/**
 * WebSocket 连接
 */
interface WebSocketConnection {
  id: string;
  ws: any;
  config: SubscriptionConfig;
}

/**
 * 事件广播器
 */
export class EventBroadcaster {
  private eventHistory: Map<string, AgentEvent[]> = new Map();
  private subscribers: Map<string, Subscriber> = new Map();
  private wsConnections: Map<string, WebSocketConnection> = new Map();
  private historyLimit: number;
  private totalEvents: number = 0;

  constructor(historyLimit: number = 1000) {
    this.historyLimit = historyLimit;
  }

  /**
   * 广播事件
   */
  broadcast(threadId: string, event: AgentEvent): void {
    // 存储历史
    this.addToHistory(threadId, event);

    // 更新计数
    this.totalEvents++;

    // 发送给订阅者
    this.sendToSubscribers(threadId, event);

    // 发送给 WebSocket 连接
    this.sendToWebSockets(threadId, event);
  }

  /**
   * 添加到历史
   */
  private addToHistory(threadId: string, event: AgentEvent): void {
    if (!this.eventHistory.has(threadId)) {
      this.eventHistory.set(threadId, []);
    }

    const history = this.eventHistory.get(threadId)!;
    history.push(event);

    // 限制历史长度
    if (history.length > this.historyLimit) {
      history.shift();
    }
  }

  /**
   * 发送给订阅者
   */
  private sendToSubscribers(threadId: string, event: AgentEvent): void {
    for (const [id, subscriber] of this.subscribers) {
      // 检查过滤条件
      if (!this.matchesConfig(threadId, event, subscriber.config)) {
        continue;
      }

      try {
        subscriber.callback(event);
      } catch (error) {
        console.error(`[Broadcaster] Error in subscriber ${id}:`, error);
      }
    }
  }

  /**
   * 发送给 WebSocket 连接
   */
  private sendToWebSockets(threadId: string, event: AgentEvent): void {
    const message: WebSocketMessage = {
      type: 'event',
      data: event,
      timestamp: Date.now(),
    };

    for (const [id, connection] of this.wsConnections) {
      // 检查过滤条件
      if (!this.matchesConfig(threadId, event, connection.config)) {
        continue;
      }

      try {
        if (connection.ws.readyState === 1) { // WebSocket.OPEN
          connection.ws.send(JSON.stringify(message));
        }
      } catch (error) {
        console.error(`[Broadcaster] Error sending to WebSocket ${id}:`, error);
      }
    }
  }

  /**
   * 检查事件是否匹配配置
   */
  private matchesConfig(
    threadId: string,
    event: AgentEvent,
    config: SubscriptionConfig
  ): boolean {
    // 线程 ID 过滤
    if (config.threadId && config.threadId !== threadId) {
      return false;
    }

    // 图 ID 过滤
    if (config.graphId) {
      const graphId = (event as any).graphId;
      if (graphId && graphId !== config.graphId) {
        return false;
      }
    }

    // 事件类型过滤
    if (config.eventTypes && config.eventTypes.length > 0) {
      if (!config.eventTypes.includes(event.type)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 订阅事件
   */
  subscribe(config: SubscriptionConfig, callback: (event: AgentEvent) => void): string {
    const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.subscribers.set(id, {
      id,
      config,
      callback,
    });

    return id;
  }

  /**
   * 取消订阅
   */
  unsubscribe(subscriptionId: string): void {
    this.subscribers.delete(subscriptionId);
  }

  /**
   * 注册 WebSocket 连接
   */
  registerWebSocket(ws: any, config: SubscriptionConfig = {}): string {
    const id = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.wsConnections.set(id, {
      id,
      ws,
      config,
    });

    // 发送历史事件
    this.sendHistoryToWebSocket(id, config);

    // 监听关闭
    ws.on('close', () => {
      this.unregisterWebSocket(id);
    });

    return id;
  }

  /**
   * 注销 WebSocket 连接
   */
  unregisterWebSocket(connectionId: string): void {
    this.wsConnections.delete(connectionId);
  }

  /**
   * 发送历史事件到 WebSocket
   */
  private sendHistoryToWebSocket(connectionId: string, config: SubscriptionConfig): void {
    const connection = this.wsConnections.get(connectionId);
    if (!connection || !config.threadId) {
      return;
    }

    const history = this.eventHistory.get(config.threadId) || [];
    
    for (const event of history) {
      if (this.matchesConfig(config.threadId, event, config)) {
        try {
          connection.ws.send(JSON.stringify({
            type: 'event',
            data: event,
            timestamp: Date.now(),
          }));
        } catch (error) {
          console.error(`[Broadcaster] Error sending history:`, error);
          break;
        }
      }
    }
  }

  /**
   * 获取历史事件
   */
  getHistory(threadId: string): AgentEvent[] {
    return [...(this.eventHistory.get(threadId) || [])];
  }

  /**
   * 清除历史
   */
  clearHistory(threadId?: string): void {
    if (threadId) {
      this.eventHistory.delete(threadId);
    } else {
      this.eventHistory.clear();
    }
  }

  /**
   * 获取总事件数
   */
  getTotalEvents(): number {
    return this.totalEvents;
  }

  /**
   * 获取订阅者数量
   */
  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  /**
   * 获取 WebSocket 连接数量
   */
  getWebSocketCount(): number {
    return this.wsConnections.size;
  }

  /**
   * 关闭所有连接
   */
  close(): void {
    this.subscribers.clear();
    
    for (const [id, connection] of this.wsConnections) {
      try {
        connection.ws.close();
      } catch {}
    }
    
    this.wsConnections.clear();
  }
}