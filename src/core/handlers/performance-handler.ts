/**
 * 性能监控事件处理器
 * 
 * 订阅所有事件，记录耗时统计
 */

import { eventBus, type EventHandler } from '../event-bus.js';
import type { BaseEvent } from '../events.js';

interface EventMetrics {
  count: number;
  totalTime: number;
  avgTime: number;
  maxTime: number;
  minTime: number;
}

/**
 * 性能监控器
 */
class PerformanceMonitor {
  private metrics: Map<string, EventMetrics> = new Map();
  private startTime: number = Date.now();
  private enabled: boolean = true;

  /**
   * 记录事件
   */
  recordEvent(event: BaseEvent): void {
    if (!this.enabled) return;

    const eventType = event.type;
    const now = Date.now();
    const elapsed = now - event.timestamp.getTime();

    const existing = this.metrics.get(eventType);
    if (existing) {
      existing.count++;
      existing.totalTime += elapsed;
      existing.avgTime = existing.totalTime / existing.count;
      existing.maxTime = Math.max(existing.maxTime, elapsed);
      existing.minTime = Math.min(existing.minTime, elapsed);
    } else {
      this.metrics.set(eventType, {
        count: 1,
        totalTime: elapsed,
        avgTime: elapsed,
        maxTime: elapsed,
        minTime: elapsed,
      });
    }
  }

  /**
   * 获取指标
   */
  getMetrics(): Map<string, EventMetrics> {
    return this.metrics;
  }

  /**
   * 获取摘要
   */
  getSummary(): {
    uptime: number;
    totalEvents: number;
    eventTypes: number;
    topEvents: Array<{ type: string; count: number; avgTime: number }>;
  } {
    let totalEvents = 0;
    const allMetrics: Array<{ type: string; count: number; avgTime: number }> = [];

    for (const [type, metrics] of this.metrics) {
      totalEvents += metrics.count;
      allMetrics.push({
        type,
        count: metrics.count,
        avgTime: Math.round(metrics.avgTime * 100) / 100,
      });
    }

    // 按次数排序
    allMetrics.sort((a, b) => b.count - a.count);
    const topEvents = allMetrics.slice(0, 10);

    return {
      uptime: Math.round((Date.now() - this.startTime) / 1000),
      totalEvents,
      eventTypes: this.metrics.size,
      topEvents,
    };
  }

  /**
   * 重置
   */
  reset(): void {
    this.metrics.clear();
    this.startTime = Date.now();
  }

  /**
   * 启用/禁用
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// 单例
const performanceMonitor = new PerformanceMonitor();

/**
 * 设置性能监控事件处理器
 */
export function setupPerformanceHandlers(): () => void {
  const unsubscribers: Array<() => void> = [];

  // 通用事件处理器 - 记录所有事件
  const handleAnyEvent: EventHandler = (event) => {
    performanceMonitor.recordEvent(event);
  };

  // 订阅所有事件类型（使用通配符模式）
  // 注意：这里订阅几种主要事件类型
  const eventTypes = [
    'user:message',
    'tool:call:start',
    'tool:call:success',
    'tool:call:failure',
    'task:start',
    'task:complete',
    'task:fail',
    'session:start',
    'session:end',
    'memory:remember',
  ];

  for (const eventType of eventTypes) {
    unsubscribers.push(eventBus.subscribe(eventType, handleAnyEvent));
  }

  // 返回取消所有订阅的函数
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
}

/**
 * 获取性能监控器
 */
export function getPerformanceMonitor(): PerformanceMonitor {
  return performanceMonitor;
}

/**
 * 打印性能报告
 */
export function printPerformanceReport(): void {
  const summary = performanceMonitor.getSummary();
  console.log('\n📊 性能监控报告');
  console.log('─'.repeat(50));
  console.log(`运行时间: ${summary.uptime}s`);
  console.log(`总事件数: ${summary.totalEvents}`);
  console.log(`事件类型: ${summary.eventTypes}`);
  console.log('\n高频事件 TOP 10:');
  for (const event of summary.topEvents) {
    console.log(`  ${event.type}: ${event.count} 次 (平均 ${event.avgTime}ms)`);
  }
  console.log('─'.repeat(50));
}