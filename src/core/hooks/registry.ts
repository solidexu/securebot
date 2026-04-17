/**
 * Hook 注册器
 * 
 * 管理 Session Hook 的注册和执行
 */

import type { SessionHook, HookTrigger, HookContext, HookRegistry } from './types.js';

/**
 * Hook 注册器实现
 */
export class HookManager implements HookRegistry {
  private hooks: Map<HookTrigger, SessionHook[]> = new Map();

  constructor() {
    // 初始化所有触发点
    this.hooks.set('start', []);
    this.hooks.set('prompt', []);
    this.hooks.set('stop', []);
    this.hooks.set('end', []);
  }

  /**
   * 注册 Hook
   */
  register(hook: SessionHook): void {
    const triggerHooks = this.hooks.get(hook.trigger) || [];
    triggerHooks.push(hook);
    this.hooks.set(hook.trigger, triggerHooks);
    console.log(`[Hooks] Registered: ${hook.name} (trigger: ${hook.trigger})`);
  }

  /**
   * 获取指定触发点的 Hook 列表
   */
  getHooks(trigger: HookTrigger): SessionHook[] {
    return this.hooks.get(trigger) || [];
  }

  /**
   * 执行指定触发点的所有 Hook
   */
  async executeHooks(trigger: HookTrigger, context: HookContext): Promise<void> {
    const hooks = this.getHooks(trigger);
    
    if (hooks.length === 0) {
      return;
    }

    console.log(`[Hooks] Executing ${hooks.length} hooks for trigger: ${trigger}`);
    
    for (const hook of hooks) {
      try {
        await hook.execute(context);
      } catch (error) {
        console.error(`[Hooks] Error in ${hook.name}:`, error);
        // 继续执行其他 Hook，不中断
      }
    }
  }

  /**
   * 清除所有 Hook
   */
  clear(): void {
    this.hooks.set('start', []);
    this.hooks.set('prompt', []);
    this.hooks.set('stop', []);
    this.hooks.set('end', []);
  }
}

// 单例实例
let hookManager: HookManager | null = null;

/**
 * 获取 HookManager 单例
 */
export function getHookManager(): HookManager {
  if (!hookManager) {
    hookManager = new HookManager();
  }
  return hookManager;
}
