/**
 * 记忆系统事件处理器
 * 
 * 订阅各类事件，自动记录到记忆系统
 */

import { eventBus, type EventHandler } from '../event-bus.js';
import { 
  EventTypes, 
  type UserMessageEvent, 
  type TaskCompleteEvent, 
  type ToolCallSuccessEvent,
  type MemoryRememberEvent,
} from '../events.js';
import { getMemoryManager } from '../memory.js';

/**
 * 设置记忆事件处理器
 */
export function setupMemoryHandlers(): () => void {
  const unsubscribers: Array<() => void> = [];

  // 用户消息 → 记录到记忆
  const handleUserMessage: EventHandler<UserMessageEvent['payload']> = async (event) => {
    const memoryManager = getMemoryManager();
    await memoryManager.remember(
      event.agentId,
      `用户请求: ${event.payload.message}`,
      'conversation'
    );
  };

  // 任务完成 → 记录到记忆
  const handleTaskComplete: EventHandler<TaskCompleteEvent['payload']> = async (event) => {
    const memoryManager = getMemoryManager();
    await memoryManager.remember(
      event.agentId,
      `完成任务: ${event.payload.taskDescription}`,
      'task'
    );
  };

  // 重要工具调用成功 → 记录到记忆
  const handleToolCallSuccess: EventHandler<ToolCallSuccessEvent['payload']> = async (event) => {
    const { toolName, arguments: args } = event.payload;
    
    // 只记录重要工具操作
    if (['write', 'edit', 'exec'].includes(toolName)) {
      const memoryManager = getMemoryManager();
      const target = args['path'] || args['command'] || '';
      const toolDesc = toolName === 'write' ? '写入文件' :
                      toolName === 'edit' ? '编辑文件' : '执行命令';
      
      await memoryManager.remember(
        event.agentId,
        `${toolDesc}: ${String(target).slice(0, 100)}`,
        'task'
      );
    }
  };

  // 记忆记录请求 → 直接记录
  const handleMemoryRemember: EventHandler<MemoryRememberEvent['payload']> = async (event) => {
    const memoryManager = getMemoryManager();
    await memoryManager.remember(
      event.agentId,
      event.payload.content,
      event.payload.type,
      event.payload.importance,
      event.payload.tags
    );
  };

  // 订阅事件
  unsubscribers.push(eventBus.subscribe(EventTypes.USER_MESSAGE, handleUserMessage));
  unsubscribers.push(eventBus.subscribe(EventTypes.TASK_COMPLETE, handleTaskComplete));
  unsubscribers.push(eventBus.subscribe(EventTypes.TOOL_CALL_SUCCESS, handleToolCallSuccess));
  unsubscribers.push(eventBus.subscribe(EventTypes.MEMORY_REMEMBER, handleMemoryRemember));

  // 返回取消所有订阅的函数
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
}