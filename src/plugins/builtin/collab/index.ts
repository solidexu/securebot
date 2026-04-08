/**
 * 协作插件
 * 
 * 提供 Agent 协作功能的核心插件
 */

import type { Plugin, PluginContext } from '../../types.js';
import { EventType } from '../../../core/event-bus.js';

export const CollabPlugin: Plugin = {
  meta: {
    id: 'core.collab',
    name: 'Collaboration',
    version: '1.0.0',
    description: 'Multi-agent collaboration and workflow',
    author: 'SecureBot Team',
    tags: ['core', 'collaboration', 'workflow'],
  },

  dependencies: [
    { pluginId: 'core.agent', version: '1.0', optional: false },
  ],

  configSchema: [
    {
      key: 'maxIterations',
      type: 'number',
      default: 100,
      description: 'Maximum workflow iterations',
      validation: { min: 1, max: 1000 },
    },
    {
      key: 'parallelExecution',
      type: 'boolean',
      default: true,
      description: 'Enable parallel agent execution',
    },
    {
      key: 'timeoutMs',
      type: 'number',
      default: 30000,
      description: 'Workflow timeout in milliseconds',
      validation: { min: 1000, max: 300000 },
    },
    {
      key: 'memorySharing',
      type: 'boolean',
      default: true,
      description: 'Enable cross-agent memory sharing',
    },
  ],

  defaultConfig: {
    maxIterations: 100,
    parallelExecution: true,
    timeoutMs: 30000,
    memorySharing: true,
  },

  activatesOn: {
    events: [
      EventType.WORKFLOW_START,
      EventType.WORKFLOW_NODE_START,
      EventType.WORKFLOW_NODE_END,
      EventType.WORKFLOW_END,
    ],
    commands: ['/collab', '/workflow', '/plan'],
  },

  async initialize(context: PluginContext): Promise<void> {
    context.logger.info('Collab plugin initializing');
  },

  async activate(context: PluginContext): Promise<void> {
    context.logger.info('Collab plugin activated');

    // 监听工作流事件
    context.events.subscribe(EventType.WORKFLOW_START, (data) => {
      const event = data as { workflowId: string };
      context.logger.info('Workflow started:', event.workflowId);
    });

    context.events.subscribe(EventType.WORKFLOW_NODE_START, (data) => {
      const event = data as { workflowId: string; nodeId: string; nodeName: string };
      context.logger.debug('Node started:', event.nodeName);
    });

    context.events.subscribe(EventType.WORKFLOW_NODE_END, (data) => {
      const event = data as { workflowId: string; nodeId: string; nodeName: string };
      context.logger.debug('Node completed:', event.nodeName);
    });

    context.events.subscribe(EventType.WORKFLOW_END, (data) => {
      const event = data as { workflowId: string };
      context.logger.info('Workflow ended:', event.workflowId);
    });

    context.events.subscribe(EventType.WORKFLOW_ERROR, (data) => {
      const event = data as { workflowId: string; error: string };
      context.logger.error('Workflow error:', event.workflowId, event.error);
    });
  },

  async deactivate(context: PluginContext): Promise<void> {
    context.logger.info('Collab plugin deactivated');
  },

  async destroy(context: PluginContext): Promise<void> {
    context.logger.info('Collab plugin destroyed');
  },

  async onConfigChange(oldConfig: Record<string, unknown>, newConfig: Record<string, unknown>): Promise<void> {
    console.log('[CollabPlugin] Config changed:', oldConfig, '->', newConfig);
  },
};

// 注册为内置插件
import { registerBuiltinPlugin } from '../../loader.js';
registerBuiltinPlugin(CollabPlugin);