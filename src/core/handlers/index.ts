/**
 * 事件处理器入口
 * 
 * 统一初始化所有事件处理器
 */

import { setupAuditHandlers } from './audit-handler.js';
import { setupMemoryHandlers } from './memory-handler.js';
import { setupConfirmationHandlers } from './confirmation-handler.js';
import { setupPerformanceHandlers } from './performance-handler.js';
import { setupErrorHandlers } from './error-handler.js';
import { setupPersistenceHandlers } from './persistence-handler.js';
import { eventBus } from '../event-bus.js';

let isInitialized = false;
let cleanupFunctions: Array<() => void> = [];

export interface EventHandlerOptions {
  debug?: boolean;
  enablePerformance?: boolean;
  enableErrorTracking?: boolean;
  enablePersistence?: boolean;
}

/**
 * 初始化所有事件处理器
 */
export function initializeEventHandlers(options: EventHandlerOptions = {}): void {
  if (isInitialized) {
    console.warn('[EventHandlers] Already initialized');
    return;
  }

  // 启用调试模式
  if (options.debug) {
    eventBus.setDebug(true);
  }

  // 核心处理器（始终启用）
  cleanupFunctions.push(setupAuditHandlers());
  cleanupFunctions.push(setupMemoryHandlers());
  cleanupFunctions.push(setupConfirmationHandlers());

  // 可选处理器
  if (options.enablePerformance !== false) {
    cleanupFunctions.push(setupPerformanceHandlers());
  }

  if (options.enableErrorTracking !== false) {
    cleanupFunctions.push(setupErrorHandlers());
  }

  if (options.enablePersistence) {
    cleanupFunctions.push(setupPersistenceHandlers({ enabled: true }));
  }

  isInitialized = true;
  console.log('[EventHandlers] ✅ Initialized');
}

/**
 * 清理所有事件处理器
 */
export function cleanupEventHandlers(): void {
  cleanupFunctions.forEach(cleanup => cleanup());
  cleanupFunctions = [];
  isInitialized = false;
  console.log('[EventHandlers] 🧹 Cleaned up');
}

/**
 * 检查是否已初始化
 */
export function isEventHandlersInitialized(): boolean {
  return isInitialized;
}

/**
 * 打印监控报告
 */
export function printMonitoringReports(): void {
  const { printPerformanceReport } = require('./performance-handler.js');
  const { printErrorReport } = require('./error-handler.js');
  printPerformanceReport();
  printErrorReport();
}

// 导出各处理器
export { setupAuditHandlers } from './audit-handler.js';
export { setupMemoryHandlers } from './memory-handler.js';
export { setupConfirmationHandlers } from './confirmation-handler.js';
export { setupPerformanceHandlers } from './performance-handler.js';
export { getPerformanceMonitor, printPerformanceReport } from './performance-handler.js';
export { setupErrorHandlers } from './error-handler.js';
export { getErrorTracker, printErrorReport } from './error-handler.js';
export { setupPersistenceHandlers } from './persistence-handler.js';
export { getEventPersistence } from './persistence-handler.js';