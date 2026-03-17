/**
 * 事件处理器入口
 * 
 * 统一初始化所有事件处理器
 */

import { setupAuditHandlers } from './audit-handler.js';
import { setupMemoryHandlers } from './memory-handler.js';
import { setupConfirmationHandlers } from './confirmation-handler.js';
import { eventBus } from '../event-bus.js';

let isInitialized = false;
let cleanupFunctions: Array<() => void> = [];

/**
 * 初始化所有事件处理器
 */
export function initializeEventHandlers(options?: {
  debug?: boolean;
}): void {
  if (isInitialized) {
    console.warn('[EventHandlers] Already initialized');
    return;
  }

  // 启用调试模式
  if (options?.debug) {
    eventBus.setDebug(true);
  }

  // 设置各子系统处理器
  cleanupFunctions.push(setupAuditHandlers());
  cleanupFunctions.push(setupMemoryHandlers());
  cleanupFunctions.push(setupConfirmationHandlers());

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

// 导出各处理器
export { setupAuditHandlers } from './audit-handler.js';
export { setupMemoryHandlers } from './memory-handler.js';
export { setupConfirmationHandlers } from './confirmation-handler.js';