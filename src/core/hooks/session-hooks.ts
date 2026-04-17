import { reportHookError } from './error-reporter.js';
/**
 * Session Hook 实现
 * 
 * 4 个生命周期 Hook
 */

import type { SessionHook, HookContext } from './types.js';
import { getMemoryManager } from '../memory.js';

// ============ SessionStart Hook ============

/**
 * Session 开始 Hook
 * 注入历史上下文
 */
export const sessionStartHook: SessionHook = {
  name: 'session-start',
  trigger: 'start',

  async execute(context: HookContext): Promise<void> {
    const memoryManager = getMemoryManager();
    
    try {
      await memoryManager.initialize();
      
      // 获取工作记忆上下文
      const summary = await memoryManager.getContextSummary(context.agentId, 1000);
      
      if (summary) {
        console.log(`[Hook:start] Injected context for agent ${context.agentId} (${summary.length} chars)`);
      }
    } catch (error) {
      reportHookError('session-start', 'start', error, context);
      console.error('[Hook:start] Failed to inject context:', error);
    }
  },
};

// ============ UserPrompt Hook ============

/**
 * 用户输入 Hook
 * 记录 prompt 到 daily memory
 */
export const userPromptHook: SessionHook = {
  name: 'user-prompt',
  trigger: 'prompt',

  async execute(context: HookContext): Promise<void> {
    if (!context.prompt) return;
    
    const memoryManager = getMemoryManager();
    
    try {
      await memoryManager.initialize();
      
      // 记录用户输入
      await memoryManager.remember(
        context.agentId,
        `用户输入: ${context.prompt.slice(0, 200)}`,
        'conversation',
        2  // 低重要性，仅作为上下文参考
      );
      
      console.log(`[Hook:prompt] Recorded prompt for session ${context.sessionId}`);
    } catch (error) {
      reportHookError('user-prompt', 'prompt', error, context);
      console.error('[Hook:prompt] Failed to record prompt:', error);
    }
  },
};

// ============ Stop Hook ============

/**
 * 响应完成 Hook
 * 生成 session summary
 */
export const stopHook: SessionHook = {
  name: 'response-stop',
  trigger: 'stop',

  async execute(context: HookContext): Promise<void> {
    const memoryManager = getMemoryManager();
    
    try {
      await memoryManager.initialize();
      
      // 构建摘要内容
      const summaryParts: string[] = [];
      
      if (context.toolsUsed?.length) {
        summaryParts.push(`使用工具: ${context.toolsUsed.join(', ')}`);
      }
      
      if (context.response) {
        summaryParts.push(`响应摘要: ${context.response.slice(0, 100)}...`);
      }
      
      if (summaryParts.length > 0) {
        await memoryManager.remember(
          context.agentId,
          summaryParts.join('\n'),
          'task',
          3  // 中等重要性
        );
        
        console.log(`[Hook:stop] Generated summary for session ${context.sessionId}`);
      }
    } catch (error) {
      reportHookError('response-stop', 'stop', error, context);
      console.error('[Hook:stop] Failed to generate summary:', error);
    }
  },
};

// ============ End Hook ============

/**
 * Session 结束 Hook
 * 标记完成 + 触发 RAG 同步
 */
export const sessionEndHook: SessionHook = {
  name: 'session-end',
  trigger: 'end',

  async execute(context: HookContext): Promise<void> {
    const memoryManager = getMemoryManager();
    
    try {
      await memoryManager.initialize();
      
      // 记录 session 结束事件
      const duration = context.startTime && context.endTime 
        ? Math.round((context.endTime.getTime() - context.startTime.getTime()) / 1000)
        : 0;
      
      await memoryManager.remember(
        context.agentId,
        `Session ${context.sessionId} 完成 (耗时 ${duration}s)`,
        'event',
        2
      );
      
      console.log(`[Hook:end] Session ${context.sessionId} marked complete`);
      
      // 触发 RAG 同步（如果配置启用）
      // memoryManager.syncToRAG() 会自动在 remember 时触发（重要性 >= 4）
    } catch (error) {
      reportHookError('session-end', 'end', error, context);
      console.error('[Hook:end] Failed to mark session complete:', error);
    }
  },
};

// ============ 默认 Hook 注册 ============

/**
 * 注册默认 Hook
 */
export function registerDefaultHooks(): void {
  const { getHookManager } = require('./registry.js');
  const manager = getHookManager();
  
  manager.register(sessionStartHook);
  manager.register(userPromptHook);
  manager.register(stopHook);
  manager.register(sessionEndHook);
  
  console.log('[Hooks] Default hooks registered');
}
