#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import { loadConfig, createDefaultConfig } from '../../core/config.js';
import { createAgents, getDefaultAgent, getOrCreateMainSession } from '../../core/agent.js';
import { OllamaAdapter } from '../../model/ollama.js';
import {
  addUserMessage,
  addAssistantMessage,
  addToolResultMessage,
  buildSystemPrompt
} from '../../core/session.js';
import { getAvailableTools, getAvailableToolNames, executeTool } from '../../tools/index.js';
import { getSessionStorage } from '../../core/session-storage.js';
import { getMemoryManager } from '../../core/memory.js';
import { getSkillManager } from '../../core/skills.js';
import type { StreamCallback, ChatResult } from '../../model/ollama.js';

export interface TuiOptions {
  defaultAgent?: string;
  model?: string;
}

/** 最大工具调用轮次 */
const MAX_TOOL_ROUNDS = 10;

/**
 * 创建 TUI 消息处理器（连接真实模型 + 工具调用循环）
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

      modelAdapter = new OllamaAdapter({
        baseUrl: config.model.baseUrl ?? undefined,
        defaultModel: options.model ?? config.model.model,
      });

      const healthCheck = await modelAdapter.healthCheck();
      if (!healthCheck.ok) {
        addMessage?.({
          sender: 'System',
          content: `无法连接到 Ollama (${config.model.baseUrl || 'http://localhost:11434'})\n请确保 Ollama 正在运行`,
          type: 'error',
        });
        return;
      }

      const sessionStorage = getSessionStorage();
      await sessionStorage.initialize();

      const memoryManager = getMemoryManager();
      await memoryManager.initialize();

      initialized = true;
    }

    if (!agents || !modelAdapter) return;

    const agentId = currentAgent || options.defaultAgent || config.defaultAgent;
    const agent = agents.get(agentId) ?? getDefaultAgent(agents);
    if (!agent) {
      addMessage?.({ sender: 'System', content: `错误: 找不到 Agent ${agentId}`, type: 'error' });
      return;
    }

    const session = getOrCreateMainSession(agent);
    addUserMessage(session, message);

    const availableTools = getAvailableTools(agent, config.tools);

    const skillManager = getSkillManager();
    const skillsPrompt = await skillManager.buildSkillsPrompt(agent.id, agent.skills);

    const systemPrompt = await buildSystemPrompt(
      agent,
      config,
      getAvailableToolNames(agent, config.tools),
      skillsPrompt
    );

    setIsStreaming?.(true);
    setTaskStatus?.({
      id: `task-${Date.now()}`,
      task: message.slice(0, 50),
      status: 'running',
      delegator: 'user',
      delegatee: agentId,
      round: 1,
      maxRounds: MAX_TOOL_ROUNDS,
    });

    try {
      // === 工具调用循环 ===
      let messages: import('../../core/types.js').Message[] = [
        { role: 'system', content: systemPrompt },
        ...session.history,
      ];

      let round = 0;
      let hasToolCalls = true;
      let finalContent = '';
      let assistantMsgId = '';

      while (hasToolCalls && round < MAX_TOOL_ROUNDS) {
        round++;
        addLog?.(`[Round ${round}] 调用模型...`, 'info');

        // 创建/更新助手消息
        if (!assistantMsgId) {
          assistantMsgId = addMessage?.({
            sender: agent.name || agentId,
            content: '',
            type: round > 1 ? 'tool' : 'agent',
          }) || '';
        }

        let roundContent = '';

        const onStream: StreamCallback = (chunk) => {
          if (chunk.content) {
            roundContent += chunk.content;
            finalContent = finalContent ? finalContent + chunk.content : roundContent;
            updateMessage?.(assistantMsgId, finalContent);
          }
        };

        // 调用模型
        const result: ChatResult = await modelAdapter.chatWithStream({
          model: config.model.model,
          messages,
          tools: availableTools.length > 0 ? availableTools : undefined,
          onStream,
        });

        if (!result.content && !roundContent) {
          result.content = '(空回复)';
        }
        if (result.content && !roundContent) {
          roundContent = result.content;
          finalContent = result.content;
        }

        updateMessage?.(assistantMsgId, result.content || roundContent || '');

        // 检查是否有工具调用
        if (result.toolCalls && result.toolCalls.length > 0) {
          hasToolCalls = true;

          // 保存助手消息（含 tool_calls）
          addAssistantMessage(session, result.content || roundContent || '', result.toolCalls);

          // 展示并执行每个工具调用
          for (const tc of result.toolCalls) {
            const toolCallId = tc.id || `tc_${Date.now()}`;
            const argsStr = JSON.stringify(tc.arguments, null, 0);

            // 在UI中显示工具调用
            const toolMsgId = addMessage?.({
              sender: 'Tool',
              content: `[${tc.name}](${argsStr})`,
              type: 'tool',
              meta: { name: tc.name, arguments: tc.arguments },
            }) || '';

            addLog?.(`[Tool] ${tc.name}(${argsStr})`, 'info');
            updateMessage?.(toolMsgId, `[${tc.name}]${argsStr} ...执行中`);

            // 执行工具
            const toolResult = await executeTool(tc.name, tc.arguments, {
              agent,
              session,
              config,
            });

            // 显示结果摘要
            const resultPreview =
              typeof toolResult.content === 'string'
                ? toolResult.content.slice(0, 200) + (toolResult.content.length > 200 ? '...' : '')
                : JSON.stringify(toolResult.content).slice(0, 200);

            updateMessage?.(toolMsgId, `[${tc.name}]${argsStr}\n→ ${resultPreview}`);

            // 添加工具结果到会话历史
            addToolResultMessage(session, toolCallId, tc.name,
              typeof toolResult.content === 'string' ? toolResult.content : JSON.stringify(toolResult.content)
            );

            addLog?.(`[Tool] ${tc.name} → ${toolResult.success ? 'OK' : 'FAIL'}`, toolResult.success ? 'info' : 'error');

            if (!toolResult.success) {
              addMessage?.({
                sender: 'System',
                content: `工具 ${tc.name} 执行失败: ${toolResult.error}`,
                type: 'error',
              });
            }
          }

          // 更新消息列表用于下一轮
          messages = [
            { role: 'system', content: systemPrompt },
            ...session.history,
          ];

          // 重置以便下一轮创建新消息
          assistantMsgId = '';
          setTaskStatus?.({
            id: `task-${Date.now()}`,
            task: message.slice(0, 50),
            status: 'running',
            delegator: 'user',
            delegatee: agentId,
            round: round + 1,
            maxRounds: MAX_TOOL_ROUNDS,
          });
        } else {
          hasToolCalls = false;

          // 最终回复，保存到会话
          addAssistantMessage(session, result.content || roundContent || '');
        }
      }

      // 超过最大轮次提示
      if (round >= MAX_TOOL_ROUNDS && hasToolCalls) {
        addMessage?.({
          sender: 'System',
          content: `\n[达到最大工具调用轮次 ${MAX_TOOL_ROUNDS}, 已停止]`,
          type: 'warn',
        });
      }

      // 保存会话
      const sessionStorage = getSessionStorage();
      await sessionStorage.saveSession(session);

      setTaskStatus?.({
        id: `task-${Date.now()}`,
        task: message.slice(0, 50),
        status: 'completed',
        delegator: 'user',
        delegatee: agentId,
        round,
        maxRounds: MAX_TOOL_ROUNDS,
      });

      addLog?.(`Agent ${agent.name} 完成 (${round} rounds)`, 'info');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      if ((error as Error).name === 'AbortError') {
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
        maxRounds: MAX_TOOL_ROUNDS,
      });
    } finally {
      setIsStreaming?.(false);
    }
  };
}

export async function startTuiRepl(options: TuiOptions = {}): Promise<void> {
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
