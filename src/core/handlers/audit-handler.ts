/**
 * 审计系统事件处理器
 * 
 * 订阅工具调用事件，记录审计日志
 */

import { eventBus, type EventHandler } from '../event-bus.js';
import { EventTypes, type ToolCallSuccessEvent, type ToolCallFailureEvent } from '../events.js';
import { getAuditLogger } from '../audit.js';

/**
 * 设置审计事件处理器
 */
export function setupAuditHandlers(): () => void {
  const unsubscribers: Array<() => void> = [];

  // 工具调用成功
  const handleToolCallSuccess: EventHandler<ToolCallSuccessEvent['payload']> = (event) => {
    const auditLogger = getAuditLogger();
    auditLogger.logToolCall(
      event.agentId,
      event.sessionId,
      event.payload.toolName,
      event.payload.arguments,
      'success',
      undefined,
      event.payload.duration
    );
  };

  // 工具调用失败
  const handleToolCallFailure: EventHandler<ToolCallFailureEvent['payload']> = (event) => {
    const auditLogger = getAuditLogger();
    auditLogger.logToolCall(
      event.agentId,
      event.sessionId,
      event.payload.toolName,
      event.payload.arguments,
      'failure',
      event.payload.error,
      event.payload.duration
    );
  };

  // 订阅事件
  unsubscribers.push(eventBus.subscribe(EventTypes.TOOL_CALL_SUCCESS, handleToolCallSuccess));
  unsubscribers.push(eventBus.subscribe(EventTypes.TOOL_CALL_FAILURE, handleToolCallFailure));

  // 返回取消所有订阅的函数
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
}