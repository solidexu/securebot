#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import { loadConfig, createDefaultConfig } from '../../core/config.js';
import { createAgents, getDefaultAgent, getOrCreateMainSession } from '../../core/agent.js';
import { OllamaAdapter } from '../../model/ollama.js';
import { addUserMessage, addAssistantMessage, buildSystemPrompt } from '../../core/session.js';
import { getAvailableTools, getAvailableToolNames } from '../../tools/index.js';
import { getSessionStorage } from '../../core/session-storage.js';
import { getMemoryManager } from '../../core/memory.js';
import { getSkillManager } from '../../core/skills.js';
import type { StreamCallback } from '../../model/ollama.js';

export interface TuiOptions {
  defaultAgent?: string;
  model?: string;
}

/**
 * 创建 TUI 消息处理器（连接真实模型）
 */
function createMessageHandler(options: TuiOptions) {
  let config: ReturnType<typeof loadConfig>;
  let agents: ReturnType<typeof createAgents> | null = null;
  let modelAdapter: OllamaAdapter | null = null;
  let initialized = false;

  return async function onMessage(
    message: string,
    context: {
      setCurrentAgent?: (id: string) => void;
      setIsStreaming?: (v: boolean) => void;
      updateMessage?: (id: string, content: string) => void;
      addMessage?: (msg: any) => string;
      setTaskStatus?: (status: any) => void;
      addLog?: (msg: string, level?: string) => void;
      currentAgent?: string;
    }
  ): Promise<void> {
    const {
      setCurrentAgent,
      setIsStreaming,
      updateMessage,
      addMessage,
      setTaskStatus,
      addLog,
      currentAgent,
    } = context;

    // 延迟初始化（首次消息时）
    if (!initialized) {
      try {
        config = loadConfig();
      } catch {
        createDefaultConfig();
        config = loadConfig();
      }

      agents = createAgents(config);

      // 创建模型适配器
      modelAdapter = new OllamaAdapter({
        baseUrl: config.model.baseUrl ?? undefined,
        defaultModel: options.model ?? config.model.model,
      });

      // 检查 Ollama 连接
      const healthCheck = await modelAdapter.healthCheck();
      if (!healthCheck.ok) {
        addMessage?.({
          sender: 'System',
          content: `无法连接到 Ollama (${config.model.baseUrl || 'http://localhost:11434'})\n请确保 Ollama 正在运行`,
          type: 'error',
        });
        return;
      }

      // 初始化会话存储
      const sessionStorage = getSessionStorage();
      await sessionStorage.initialize();

      // 初始化记忆
      const memoryManager = getMemoryManager();
      await memoryManager.initialize();

      initialized = true;
    }

    if (!agents || !modelAdapter) return;

    // 获取当前 Agent
    const agentId = currentAgent || options.defaultAgent || config.defaultAgent;
    const agent = agents.get(agentId) ?? getDefaultAgent(agents);
    if (!agent) {
      addMessage?.({
        sender: 'System',
        content: `错误: 找不到 Agent ${agentId}`,
        type: 'error',
      });
      return;
    }

    // 获取或创建会话
    const session = getOrCreateMainSession(agent);
    addUserMessage(session, message);

    // 获取可用工具
    const availableTools = getAvailableTools(agent, config.tools);

    // 加载技能提示词
    const skillManager = getSkillManager();
    const skillsPrompt = await skillManager.buildSkillsPrompt(agent.id, agent.skills);

    // 构建系统提示
    const systemPrompt = await buildSystemPrompt(
      agent,
      config,
      getAvailableToolNames(agent, config.tools),
      skillsPrompt
    );

    // 构建消息列表
    const messages: import('../../core/types.js').Message[] = [
      { role: 'system', content: systemPrompt },
      ...session.history,
    ];

    // 设置流式状态
    setIsStreaming?.(true);
    setTaskStatus?.({
      id: `task-${Date.now()}`,
      task: message.slice(0, 50),
      status: 'running',
      delegator: 'user',
      delegatee: agentId,
      round: 1,
      maxRounds: 5,
    });

    // 流式输出回调
    const messageId = addMessage?.({
      sender: agent.name || agentId,
      content: '',
      type: 'agent',
    }) || '';

    let fullContent = '';

    const onStream: StreamCallback = (chunk) => {
      if (chunk.content) {
        fullContent += chunk.content;
        updateMessage?.(messageId, fullContent);
      }
    };

    try {
      // 调用模型（流式）
      const result = await modelAdapter.chatWithStream({
        model: config.model.model,
        messages,
        tools: availableTools.length > 0 ? availableTools : undefined,
        onStream,
      });

      // 最终更新
      if (!result.content && fullContent) {
        result.content = fullContent;
      }

      // 更新消息最终内容
      updateMessage?.(messageId, result.content || '(空回复)');

      // 保存到会话
      addAssistantMessage(session, result.content || '');

      // 保存会话
      const sessionStorage = getSessionStorage();
      await sessionStorage.saveSession(session);

      // 更新任务状态
      setTaskStatus?.({
        id: `task-${Date.now()}`,
        task: message.slice(0, 50),
        status: 'completed',
        delegator: 'user',
        delegatee: agentId,
        round: 1,
        maxRounds: 5,
      });

      addLog?.(`Agent ${agent.name} 回复完成`, 'info');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      if ((error as Error).name === 'AbortError') {
        updateMessage?.(messageId, fullContent + '\n\n[已停止]');
        addLog?.('用户中断了生成', 'warn');
      } else {
        addMessage?.({
          sender: 'System',
          content: `请求失败: ${msg}`,
          type: 'error',
        });
        addLog?.(`模型调用失败: ${msg}`, 'error');
      }

      setTaskStatus?.({
        id: `task-${Date.now()}`,
        task: message.slice(0, 50),
        status: 'failed',
        delegator: 'user',
        delegatee: agentId,
        round: 1,
        maxRounds: 5,
      });
    } finally {
      setIsStreaming?.(false);
    }
  };
}

export async function startTuiRepl(options: TuiOptions = {}): Promise<void> {
  // 创建带真实模型调用的处理器
  const onMessage = createMessageHandler(options);

  const { waitUntilExit } = render(
    <App
      defaultAgent={options.defaultAgent || 'dev'}
      commands={['/help', '/exit', '/clear', '/agents', '/skills', '/status']}
      agents={['dev', 'support', 'analyst']}
      onMessage={onMessage}
    />
  );

  await waitUntilExit();
}

export { App } from './App.js';
export * from './types/index.js';
export * from './context/index.js';
export * from './components/index.js';
export * from './services/index.js';