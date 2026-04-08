/**
 * 插件管理器实现
 * 
 * 管理插件生命周期、依赖、配置
 */

import { v4 as uuidv4 } from 'uuid';
import { onEvent, emitEvent, EventType } from '../core/event-bus.js';
import {
  type Plugin,
  type PluginContext,
  type PluginConfig,
  type PluginMeta,
  PluginState,
  type PluginLogger,
  type PluginEventManager,
  type PluginServiceRegistry,
  type PluginManager,
  type PluginDependency,
} from './types.js';

// ============ 插件事件类型扩展 ============

export const PluginEventType = {
  PLUGIN_REGISTERED: 'plugin:registered',
  PLUGIN_LOADED: 'plugin:loaded',
  PLUGIN_ACTIVATED: 'plugin:activated',
  PLUGIN_DEACTIVATED: 'plugin:deactivated',
  PLUGIN_ERROR: 'plugin:error',
  PLUGIN_UNREGISTERED: 'plugin:unregistered',
} as const;

// ============ 插件上下文实现 ============

class PluginContextImpl implements PluginContext {
  meta: PluginMeta;
  state: PluginState;
  config: PluginConfig;
  logger: PluginLogger;
  events: PluginEventManager;
  services: PluginServiceRegistry;

  constructor(
    meta: PluginMeta,
    private manager: PluginManagerImpl
  ) {
    this.meta = meta;
    this.state = PluginState.REGISTERED;
    this.config = {};

    this.logger = {
      debug: (msg, ...args) => console.debug(`[${meta.id}]`, msg, ...args),
      info: (msg, ...args) => console.info(`[${meta.id}]`, msg, ...args),
      warn: (msg, ...args) => console.warn(`[${meta.id}]`, msg, ...args),
      error: (msg, ...args) => console.error(`[${meta.id}]`, msg, ...args),
    };

    this.events = {
      subscribe: (type, cb) => onEvent(type, cb),
      emit: (type, data) => emitEvent(type, data),
      emitAsync: async (type, data) => emitEvent(type, data),
    };

    this.services = {
      register: (name, service) => manager.registerService(meta.id, name, service),
      resolve: (name) => manager.resolveService(name),
      has: (name) => manager.hasService(name),
    };
  }

  setState(state: PluginState): void {
    const oldState = this.state;
    this.state = state;
    this.manager.notifyStateChange(this.meta.id, oldState, state);
  }

  updateConfig(config: PluginConfig): void {
    this.config = { ...this.config, ...config };
  }
}

// ============ 插件管理器实现 ============

