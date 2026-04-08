/**
 * 插件系统入口
 * 
 * 导出所有插件相关的类型和接口
 */

// 类型定义
export {
  type Plugin,
  type PluginMeta,
  type PluginContext,
  type PluginConfig,
  type PluginConfigItem,
  type PluginDependency,
  type PluginLogger,
  type PluginEventManager,
  type PluginServiceRegistry,
  type PluginLoader,
  type PluginManager,
  PluginState,
} from './types.js';

// 管理器
export { getPluginManager, PluginEventType } from './manager.js';

// 内置插件
export { ChatPlugin } from './builtin/chat/index.js';
export { AgentPlugin } from './builtin/agent/index.js';
export { CollabPlugin } from './builtin/collab/index.js';

// 插件加载
export { loadBuiltinPlugins, loadExternalPlugins } from './loader.js';