/**
 * 技能创建提醒机制（周期性 Nudge）
 * 
 * 参考 Hermes Agent 的 skill_nudge_interval 设计
 * 在完成复杂任务后，提醒 Agent 创建技能以记录成功方案
 */

import type { EventBus } from '../event-bus.js';
import { EventTypes } from '../events.js';

// ============ 配置 ============

/**
 * Nudge 配置
 */
export interface SkillNudgeConfig {
  /** 触发间隔（工具调用次数） */
  interval: number;  // 默认 10
  
  /** 最小工具调用数（低于此数不触发） */
  minToolCalls: number;  // 默认 5
  
  /** 是否在错误修复后触发 */
  onErrorFix: boolean;  // 默认 true
  
  /** 是否在复杂任务完成后触发 */
  onComplexTask: boolean;  // 默认 true
  
  /** Nudge 内容模板 */
  nudgeTemplate?: string;
}

/**
 * 默认配置
 */
export const DEFAULT_NUDGE_CONFIG: SkillNudgeConfig = {
  interval: 10,
  minToolCalls: 5,
  onErrorFix: true,
  onComplexTask: true,
};

// ============ Nudge 内容模板 ============

/**
 * 默认 Nudge 模板
 */
export const DEFAULT_NUDGE_TEMPLATE = `
<skill-nudge>
[提醒] 本次任务涉及多次工具调用和问题解决。
如果这是一个成功的、可复用的解决方案，建议将其保存为技能。

使用 create_skill 工具创建新技能：
- id: 技能唯一标识（如 "fix-xxx-error"）
- name: 技能名称
- overview: 技能概述（用于智能匹配）
- keywords: 触发关键词（用逗号分隔）

创建后，下次遇到类似问题时会自动唤醒此技能。
</skill-nudge>
`;

/**
 * 错误修复 Nudge 模板
 */
export const ERROR_FIX_NUDGE_TEMPLATE = `
<skill-nudge>
[提醒] 刚刚解决了一个错误/问题。
如果这个解决方案有参考价值，建议创建技能记录：
- 错误类型
- 解决方法
- 关键步骤

使用 create_skill 保存，避免下次重复调试。
</skill-nudge>
`;

// ============ SkillNudgeManager ============

/**
 * 技能创建提醒管理器
 */
export class SkillNudgeManager {
  private config: SkillNudgeConfig;
  
  /** 自上次创建技能后的工具调用计数 */
  private toolCallCount = 0;
  
  /** 自上次创建技能后的对话回合 */
  private turnCount = 0;
  
  /** 是否已触发 Nudge（防止重复） */
  private nudgeTriggered = false;
  
  /** 上次触发时间 */
  private lastNudgeTime = 0;
  
  /** 事件总线（可选） */
  private eventBus?: EventBus;
  
  constructor(config?: Partial<SkillNudgeConfig>, eventBus?: EventBus) {
    this.config = { ...DEFAULT_NUDGE_CONFIG, ...config };
    this.eventBus = eventBus;
  }
  
  // ============ 计数器管理 ============
  
  /**
   * 记录工具调用
   */
  onToolCall(toolName: string): void {
    this.toolCallCount++;
    this.nudgeTriggered = false;  // 允许新的 Nudge
  }
  
  /**
   * 记录对话回合
   */
  onTurn(): void {
    this.turnCount++;
  }
  
  /**
   * 重置计数器（技能创建后）
   */
  reset(): void {
    this.toolCallCount = 0;
    this.turnCount = 0;
    this.nudgeTriggered = false;
  }
  
  // ============ Nudge 触发 ============
  
  /**
   * 检查是否应该触发 Nudge
   */
  shouldNudge(): boolean {
    // 已触发且未重置
    if (this.nudgeTriggered) return false;
    
    // 工具调用数不足
    if (this.toolCallCount < this.config.minToolCalls) return false;
    
    // 达到间隔
    if (this.toolCallCount >= this.config.interval) return true;
    
    return false;
  }
  
  /**
   * 触发复杂任务 Nudge
   */
  triggerComplexTaskNudge(): string | null {
    if (!this.config.onComplexTask) return null;
    if (!this.shouldNudge()) return null;
    
    this.nudgeTriggered = true;
    this.lastNudgeTime = Date.now();
    
    const template = this.config.nudgeTemplate || DEFAULT_NUDGE_TEMPLATE;
    
    // 发射事件
    this.emitNudgeEvent('complex_task', this.toolCallCount);
    
    return template;
  }
  
  /**
   * 触发错误修复 Nudge
   */
  triggerErrorFixNudge(): string | null {
    if (!this.config.onErrorFix) return null;
    
    // 错误修复独立计数，不依赖间隔
    this.nudgeTriggered = true;
    this.lastNudgeTime = Date.now();
    
    this.emitNudgeEvent('error_fix', this.toolCallCount);
    
    return ERROR_FIX_NUDGE_TEMPLATE;
  }
  
  /**
   * 获取当前计数状态（用于调试）
   */
  getStatus(): {
    toolCallCount: number;
    turnCount: number;
    nudgeTriggered: boolean;
    config: SkillNudgeConfig;
  } {
    return {
      toolCallCount: this.toolCallCount,
      turnCount: this.turnCount,
      nudgeTriggered: this.nudgeTriggered,
      config: this.config,
    };
  }
  
  // ============ 事件发射 ============
  
  /**
   * 发射 Nudge 事件
   */
  private emitNudgeEvent(type: 'complex_task' | 'error_fix', toolCount: number): void {
    if (!this.eventBus) return;
    
    try {
      this.eventBus.emit(EventTypes.SYSTEM_INFO, {
        type: 'skill_nudge',
        nudgeType: type,
        toolCallCount: toolCount,
        timestamp: Date.now(),
      });
    } catch {
      // 忽略事件发射错误
    }
  }
  
  // ============ 配置更新 ============
  
  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<SkillNudgeConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
  
  /**
   * 获取配置
   */
  getConfig(): SkillNudgeConfig {
    return { ...this.config };
  }
}

// ============ 单例 ============

let globalNudgeManager: SkillNudgeManager | null = null;

/**
 * 获取全局 Nudge 管理器
 */
export function getSkillNudgeManager(config?: Partial<SkillNudgeConfig>): SkillNudgeManager {
  if (!globalNudgeManager) {
    globalNudgeManager = new SkillNudgeManager(config);
  }
  return globalNudgeManager;
}

/**
 * 重置全局 Nudge 管理器（用于测试）
 */
export function resetSkillNudgeManager(): void {
  globalNudgeManager = null;
}

// ============ 工具集成 ============

/**
 * 检查工具名称是否为技能创建工具
 */
export function isSkillCreationTool(toolName: string): boolean {
  return toolName === 'create_skill' || toolName === 'skill_manage';
}

/**
 * 在工具调用后检查并返回 Nudge
 * 
 * 集成点：LLM 响应处理中
 */
export function checkAndGenerateNudge(
  manager: SkillNudgeManager,
  toolName: string,
  context?: {
    hadError?: boolean;
    wasSuccessful?: boolean;
  }
): string | null {
  // 记录工具调用
  manager.onToolCall(toolName);
  
  // 如果是技能创建工具，重置计数器
  if (isSkillCreationTool(toolName)) {
    manager.reset();
    return null;
  }
  
  // 检查是否需要 Nudge
  if (context?.hadError && context?.wasSuccessful) {
    // 错误修复成功
    return manager.triggerErrorFixNudge();
  }
  
  // 复杂任务检查
  return manager.triggerComplexTaskNudge();
}
