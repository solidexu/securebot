/**
 * 确认系统事件处理器
 * 
 * 订阅确认结果事件，记录记住的决策
 */

import { eventBus, type EventHandler } from '../event-bus.js';
import { EventTypes, type ToolConfirmationResultEvent } from '../events.js';
import { getConfirmationManager } from '../confirmation.js';

/**
 * 设置确认事件处理器
 */
export function setupConfirmationHandlers(): () => void {
  const unsubscribers: Array<() => void> = [];

  // 确认结果事件 → 记住决策
  const handleConfirmationResult: EventHandler<ToolConfirmationResultEvent['payload']> = (event) => {
    if (!event.payload.remember) return;
    
    const confirmationManager = getConfirmationManager();
    const { toolName, arguments: args, rememberScope } = event.payload;
    
    // 记住决策（记住的决策默认是批准的）
    if (rememberScope === 'tool') {
      confirmationManager.rememberDecision(toolName, {}, 'tool');
    } else if (rememberScope === 'pattern') {
      confirmationManager.rememberDecision(toolName, args, 'pattern');
    } else {
      confirmationManager.rememberDecision(toolName, args, 'once');
    }
  };

  // 订阅事件
  unsubscribers.push(eventBus.subscribe(EventTypes.TOOL_CONFIRMATION_RESULT, handleConfirmationResult));

  // 返回取消所有订阅的函数
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
}