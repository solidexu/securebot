/**
 * Nudge 集成工具
 * 
 * 用于将 SkillNudgeManager 集成到对话循环中
 */

import { getSkillNudgeManager, checkAndGenerateNudge, isSkillCreationTool } from './skill-nudge.js';
import { eventBus } from '../event-bus.js';
import { EventTypes } from '../events.js';

// ============ 工具调用追踪 ============

/**
 * 工具调用追踪处理器
 * 
 * 订阅工具调用事件，自动更新 Nudge 计数器
 */
export function setupNudgeIntegration(): () => void {
  const manager = getSkillNudgeManager();
  const unsubscribers: Array<() => void> = [];
  
  // 订阅工具调用成功事件
  const handleToolSuccess = (event: any) => {
    const { toolName, result } = event.payload || event;
    
    // 记录工具调用
    manager.onToolCall(toolName);
    
    // 如果是技能创建工具，重置计数器
    if (isSkillCreationTool(toolName)) {
      manager.reset();
    }
  };
  
  // 订阅对话回合事件
  const handleTurn = (event: any) => {
    manager.onTurn();
  };
  
  // 注册订阅（根据实际的事件类型调整）
  try {
    unsubscribers.push(
      eventBus.subscribe(EventTypes.TOOL_CALL_SUCCESS, handleToolSuccess)
    );
  } catch {
    // 事件类型可能不存在，使用 fallback
    console.warn('TOOL_CALL_SUCCESS event type not found, using fallback');
  }
  
  // 返回取消订阅函数
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
}

// ============ Nudge 生成辅助 ============

/**
 * 在 Assistant 响应后生成 Nudge
 * 
 * @param toolCalls - 本次响应的工具调用列表
 * @param context - 上下文信息
 * @returns - Nudge 内容或 null
 */
export function generateNudgeAfterResponse(
  toolCalls: Array<{ name: string; success: boolean; hadError?: boolean }>,
  context?: {
    previousErrors?: string[];
    taskComplexity?: 'simple' | 'medium' | 'complex';
  }
): string | null {
  const manager = getSkillNudgeManager();
  
  // 检查是否有错误修复
  const errorFixed = toolCalls.some(tc => tc.hadError && tc.success);
  
  // 为每个工具调用生成 Nudge（取最后一个）
  let nudge: string | null = null;
  
  for (const tc of toolCalls) {
    const toolNudge = checkAndGenerateNudge(manager, tc.name, {
      hadError: tc.hadError,
      wasSuccessful: tc.success,
    });
    
    if (toolNudge) {
      nudge = toolNudge;
    }
  }
  
  // 错误修复的额外 Nudge
  if (errorFixed) {
    const errorNudge = manager.triggerErrorFixNudge();
    if (errorNudge) {
      nudge = errorNudge;
    }
  }
  
  return nudge;
}

/**
 * 在系统提示中注入 Nudge
 * 
 * @param systemPrompt - 当前系统提示
 * @returns - 包含 Nudge 的系统提示（如果有）
 */
export function injectNudgeToPrompt(systemPrompt: string): string {
  const manager = getSkillNudgeManager();
  
  // 检查是否应该触发 Nudge
  const nudge = manager.triggerComplexTaskNudge();
  
  if (!nudge) return systemPrompt;
  
  // 在系统提示末尾添加 Nudge
  return systemPrompt + '\n\n' + nudge;
}

/**
 * 在用户消息中注入 Nudge（替代方案）
 * 
 * Hermes Agent 使用此方法：注入到用户消息而非系统提示
 * 保持系统提示稳定，便于缓存
 * 
 * @param userMessage - 用户消息
 * @returns - 包含 Nudge 的消息
 */
export function injectNudgeToUserMessage(userMessage: string): string {
  const manager = getSkillNudgeManager();
  
  const nudge = manager.triggerComplexTaskNudge();
  
  if (!nudge) return userMessage;
  
  // 在用户消息末尾添加 Nudge
  return userMessage + '\n\n' + nudge;
}

// ============ 手动触发 ============

/**
 * 手动触发技能创建 Nudge
 * 
 * 用于特殊场景（如用户请求总结）
 */
export function manualTriggerNudge(): string {
  return `
<skill-nudge>
[提醒] 建议将本次对话的成功经验保存为技能。

使用 create_skill 工具创建新技能，记录：
- 问题类型
- 解决方案
- 关键步骤
</skill-nudge>
`;
}

// ============ 配置更新 ============

/**
 * 从配置文件更新 Nudge 配置
 */
export function updateNudgeConfigFromSettings(settings: {
  skillNudgeInterval?: number;
  skillNudgeMinToolCalls?: number;
  skillNudgeOnErrorFix?: boolean;
}): void {
  const manager = getSkillNudgeManager();
  
  manager.updateConfig({
    interval: settings.skillNudgeInterval ?? 10,
    minToolCalls: settings.skillNudgeMinToolCalls ?? 5,
    onErrorFix: settings.skillNudgeOnErrorFix ?? true,
  });
}