class PluginManagerImpl implements PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private contexts: Map<string, PluginContextImpl> = new Map();
  private enabled: Map<string, boolean> = new Map();
  private configs: Map<string, PluginConfig> = new Map();
  private services: Map<string, Map<string, unknown>> = new Map();
  private stateListeners: Set<(id: string, old: PluginState, new_: PluginState) => void> = new Set();

  async register(plugin: Plugin): Promise<void> {
    const { id } = plugin.meta;

    if (this.plugins.has(id)) {
      throw new Error(`Plugin already registered: ${id}`);
    }

    // 检查依赖
    const depCheck = await this.checkDependencies(id);
    if (!depCheck.satisfied && plugin.dependencies) {
      const requiredMissing = plugin.dependencies
        .filter(d => !d.optional && depCheck.missing.includes(d.pluginId));
      if (requiredMissing.length > 0) {
        throw new Error(`Missing required dependencies: ${requiredMissing.map(d => d.pluginId).join(', ')}`);
      }
    }

    this.plugins.set(id, plugin);
    this.enabled.set(id, true);

    // 创建上下文
    const context = new PluginContextImpl(plugin.meta, this);
    this.contexts.set(id, context);

    // 初始化服务注册表
    this.services.set(id, new Map());

    // 设置默认配置
    if (plugin.defaultConfig) {
      this.configs.set(id, plugin.defaultConfig);
      context.updateConfig(plugin.defaultConfig);
    }

    // 初始化插件
    try {
      context.setState(PluginState.INITIALIZING);
      await plugin.initialize(context);
      context.setState(PluginState.LOADED);

      emitEvent(EventType.SYSTEM_LOG, {
        message: `Plugin registered: ${id}`,
        level: 'info',
      });
    } catch (error) {
      context.setState(PluginState.ERROR);
      throw error;
    }
  }

  async unregister(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    const context = this.contexts.get(pluginId);

    if (!plugin || !context) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    if (context.state === PluginState.ACTIVE) {
      await this.deactivate(pluginId);
    }

    try {
      context.setState(PluginState.UNLOADING);
      await plugin.destroy(context);
      context.setState(PluginState.UNREGISTERED);
    } catch (error) {
      context.setState(PluginState.ERROR);
      throw error;
    }

    this.plugins.delete(pluginId);
    this.contexts.delete(pluginId);
    this.enabled.delete(pluginId);
    this.configs.delete(pluginId);
    this.services.delete(pluginId);
  }

  async load(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    const context = this.contexts.get(pluginId);

    if (!plugin || !context) {
      throw new Error(`Plugin not registered: ${pluginId}`);
    }

    if (context.state !== PluginState.LOADED) {
      return; // 已经加载或正在初始化
    }

    try {
      context.setState(PluginState.INITIALIZING);
      await plugin.initialize(context);
      context.setState(PluginState.LOADED);
    } catch (error) {
      context.setState(PluginState.ERROR);
      throw error;
    }
  }

  async unload(pluginId: string): Promise<void> {
    await this.unregister(pluginId);
  }

  async activate(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    const context = this.contexts.get(pluginId);

    if (!plugin || !context) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    if (!this.enabled.get(pluginId)) {
      throw new Error(`Plugin is disabled: ${pluginId}`);
    }

    if (context.state === PluginState.ACTIVE) {
      return; // 已经激活
    }

    try {
      context.setState(PluginState.INITIALIZING);
      await plugin.activate(context);
      context.setState(PluginState.ACTIVE);
    } catch (error) {
      context.setState(PluginState.ERROR);
      throw error;
    }
  }

  async deactivate(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    const context = this.contexts.get(pluginId);

    if (!plugin || !context) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    if (context.state !== PluginState.ACTIVE) {
      return; // 未激活
    }

    try {
      context.setState(PluginState.STOPPING);
      await plugin.deactivate(context);
      context.setState(PluginState.STOPPED);
    } catch (error) {
      context.setState(PluginState.ERROR);
      throw error;
    }
  }

  async enable(pluginId: string): Promise<void> {
    this.enabled.set(pluginId, true);
    await this.activate(pluginId);
  }

  async disable(pluginId: string): Promise<void> {
    this.enabled.set(pluginId, false);
    await this.deactivate(pluginId);
  }

  async updateConfig(pluginId: string, config: PluginConfig): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    const context = this.contexts.get(pluginId);

    if (!plugin || !context) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    const oldConfig = context.config;
    const newConfig = { ...oldConfig, ...config };

    this.configs.set(pluginId, newConfig);
    context.updateConfig(newConfig);

    if (plugin.onConfigChange) {
      await plugin.onConfigChange(oldConfig, newConfig);
    }
  }

  getState(pluginId: string): PluginState {
    const context = this.contexts.get(pluginId);
    return context?.state || PluginState.UNREGISTERED;
  }

  getContext(pluginId: string): PluginContext | undefined {
    return this.contexts.get(pluginId);
  }

  getPlugin(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId);
  }

  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  getActivePlugins(): Plugin[] {
    return Array.from(this.plugins.values())
      .filter(p => this.getState(p.meta.id) === PluginState.ACTIVE);
  }

  findPlugins(query: {
    name?: string;
    tags?: string[];
    state?: PluginState;
  }): Plugin[] {
    return this.getAllPlugins().filter(p => {
      if (query.name && !p.meta.name.includes(query.name)) return false;
      if (query.tags && !query.tags.some(t => p.meta.tags?.includes(t))) return false;
      if (query.state && this.getState(p.meta.id) !== query.state) return false;
      return true;
    });
  }

  async checkDependencies(pluginId: string): Promise<{
    satisfied: boolean;
    missing: string[];
    conflicts: string[];
  }> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.dependencies) {
      return { satisfied: true, missing: [], conflicts: [] };
    }

    const missing: string[] = [];
    const conflicts: string[] = [];

    for (const dep of plugin.dependencies) {
      const depPlugin = this.plugins.get(dep.pluginId);
      if (!depPlugin) {
        missing.push(dep.pluginId);
      } else if (dep.version) {
        // 简化版本检查（仅检查前缀匹配）
        if (!depPlugin.meta.version.startsWith(dep.version)) {
          conflicts.push(`${dep.pluginId} (${depPlugin.meta.version} vs ${dep.version})`);
        }
      }
    }

    return {
      satisfied: missing.length === 0 && conflicts.length === 0,
      missing,
      conflicts,
    };
  }

  onPluginStateChange(
    callback: (pluginId: string, oldState: PluginState, newState: PluginState) => void
  ): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  // 内部方法：服务注册
  registerService(pluginId: string, name: string, service: unknown): void {
    const pluginServices = this.services.get(pluginId);
    if (pluginServices) {
      pluginServices.set(name, service);
    }
  }

  resolveService(name: string): unknown | undefined {
    for (const [, services] of this.services) {
      if (services.has(name)) {
        return services.get(name);
      }
    }
    return undefined;
  }

  hasService(name: string): boolean {
    for (const [, services] of this.services) {
      if (services.has(name)) {
        return true;
      }
    }
    return false;
  }

  // 内部方法：通知状态变更
  notifyStateChange(pluginId: string, oldState: PluginState, newState: PluginState): void {
    for (const listener of this.stateListeners) {
      listener(pluginId, oldState, newState);
    }
  }
}

// ============ 单例 ============

let instance: PluginManager | null = null;

export function getPluginManager(): PluginManager {
  if (!instance) {
    instance = new PluginManagerImpl();
  }
  return instance;
}