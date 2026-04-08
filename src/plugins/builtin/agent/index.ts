/**
 * Agent 插件
 * 
 * 提供 Agent 管理功能的核心插件
 */

import type { Plugin, PluginContext } from '../../types.js';
import { EventType } from '../../../core/event-bus.js';
import { useAgentViewModel } from '../../../cli/tui/viewmodels/index.js';

export const AgentPlugin: Plugin = {
  meta: {
    id: 'core.agent',
    name: 'Agent',
    version: '1.0.0',
    description: 'Agent management and coordination',
    author: 'SecureBot Team',
    tags: ['core', 'agent', 'management'],
  },

  dependencies: [
    { pluginId: 'core.chat', version: '1.0', optional: false },
  ],

  configSchema: [
    {
      key: 'defaultAgent',
      type: 'string',
      default: 'dev',
      description: 'Default agent ID',
    },
    {
      key: 'autoSwitch',
      type: 'boolean',
      default: false,
      description: 'Auto switch agent based on context',
    },
    {
      key: 'maxAgents',
      type: 'number',
      default: 10,
      description: 'Maximum concurrent agents',
      validation: { min: 1, max: 50 },
    },
  ],

  defaultConfig: {
    defaultAgent: 'dev',
    autoSwitch: false,
    maxAgents: 10,
  },

  activatesOn: {
    events: [EventType.AGENT_START, EventType.AGENT_STOP],
    commands: ['/agent', '/agents', '/switch'],
  },

  async initialize(context: PluginContext): Promise<void> {
    context.logger.info('Agent plugin initializing');

    // 注册服务
    context.services.register('agentViewModel', useAgentViewModel);
  },

  async activate(context: PluginContext): Promise<void> {
    context.logger.info('Agent plugin activated');

    // 监听 Agent 事件
    context.events.subscribe(EventType.AGENT_START, (data) => {
      const event = data as { agentId: string };
      context.logger.debug('Agent started:', event.agentId);
    });

    context.events.subscribe(EventType.AGENT_STOP, (data) => {
      const event = data as { agentId: string };
      context.logger.debug('Agent stopped:', event.agentId);
    });

    context.events.subscribe(EventType.AGENT_ERROR, (data) => {
      const event = data as { agentId: string; error: string };
      context.logger.error('Agent error:', event.agentId, event.error);
    });
  },

  async deactivate(context: PluginContext): Promise<void> {
    context.logger.info('Agent plugin deactivated');
  },

  async destroy(context: PluginContext): Promise<void> {
    context.logger.info('Agent plugin destroyed');
  },

  async onConfigChange(oldConfig: Record<string, unknown>, newConfig: Record<string, unknown>): Promise<void> {
    console.log('[AgentPlugin] Config changed:', oldConfig, '->', newConfig);
    
    // 如果默认 Agent 改变，通知系统
    if (oldConfig.defaultAgent !== newConfig.defaultAgent) {
      context.logger.info('Default agent changed to:', newConfig.defaultAgent);
    }
  },
};

// 注册为内置插件
import { registerBuiltinPlugin } from '../../loader.js';
registerBuiltinPlugin(AgentPlugin);