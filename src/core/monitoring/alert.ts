/**
 * 告警系统
 * 
 * 根据规则检测并发送告警
 */

import { AgentEvent, AlertRule, AlertEvent, AlertChannel } from './types';

/**
 * 告警处理器
 */
type AlertHandler = (event: AlertEvent) => Promise<void>;

/**
 * 告警系统
 */
export class AlertSystem {
  private rules: Map<string, AlertRule> = new Map();
  private handlers: Map<AlertChannel, AlertHandler> = new Map();
  private lastAlertTimes: Map<string, number> = new Map();
  private alertHistory: AlertEvent[] = [];
  private historyLimit: number;

  constructor(historyLimit: number = 100) {
    this.historyLimit = historyLimit;
    
    // 注册默认处理器
    this.registerHandler('log', this.logHandler);
  }

  /**
   * 添加告警规则
   */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * 移除告警规则
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * 获取所有规则
   */
  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 注册告警处理器
   */
  registerHandler(channel: AlertChannel, handler: AlertHandler): void {
    this.handlers.set(channel, handler);
  }

  /**
   * 检查事件是否触发告警
   */
  checkEvent(event: AgentEvent, context?: Record<string, unknown>): void {
    for (const [ruleId, rule] of this.rules) {
      if (!rule.enabled) continue;

      // 检查条件
      if (!this.evaluateCondition(rule.condition, event, context)) {
        continue;
      }

      // 检查冷却时间
      if (!this.checkCooldown(ruleId, rule.cooldown)) {
        continue;
      }

      // 触发告警
      this.triggerAlert(rule, event, context);
    }
  }

  /**
   * 评估条件表达式
   */
  private evaluateCondition(
    condition: string,
    event: AgentEvent,
    context?: Record<string, unknown>
  ): boolean {
    try {
      // 创建评估上下文
      const evalContext = {
        event,
        type: event.type,
        nodeId: (event as any).nodeId,
        graphId: (event as any).graphId,
        threadId: (event as any).threadId,
        error: (event as any).error,
        ...context,
      };

      // 使用 Function 构造器评估
      const fn = new Function(
        'ctx',
        `with(ctx) { return ${condition}; }`
      );
      
      return fn(evalContext);
    } catch (error) {
      console.error(`[AlertSystem] Error evaluating condition:`, error);
      return false;
    }
  }

  /**
   * 检查冷却时间
   */
  private checkCooldown(ruleId: string, cooldown?: number): boolean {
    if (!cooldown) return true;

    const lastTime = this.lastAlertTimes.get(ruleId) || 0;
    const now = Date.now();
    
    return now - lastTime >= cooldown;
  }

  /**
   * 触发告警
   */
  private async triggerAlert(
    rule: AlertRule,
    event: AgentEvent,
    context?: Record<string, unknown>
  ): Promise<void> {
    const alertEvent: AlertEvent = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message: this.generateMessage(rule, event),
      context: { event, ...context },
      timestamp: Date.now(),
    };

    // 更新最后告警时间
    this.lastAlertTimes.set(rule.id, alertEvent.timestamp);

    // 添加到历史
    this.alertHistory.push(alertEvent);
    if (this.alertHistory.length > this.historyLimit) {
      this.alertHistory.shift();
    }

    // 发送到各渠道
    for (const channel of rule.channels) {
      const handler = this.handlers.get(channel);
      if (handler) {
        try {
          await handler(alertEvent);
        } catch (error) {
          console.error(`[AlertSystem] Error in handler ${channel}:`, error);
        }
      }
    }
  }

  /**
   * 生成告警消息
   */
  private generateMessage(rule: AlertRule, event: AgentEvent): string {
    const nodeId = (event as any).nodeId || 'unknown';
    const graphId = (event as any).graphId || 'unknown';
    const threadId = (event as any).threadId || 'unknown';

    return `[${rule.severity.toUpperCase()}] ${rule.name}
Agent: ${nodeId}
Workflow: ${graphId}
Thread: ${threadId}
Event: ${event.type}
Time: ${new Date(event.timestamp).toISOString()}`;
  }

  /**
   * 日志处理器
   */
  private logHandler: AlertHandler = async (event: AlertEvent) => {
    const prefix = `[AlertSystem:${event.severity}]`;
    console.warn(`${prefix} ${event.ruleName}: ${event.message}`);
  };

  /**
   * 获取告警历史
   */
  getAlertHistory(): AlertEvent[] {
    return [...this.alertHistory];
  }

  /**
   * 清除告警历史
   */
  clearHistory(): void {
    this.alertHistory = [];
  }
}

/**
 * 预定义告警规则
 */
export const PREDEFINED_RULES: AlertRule[] = [
  {
    id: 'agent_error',
    name: 'Agent 错误',
    condition: 'event.type === "node_error"',
    channels: ['log'],
    severity: 'high',
    enabled: true,
    cooldown: 60000, // 1 分钟
  },
  {
    id: 'workflow_failed',
    name: '工作流失败',
    condition: 'event.type === "workflow_complete" && event.error',
    channels: ['log'],
    severity: 'high',
    enabled: true,
    cooldown: 60000,
  },
  {
    id: 'high_latency',
    name: '高延迟告警',
    condition: 'event.type === "node_exit" && event.duration > 30000',
    channels: ['log'],
    severity: 'medium',
    enabled: true,
    cooldown: 300000, // 5 分钟
  },
];

/**
 * 创建飞书告警处理器
 */
export function createFeishuHandler(webhookUrl: string): AlertHandler {
  return async (event: AlertEvent) => {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'text',
          content: {
            text: `🚨 ${event.ruleName}\n\n${event.message}\n\nSeverity: ${event.severity}\nTime: ${new Date(event.timestamp).toLocaleString()}`,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('[FeishuAlert] Failed to send:', error);
    }
  };
}