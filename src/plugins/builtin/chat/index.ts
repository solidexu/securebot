/**
 * 聊天插件
 * 
 * 提供聊天功能的核心插件
 */

import type { Plugin, PluginContext } from '../../types.js';
import { EventType } from '../../../core/event-bus.js';
import { useChatViewModel } from '../../../cli/tui/viewmodels/index.js';

export const ChatPlugin: Plugin = {
  meta: {
    id: 'core.chat',
    name: 'Chat',
    version: '1.0.0',
    description: 'Core chat functionality',
    author: 'SecureBot Team',
    tags: ['core', 'chat', 'ui'],
  },

  dependencies: [],

  configSchema: [
    {
      key: 'maxHistory',
      type: 'number',
      default: 100,
      description: 'Maximum message history count',
      validation: { min: 10, max: 1000 },
    },
    {
      key: 'autoScroll',
      type: 'boolean',
      default: true,
      description: 'Auto scroll to bottom on new message',
    },
    {
      key: 'dateFormat',
      type: 'string',
      default: 'HH:mm:ss',
      description: 'Date format for messages',
    },
  ],

  defaultConfig: {
    maxHistory: 100,
    autoScroll: true,
    dateFormat: 'HH:mm:ss',
  },

  activatesOn: {
    events: [EventType.UI_MESSAGE_ADD],
    commands: ['/chat', '/clear'],
  },

  async initialize(context: PluginContext): Promise<void> {
    context.logger.info('Chat plugin initializing');

    // 注册服务
    context.services.register('chatViewModel', useChatViewModel);
  },

  async activate(context: PluginContext): Promise<void> {
    context.logger.info('Chat plugin activated');

    // 监听消息事件
    context.events.subscribe(EventType.UI_MESSAGE_ADD, (data) => {
      const msg = data as { role: string; content: string };
      context.logger.debug('New message:', msg.role, msg.content.substring(0, 50));

      // 检查历史限制
      const maxHistory = context.config.maxHistory as number;
      // 实际限制逻辑在 Context 中处理
    });
  },

  async deactivate(context: PluginContext): Promise<void> {
    context.logger.info('Chat plugin deactivated');
  },

  async destroy(context: PluginContext): Promise<void> {
    context.logger.info('Chat plugin destroyed');
  },

  async onConfigChange(oldConfig: Record<string, unknown>, newConfig: Record<string, unknown>): Promise<void> {
    console.log('[ChatPlugin] Config changed:', oldConfig, '->', newConfig);
  },
};

// 注册为内置插件
import { registerBuiltinPlugin } from '../../loader.js';
registerBuiltinPlugin(ChatPlugin);