/**
 * 插件加载器
 * 
 * 加载内置和外部插件
 */

import { getPluginManager } from './manager.js';
import type { Plugin } from './types.js';

// ============ 内置插件注册表 ============

const builtinPlugins: Map<string, Plugin> = new Map();

/**
 * 注册内置插件
 */
export function registerBuiltinPlugin(plugin: Plugin): void {
  builtinPlugins.set(plugin.meta.id, plugin);
}

// ============ 加载函数 ============

/**
 * 加载所有内置插件
 */
export async function loadBuiltinPlugins(): Promise<void> {
  const manager = getPluginManager();

  for (const [id, plugin] of builtinPlugins) {
    try {
      await manager.register(plugin);
      await manager.activate(id);
      console.log(`[Plugins] Loaded builtin plugin: ${id}`);
    } catch (error) {
      console.error(`[Plugins] Failed to load builtin plugin ${id}:`, error);
    }
  }
}

/**
 * 加载外部插件
 * 
 * @param pluginDir 插件目录路径
 */
export async function loadExternalPlugins(pluginDir: string): Promise<void> {
  const manager = getPluginManager();

  try {
    // 动态加载插件目录中的所有插件
    const fs = await import('fs/promises');
    const path = await import('path');

    const entries = await fs.readdir(pluginDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pluginPath = path.join(pluginDir, entry.name);
      const indexPath = path.join(pluginPath, 'index.js');

      try {
        // 检查插件入口文件是否存在
        await fs.access(indexPath);

        // 动态导入插件
        const pluginModule = await import(indexPath);
        const plugin: Plugin = pluginModule.default || pluginModule.plugin;

        if (!plugin || !plugin.meta) {
          console.warn(`[Plugins] Invalid plugin at ${pluginPath}`);
          continue;
        }

        await manager.register(plugin);
        console.log(`[Plugins] Loaded external plugin: ${plugin.meta.id}`);
      } catch (error) {
        console.error(`[Plugins] Failed to load plugin at ${pluginPath}:`, error);
      }
    }
  } catch (error) {
    console.error(`[Plugins] Failed to read plugin directory ${pluginDir}:`, error);
  }
}

/**
 * 热加载插件
 */
export async function hotLoadPlugin(pluginPath: string): Promise<void> {
  const manager = getPluginManager();

  try {
    const pluginModule = await import(pluginPath);
    const plugin: Plugin = pluginModule.default || pluginModule.plugin;

    if (!plugin || !plugin.meta) {
      throw new Error('Invalid plugin structure');
    }

    const { id } = plugin.meta;

    // 如果插件已存在，先卸载
    if (manager.getState(id) !== 'unregistered') {
      await manager.unregister(id);
    }

    await manager.register(plugin);
    await manager.activate(id);

    console.log(`[Plugins] Hot loaded plugin: ${id}`);
  } catch (error) {
    console.error(`[Plugins] Failed to hot load plugin at ${pluginPath}:`, error);
    throw error;
  }
}

// ============ 插件发现 ============

/**
 * 发现可用插件
 */
export async function discoverPlugins(pluginDir: string): Promise<string[]> {
  const discovered: string[] = [];

  try {
    const fs = await import('fs/promises');
    const path = await import('path');

    const entries = await fs.readdir(pluginDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pluginPath = path.join(pluginDir, entry.name);
      const indexPath = path.join(pluginPath, 'index.js');

      try {
        await fs.access(indexPath);
        discovered.push(pluginPath);
      } catch {
        // 跳过无效插件
      }
    }
  } catch (error) {
    console.error(`[Plugins] Failed to discover plugins:`, error);
  }

  return discovered;
}