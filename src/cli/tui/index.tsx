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
import { ragManager } from '../../rag/tools.js';
import { getSkillDetector, type SkillMatchResult } from '../../core/skills.js';
import type { StreamCallback, ChatResult } from '../../model/ollama.js';
import { executeQuickCommand } from './utils/shell-commands.js';

export interface TuiOptions {
  defaultAgent?: string;
  model?: string;
}

/** 最大工具调用轮次 */
const MAX_TOOL_ROUNDS = 100;

/** 当前执行的中断控制器（Ctrl+C 可触发） */
let currentAbortController: AbortController | null = null;

/** 外部可调用的中断函数（供 App.tsx 的 Ctrl+C 使用） */
export function abortCurrentExecution(): boolean {
  if (currentAbortController && !currentAbortController.signal.aborted) {
    currentAbortController.abort();
    return true;  // 已中断正在执行的任务
  }
  return false;  // 没有正在执行的任务
}

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
      addMessage?: (msg: { sender: string; content: string; type: string; meta?: Record<string, unknown> }) => string;
      setTaskStatus?: (status: { phase: string; progress?: number; message?: string } | null) => void;
      addLog?: (msg: string, level?: string) => void;
      setSkills?: (skills: { id: string; name: string; active?: boolean }[]) => void;
      startCodeWriter?: (filePath: string, content: string) => Promise<void>;
      startCodeEditor?: (filePath: string, oldContent?: string, newContent?: string) => Promise<void>;
      startShellOutput?: (command: string, cwd?: string) => void;
      addShellOutput?: (type: 'stdout' | 'stderr', text: string) => void;
      finishShellOutput?: (exitCode: number | null) => void;
      closeShellOutput?: () => void;
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
      setSkills,
      startCodeWriter,
      startCodeEditor,
      startShellOutput,
      addShellOutput,
      finishShellOutput,
      closeShellOutput,
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

      const sessionStorage = getSessionStorage(config);
      await sessionStorage.initialize();

      const memoryManager = getMemoryManager(config);
      await memoryManager.initialize();

      // 初始化技能系统（加载元数据，供 SkillDetector 匹配使用）
      const initSkillManager = getSkillManager();
      await initSkillManager.initialize();

      // 初始化 RAG 系统（为每个启用了 RAG 的 agent 配置知识库）
      for (const [agentId, agent] of agents) {
        if (agent.rag?.enabled) {
          const ragConfig = agent.rag;
          ragManager.setAgentConfig(agentId, {
            enabled: true,
            knowledgeDirs: ragConfig.knowledgeDirs || [],
            embeddingModel: ragConfig.embeddingModel || 'all-minilm',
            chunkSize: ragConfig.chunkSize,
            chunkOverlap: ragConfig.chunkOverlap,
            topK: ragConfig.topK,
            minScore: ragConfig.minScore,
            enableRerank: ragConfig.enableRerank,
            rerankModel: ragConfig.rerankModel,
            enableQueryExpansion: ragConfig.enableQueryExpansion,
            queryExpansionModel: ragConfig.queryExpansionModel,
          });
          addLog?.(`RAG 已为 Agent ${agentId} 启用`, 'info');
        }
      }

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

    // === 快速 Shell 命令检测（与正常模式一致） ===
    // 支持: ls, pwd, cat, head, tail, git status 等命令直接执行
    const workspace = agent.workspace || process.cwd();
    const shellResult = executeQuickCommand(message, { workspace });
    
    if (shellResult) {
      // 是快速命令，显示结果后直接返回（不调用 LLM）
      addLog?.(`[Shell] ⚡ ${shellResult.description}`, 'info');
      
      if (shellResult.success && shellResult.output) {
        // 显示工作区路径和输出
        addMessage?.({
          sender: 'System',
          content: `⚡ ${shellResult.description}\n📁 ${workspace}\n\n${shellResult.output}`,
          type: 'tool',
        });
      } else if (!shellResult.success) {
        addMessage?.({
          sender: 'System',
          content: `执行失败: ${shellResult.error}`,
          type: 'error',
        });
      }
      
      addLog?.(`[Shell] 完成 (${shellResult.success ? 'OK' : 'FAIL'})`, shellResult.success ? 'info' : 'error');
      return;  // 快速命令已处理，不再走 LLM 流程
    }

    // === 技能检测 + 加载技能列表到UI ===
    const skillManager = getSkillManager();
    const skillDetector = getSkillDetector();
    let detectedSkill: SkillMatchResult | null = null;

    // 加载当前 Agent 的所有技能并推送到右侧面板
    try {
      const allSkills = await skillManager.getAgentSkills(agent.id);
      setSkills?.(allSkills.map(s => ({
        id: s.id,
        name: s.name || s.id,
        active: false,
      })));
    } catch (e) {
      addLog?.(`[Skill] 加载技能列表失败: ${e instanceof Error ? e.message : String(e)}`, 'warn');
    }

    // 意图检测匹配激活的技能
    try {
      const matchResults = await skillDetector.detect(message, agent.id);
      if (matchResults.length > 0) {
        detectedSkill = matchResults[0]!;
        addLog?.(`激活技能：${detectedSkill.skill.name} (${detectedSkill.method})`, 'info');
        addMessage?.({
          sender: 'System',
          content: `[技能：${detectedSkill.skill.name}]`,
          type: 'skill',
        });
        // 更新技能面板，标记当前激活的技能
        try {
          const allSkills = await skillManager.getAgentSkills(agent.id);
          setSkills?.(allSkills.map(s => ({
            id: s.id,
            name: s.name || s.id,
            active: s.id === detectedSkill!.skill.id,
          })));
        } catch { /* ignore */ }
      }
    } catch (e) {
      addLog?.(`[Skill] 检测跳过: ${e instanceof Error ? e.message : String(e)}`, 'warn');
    }

    const availableTools = getAvailableTools(agent, config.tools);

    // 如果检测到技能，优先加载该技能的完整内容
    let skillsPrompt: string;
    if (detectedSkill?.skill) {
      skillsPrompt = await skillManager.buildSkillsPrompt(agent.id, [detectedSkill.skill.id]);
      if (!skillsPrompt) {
        // 回退到所有技能
        skillsPrompt = await skillManager.buildSkillsPrompt(agent.id, agent.skills);
      }
    } else {
      skillsPrompt = await skillManager.buildSkillsPrompt(agent.id, agent.skills);
    }

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

    // 创建中断控制器（Ctrl+C 可触发中止）
    currentAbortController = new AbortController();
    const abortSignal = currentAbortController.signal;

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
        // 检查是否被 Ctrl+C 中断
        if (abortSignal.aborted) {
          addMessage?.({
            sender: 'System',
            content: '\n[用户中断] 执行已被 Ctrl+C 停止',
            type: 'warn',
          });
          addLog?.('执行被用户中断', 'warn');
          break;
        }
        round++;
        addLog?.(`[Round ${round}] 调用模型...`, 'info');

        // 创建/更新助手消息（只在有文本内容或第一轮时创建）
        let hasAssistantText = false;

        let roundContent = '';

        const onStream: StreamCallback = (chunk) => {
          if (chunk.content) {
            if (!hasAssistantText) {
              hasAssistantText = true;
            }
            roundContent += chunk.content;
            finalContent = finalContent ? finalContent + chunk.content : roundContent;
            // 延迟创建助手消息直到有内容
            if (!assistantMsgId && hasAssistantText) {
              assistantMsgId = addMessage?.({
                sender: agent.name || agentId,
                content: '',
                type: 'agent',
              }) || '';
            }
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

        // 判断是否有文本内容（排除纯工具调用无文本的情况）
        const hasContent = !!(result.content || roundContent);
        
        if (hasContent) {
          // 有文本内容：确保消息存在并更新
          if (!result.content && roundContent) {
            result.content = roundContent;
          }
          if (result.content && !roundContent) {
            roundContent = result.content;
            finalContent = result.content;
          }
          if (!assistantMsgId) {
            assistantMsgId = addMessage?.({
              sender: agent.name || agentId,
              content: result.content || roundContent || '',
              type: 'agent',
            }) || '';
          } else {
            updateMessage?.(assistantMsgId, result.content || roundContent || '');
          }
        }

        // 检查是否有工具调用
        if (result.toolCalls && result.toolCalls.length > 0) {
          hasToolCalls = true;

          // 保存助手消息（含 tool_calls）
          addAssistantMessage(session, result.content || roundContent || '', result.toolCalls);

          // 展示并执行每个工具调用
          for (const tc of result.toolCalls) {
            const toolCallId = tc.id || `tc_${Date.now()}`;
            const argsStr = JSON.stringify(tc.arguments, null, 0);
            let toolMsgId = '';
            // 提取文件路径（write/edit 工具共用）
            const filePath = tc.arguments?.path || '(unknown)';

            // write/edit 工具：启动代码编辑动画面板
            if ((tc.name === 'write' || tc.name === 'edit') && typeof tc.arguments?.content === 'string') {
              const codeLines = tc.arguments.content.split('\\\n').length;
              if (tc.name === 'write') {
                // 先发消息，再启动动画（await 暂停推理直到写入完成）
                toolMsgId = addMessage?.({
                  sender: 'Tool',
                  content: `[write] \u270F ${filePath} (${codeLines} lines)`,
                  type: 'tool',
                  meta: { name: tc.name, path: filePath, lineCount: codeLines },
                }) || '';
                await startCodeWriter?.(filePath, tc.arguments.content);
              } else {
                const oldContent = tc.arguments.old_content;
                toolMsgId = addMessage?.({
                  sender: 'Tool',
                  content: `[edit] \u270E ${filePath}`,
                  type: 'tool',
                  meta: { name: tc.name, path: filePath },
                }) || '';
                await startCodeEditor?.(filePath, oldContent, tc.arguments.content);
              }
            } else {
              // 其他工具：正常显示参数
              toolMsgId = addMessage?.({
                sender: 'Tool',
                content: `[${tc.name}](${argsStr})`,
                type: 'tool',
                meta: { name: tc.name, arguments: tc.arguments },
              }) || '';
            }

            addLog?.(`[Tool] ${tc.name}(${argsStr})`, 'info');

            // 执行工具（构建完整 ToolContext）
            const { getRootDir } = await import('../../core/config.js');
            const rootDir = getRootDir(config);
            
            // ★ 特殊处理 exec 工具：添加流式回调
            let toolResult;
            if (tc.name === 'exec') {
              // 启动 Shell 输出面板
              const execCommand = tc.arguments.command as string;
              const execCwd = tc.arguments.cwd as string | undefined;
              startShellOutput?.(execCommand, execCwd);
              
              // 动态导入 exec 工具，使用流式回调
              const { execTool, StreamCallbacks } = await import('../../tools/exec.js');
              const streamCallbacks: StreamCallbacks = {
                onStdout: (data) => {
                  addShellOutput?.('stdout', data);
                },
                onStderr: (data) => {
                  addShellOutput?.('stderr', data);
                },
              };
              
              // 执行工具（传递流式回调）
              toolResult = await executeTool(tc.name, { ...tc.arguments, streamCallbacks }, {
                agent,
                session,
                workspace: agent.workspace || process.cwd(),
                logger: console,
                allowedPaths: [rootDir],
              });
              
              // 完成 Shell 输出
              finishShellOutput?.(toolResult.metadata?.exitCode ?? null);
            } else {
              // 其他工具：正常执行
              toolResult = await executeTool(tc.name, tc.arguments, {
                agent,
                session,
                workspace: agent.workspace || process.cwd(),
                logger: console,
                allowedPaths: [rootDir],
              });
            }

            // 显示结果摘要
            const resultContent = typeof toolResult.content === 'string'
              ? toolResult.content
              : typeof toolResult.content !== 'undefined'
                ? JSON.stringify(toolResult.content)
                : toolResult.error || '(无结果)';

            const resultPreview =
              resultContent.slice(0, 200) + (resultContent.length > 200 ? '...' : '');

            // write/edit 工具：不把文件内容文本化输出到聊天（CodeEditor 面板已展示）
            // 其他工具：正常显示结果摘要
            if (tc.name === 'write' || tc.name === 'edit') {
              const status = toolResult.success ? '\u2713 done' : `\u2717 ${toolResult.error || 'FAIL'}`;
              updateMessage?.(toolMsgId, `[${tc.name}] ${filePath} ${status}`);
            } else {
              updateMessage?.(toolMsgId, `[${tc.name}]${argsStr}\n→ ${resultPreview}`);
            }

            // 添加工具结果到会话历史
            addToolResultMessage(session, toolCallId, tc.name, resultContent);

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
      currentAbortController = null;  // 清理中断控制器
    }
  };
}

export async function startTuiRepl(options: TuiOptions = {}): Promise<void> {
  // 预加载配置获取真实 agents 列表
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
  } catch {
    createDefaultConfig();
    config = loadConfig();
  }

  const realAgentIds = config.agents.map(a => a.id);
  const defaultAgentId = options.defaultAgent || config.defaultAgent || 'dev';

  // 初始化技能系统（提前加载元数据）
  const skillManager = getSkillManager();
  await skillManager.initialize();

  // 预加载默认 Agent 的技能列表
  let initialSkills: { id: string; name: string; active?: boolean }[] = [];
  try {
    const allSkills = await skillManager.getAgentSkills(defaultAgentId);
    initialSkills = allSkills.map(s => ({
      id: s.id,
      name: s.name || s.id,
      active: false,
    }));
  } catch { /* 启动时加载失败不阻塞 */ }

  const onMessage = createMessageHandler(options);

  // 切换到备用屏幕缓冲区（alternate screen），使 TUI 完全独立
  process.stdout.write('\x1b[?1049h');  // 进入备用屏幕

  // 启用 SGR 鼠标模式（支持滚轮）
  process.stdout.write('\x1b[?1006h');

  // 滚轮事件回调（由 InputBox 通过 props.onWheel 设置）
  let wheelCallback: ((deltaY: number) => void) | null = null;

  // 滚轮速度检测：记录上次滚轮事件时间戳
  let lastWheelTime = 0;
  const FAST_SCROLL_THRESHOLD_MS = 50; // 50ms 内连续滚动 = 快速滚动
  const SLOW_SCROLL_LINES = 1;   // 慢速滚动：每下 1 行
  const FAST_SCROLL_LINES = 5;   // 快速滚动：每下 5 行

  // 解析 SGR 滚轮事件: CSI < M <btn> ; <x> ; <y> M
  // 滚轮: btn=64(up) 或 65(down)
  let mouseBuffer = '';
  const mouseHandler = (chunk: Buffer) => {
    mouseBuffer += chunk.toString();
    const SGR_WHEEL_UP = 64;   // '@' char code
    const SGR_WHEEL_DOWN = 65; // 'A' char code

    // SGR 格式: \x1b[<M<btn>;<x>;<y>M
    // 匹配整个序列直到结尾的 M
    const sgrMatch = mouseBuffer.match(/\x1b\[<M(\d+)(;\d+;\d+)?M/);
    if (sgrMatch) {
      const btnCode = parseInt(sgrMatch[1], 10);
      // 清除已处理的数据
      mouseBuffer = mouseBuffer.slice(sgrMatch[0].length);

      // 检测滚轮速度
      const now = Date.now();
      const timeDelta = now - lastWheelTime;
      const isFastScroll = lastWheelTime > 0 && timeDelta < FAST_SCROLL_THRESHOLD_MS;
      const scrollLines = isFastScroll ? FAST_SCROLL_LINES : SLOW_SCROLL_LINES;
      lastWheelTime = now;

      if (btnCode === SGR_WHEEL_UP) {
        wheelCallback?.(-scrollLines); // 负数 = 向上滚动（显示更新的内容）
      } else if (btnCode === SGR_WHEEL_DOWN) {
        wheelCallback?.(scrollLines);  // 正数 = 向下滚动（显示更旧的内容）
      }
    } else {
      // 没有完整事件，清除旧数据（防止缓冲区无限增长）
      if (mouseBuffer.length > 20) {
        mouseBuffer = '';
      }
    }
  };

  // 导出滚轮回调设置函数（供 InputBox 使用）
  (global as any).__tuiWheelCallback = (cb: ((deltaY: number) => void) | null) => {
    wheelCallback = cb;
  };

  // 添加原始 stdin 监听（用于捕获滚轮事件，在 Ink 之前处理）
  process.stdin.on('data', mouseHandler);

  const { waitUntilExit, unmount, cleanup } = render(
    <App
      defaultAgent={defaultAgentId}
      commands={['/help', '/exit', '/clear', '/agents', '/skills', '/status']}
      agents={realAgentIds.length > 0 ? realAgentIds : ['dev']}
      onMessage={onMessage}
      initialSkills={initialSkills}
    />,
    { exitOnCtrlC: false }
  );

  await waitUntilExit();

  // 退出时：恢复正常屏幕 + 清理终端
  process.stdout.write('\x1b[?1049l');  // 恢复主屏幕
  process.stdout.write('\x1b[2J\x1b[H'); // 清屏 + 光标归位（保险）
  process.stdout.write('\x1b[?1006l');   // 禁用 SGR 鼠标模式
  process.stdin.removeListener('data', mouseHandler);
  delete (global as any).__tuiWheelCallback;

  unmount?.();
  cleanup?.();
}

export { App } from './App.js';
export * from './types/index.js';
export * from './context/index.js';
export * from './components/index.js';
export * from './services/index.js';
