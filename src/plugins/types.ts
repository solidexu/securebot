/**
 * 插件系统核心接口
 * 
 * 定义插件生命周期、依赖、配置等
 */

import type { EventCallback, EventType } from '../core/event-bus.js';

// ============ 基础类型 ============

/**
 * 插件元数据
 */
export interface PluginMeta {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  license?: string;
  tags?: string[];
  icon?: string;
}

/**
 * 插件依赖
 */
export interface PluginDependency {
  pluginId: string;
  version?: string;
  optional?: boolean;
}

/**
 * 插件配置项
 */
export interface PluginConfigItem {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  default?: unknown;
  description?: string;
  required?: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
}

/**
 * 插件配置
 */
export interface PluginConfig {
  [key: string]: unknown;
}

// ============ 生命周期 ============

/**
 * 插件生命周期状态
 */
export enum PluginState {
  UNREGISTERED = 'unregistered',
  REGISTERED = 'registered',
  LOADED = 'loaded',
  INITIALIZING = 'initializing',
  ACTIVE = 'active',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error',
  UNLOADING = 'unloading',
}

/**
 * 插件上下文 - 插件运行时环境
 */
export interface PluginContext {
  meta: PluginMeta;
  state: PluginState;
  config: PluginConfig;
  logger: PluginLogger;
  events: PluginEventManager;
  services: PluginServiceRegistry;
}

/**
 * 插件日志接口
 */
export interface PluginLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * 插件事件管理
 */
export interface PluginEventManager {
  subscribe<T = unknown>(eventType: EventType, callback: EventCallback<T>): () => void;
  emit<T = unknown>(eventType: EventType, data: T): void;
  emitAsync<T = unknown>(eventType: EventType, data: T): Promise<void>;
}

/**
 * 插件服务注册表
 */
export interface PluginServiceRegistry {
  register(name: string, service: unknown): void;
  resolve<T = unknown>(name: string): T | undefined;
  has(name: string): boolean;
}

// ============ 插件接口 ============

/**
 * 插件主接口
 * 
 * 所有插件必须实现此接口
 */
export interface Plugin {
  /**
   * 插件元数据
   */
  meta: PluginMeta;

  /**
   * 插件依赖
   */
  dependencies?: PluginDependency[];

  /**
   * 插件配置定义
   */
  configSchema?: PluginConfigItem[];

  /**
   * 插件默认配置
   */
  defaultConfig?: PluginConfig;

  /**
   * 插件激活条件
   */
  activatesOn?: {
    events?: EventType[];
    commands?: string[];
    agents?: string[];
  };

  /**
   * 插件初始化
   */
  initialize(context: PluginContext): Promise<void>;

  /**
   * 插件激活
   */
  activate(context: PluginContext): Promise<void>;

  /**
   * 插件停用
   */
  deactivate(context: PluginContext): Promise<void>;

  /**
   * 插件销毁
   */
  destroy(context: PluginContext): Promise<void>;

  /**
   * 插件配置更新
   */
  onConfigChange?(oldConfig: PluginConfig, newConfig: PluginConfig): Promise<void>;
}

// ============ 插件加载器接口 ============

/**
 * 插件加载器
 */
export interface PluginLoader {
  /**
   * 加载插件
   */
  load(pluginId: string, entryPath: string): Promise<Plugin>;

  /**
   * 卸载插件
   */
  unload(pluginId: string): Promise<void>;

  /**
   * 检查插件是否已加载
   */
  isLoaded(pluginId: string): boolean;

  /**
   * 获取已加载插件
   */
  getLoadedPlugin(pluginId: string): Plugin | undefined;

  /**
   * 获取所有已加载插件
   */
  getAllLoadedPlugins(): Plugin[];
}

// ============ 插件管理器接口 ============

/**
 * 插件管理器
 */
export interface PluginManager {
  /**
   * 注册插件
   */
  register(plugin: Plugin): Promise<void>;

  /**
   * 注销插件
   */
  unregister(pluginId: string): Promise<void>;

  /**
   * 加载插件
   */
  load(pluginId: string): Promise<void>;

  /**
   * 卸载插件
   */
  unload(pluginId: string): Promise<void>;

  /**
   * 激活插件
   */
  activate(pluginId: string): Promise<void>;

  /**
   * 停用插件
   */
  deactivate(pluginId: string): Promise<void>;

  /**
   * 启用插件
   */
  enable(pluginId: string): Promise<void>;

  /**
   * 禁用插件
   */
  disable(pluginId: string): Promise<void>;

  /**
   * 更新插件配置
   */
  updateConfig(pluginId: string, config: PluginConfig): Promise<void>;

  /**
   * 获取插件状态
   */
  getState(pluginId: string): PluginState;

  /**
   * 获取插件上下文
   */
  getContext(pluginId: string): PluginContext | undefined;

  /**
   * 获取插件实例
   */
  getPlugin(pluginId: string): Plugin | undefined;

  /**
   * 获取所有插件
   */
  getAllPlugins(): Plugin[];

  /**
   * 获取所有活跃插件
   */
  getActivePlugins(): Plugin[];

  /**
   * 查找插件
   */
  findPlugins(query: {
    name?: string;
    tags?: string[];
    state?: PluginState;
  }): Plugin[];

  /**
   * 检查依赖
   */
  checkDependencies(pluginId: string): Promise<{
    satisfied: boolean;
    missing: string[];
    conflicts: string[];
  }>;

  /**
   * 获取插件生命周期事件
   */
  onPluginStateChange(
    callback: (pluginId: string, oldState: PluginState, newState: PluginState) => void
  ): () => void;
}