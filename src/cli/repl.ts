/**
 * REPL (Read-Eval-Print Loop)
 * 
 * 交互式聊天界面，支持流式输出和会话持久化
 */

import * as readlinePromises from 'node:readline/promises';
import chalk from 'chalk';
import type { ReplState } from '../core/types.js';
import { loadConfig, createDefaultConfig } from '../core/config.js';
import { createAgents, parseAgentPrefix, getDefaultAgent, getOrCreateMainSession } from '../core/agent.js';
import { OllamaAdapter } from '../model/ollama.js';
import { getSessionStorage } from '../core/session-storage.js';
import { getInputHistoryManager } from '../core/input-history.js';
import { reconfigureMemoryManager } from '../core/memory.js';
import { ragManager } from '../rag/tools.js';
import { getSkillManager } from '../core/skills.js';
import { initializeEventHandlers } from '../core/handlers/index.js';
import { getConfirmationManager, type ConfirmationHandler } from '../core/confirmation.js';
import { getMemoryMonitor, type MemoryAlert } from '../core/memory-monitor.js';
import { handleCommand } from './repl-commands.js';
import { processMessage } from './repl-message.js';
import { loadPersistedSessions, saveAllSessions, showConfirmationDialog } from './repl-session.js';
import { ContextualHints, MessageFormatter } from './message-formatter.js';
import { DockerSandbox } from '../core/sandbox/index.js';
import { getRootDir } from '../core/config.js';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Config, Agent } from '../core/types.js';

// ============ 初始化函数 ============

/**
 * 初始化所有 Agent 的知识库目录
 */
async function initializeKnowledgeDirs(config: Config, agents: Map<string, Agent>): Promise<void> {
  const rootDir = getRootDir(config);
  
  for (const agent of agents.values()) {
    const knowledgeDir = join(rootDir, 'knowledge', agent.id);
    
    if (!existsSync(knowledgeDir)) {
      mkdirSync(knowledgeDir, { recursive: true });
      console.log(chalk.gray(`创建知识库目录: ${knowledgeDir}`));
    }
  }
}

// ============ REPL 启动 ============

interface ReplOptions {
  defaultAgent?: string;
  model?: string;
  noTools?: boolean;
  noSession?: boolean;
}

export async function startRepl(options: ReplOptions = {}): Promise<void> {
  // 加载配置
  let config;
  try {
    config = loadConfig();
  } catch {
    console.log(chalk.yellow('配置文件不存在，创建默认配置...'));
    createDefaultConfig();
    config = loadConfig();
  }

  // 创建 Agent
  const agents = createAgents(config);
  
  // ★ 初始化知识库目录
  await initializeKnowledgeDirs(config, agents);
  
  // 创建模型适配器
  const modelAdapter = new OllamaAdapter({
    baseUrl: config.model.baseUrl ?? undefined,
    defaultModel: options.model ?? config.model.model,
  });

  // 检查 Ollama 连接
  console.log(chalk.gray('检查 Ollama 连接...'));
  const healthCheck = await modelAdapter.healthCheck();
  if (!healthCheck.ok) {
    console.log(chalk.red('✗ 无法连接到 Ollama'));
    console.log(chalk.gray(`  Ollama 地址: ${config.model.baseUrl ?? 'http://localhost:11434'}`));
    if (healthCheck.error) {
      console.log(chalk.gray(`  错误: ${healthCheck.error}`));
    }
    console.log(chalk.gray('  请确保 Ollama 正在运行: ollama serve'));
    process.exit(1);
  }
  console.log(chalk.green('✓ Ollama 连接成功'));

  // 初始化会话存储
  const sessionStorage = getSessionStorage();
  await sessionStorage.initialize();

  // 初始化输入历史管理器
  const inputHistoryManager = getInputHistoryManager();
  await inputHistoryManager.initialize();

  // ★ 自动检测沙箱环境
  const dockerAvailable = await DockerSandbox.isDockerAvailable();
  
  if (dockerAvailable) {
    // 检查沙箱镜像是否存在
    try {
      const { execSync } = await import('node:child_process');
      execSync('docker image inspect securebot-sandbox:latest', { stdio: 'ignore' });
      console.log(chalk.green('✓ Docker 沙箱可用'));
    } catch {
      // 镜像不存在，提示用户初始化
      console.log(chalk.yellow('⚠ Docker 已安装但沙箱镜像未构建'));
      console.log(chalk.gray('  运行 `securebot sandbox init` 构建沙箱镜像'));
      console.log(chalk.gray('  当前使用路径过滤沙箱'));
    }
  } else {
    console.log(chalk.gray('沙箱模式: 路径过滤（Docker 不可用）'));
  }

  // 初始化记忆系统（使用 reconfigure 确保使用正确的配置路径）
  const memoryManager = reconfigureMemoryManager(config);
  await memoryManager.initialize();
  const memoryStats = memoryManager.getStats();
  console.log(chalk.green(`✓ 记忆系统就绪 (${memoryStats.totalEntries} 条记忆)`));
  console.log(chalk.gray(`  记忆目录: ${config.rootDir ?? '~/.securebot'}/memory`));

  // 初始化 RAG 并连接到记忆系统
  for (const agent of agents.values()) {
    if (agent.rag?.enabled) {
      // ★ 确保 knowledgeDirs 存在
      const knowledgeDirs = agent.rag.knowledgeDirs || [];
      for (const dir of knowledgeDirs) {
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
          console.log(chalk.gray(`创建知识库目录: ${dir}`));
        }
      }
      
      // 先设置配置
      ragManager.setAgentConfig(agent.id, {
        enabled: true,
        knowledgeDirs: knowledgeDirs,
        embeddingModel: agent.rag.embeddingModel || 'all-minilm',
        chunkSize: agent.rag.chunkSize,
        chunkOverlap: agent.rag.chunkOverlap,
        topK: agent.rag.topK,
        minScore: agent.rag.minScore,
        enableRerank: agent.rag.enableRerank,
        rerankModel: agent.rag.rerankModel,
        enableQueryExpansion: agent.rag.enableQueryExpansion,
        queryExpansionModel: agent.rag.queryExpansionModel,
      });
      
      try {
        const ragStore = await ragManager.getStore(agent);
        
        if (ragStore) {
          memoryManager.setRAGStore(ragStore);
          console.log(chalk.green(`✓ RAG 已连接到记忆系统 (Agent: ${agent.id})`));
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(chalk.yellow(`⚠ RAG 初始化失败: ${msg}`));
      }
    }
  }

  // 初始化技能系统
  const skillManager = getSkillManager();
  await skillManager.initialize();
  const publicSkills = await skillManager.listPublicSkills();
  if (publicSkills.length > 0) {
    console.log(chalk.green(`✓ 技能系统就绪 (${publicSkills.length} 个公共技能)`));
  }

  // 初始化确认管理器
  const confirmationManager = getConfirmationManager();

  // 初始化事件处理器
  initializeEventHandlers({ debug: false });
  console.log(chalk.green('✓ 事件系统就绪'));

  // 初始化内存监控
  const memoryMonitor = getMemoryMonitor({
    warning: 500,
    danger: 800,
    critical: 1000,
  });
  
  memoryMonitor.setAlertHandler((alert: MemoryAlert) => {
    console.log();
    if (alert.level === 'warning') {
      console.log(chalk.yellow(`⚠️ ${alert.message}`));
    } else if (alert.level === 'danger') {
      console.log(chalk.red(`🔴 ${alert.message}`));
      console.log(chalk.gray('  使用 /memory cleanup 清理内存'));
    } else {
      console.log(chalk.red.bold(`🚨 ${alert.message}`));
    }
    console.log();
  });
  
  memoryMonitor.start(15000);
  console.log(chalk.green('✓ 内存监控已启动'));

  // 加载持久化会话
  if (!options.noSession) {
    await loadPersistedSessions(agents, sessionStorage);
  }

  // 初始化状态
  const state: ReplState = {
    currentAgentId: options.defaultAgent ?? config.defaultAgent,
    config,
    agents,
    modelAdapter,
    tools: new Map(),
    running: true,
  };

  // 打印欢迎信息
  printWelcome(state);
  
  // 设置委派任务执行器
  const { getCollaborationManager } = await import('../core/collaboration.js');
  const rootDir = getRootDir(config);
  const collaborationManager = getCollaborationManager(undefined, rootDir);
  
  // 设置消息总线到委派管理器
  collaborationManager.getDelegationManager().setMessageBus(collaborationManager.getMessageBus());
  
  // 检查未读消息和待验收任务（重新加载以支持多进程同步）
  collaborationManager.getDelegationManager().reloadDelegations();
  
  const unreadMessages = collaborationManager.getMessageBus().getMessages(state.currentAgentId)
    .filter((m: any) => !m.read);
  const pendingReviewTasks = collaborationManager.getDelegationManager()
    .getDelegations(state.currentAgentId)
    .filter((d: any) => d.status === 'pending_review' && d.delegator === state.currentAgentId);
  
  if (unreadMessages.length > 0 || pendingReviewTasks.length > 0) {
    console.log();
    if (unreadMessages.length > 0) {
      console.log(chalk.cyan(`📬 您有 ${unreadMessages.length} 条未读消息，使用 /collab messages 查看`));
    }
    if (pendingReviewTasks.length > 0) {
      console.log(chalk.yellow.bold(`⏳ 您有 ${pendingReviewTasks.length} 个任务待验收！`));
      for (const task of pendingReviewTasks.slice(0, 3)) {
        const time = new Date(task.createdAt).toLocaleTimeString('zh-CN');
        console.log(chalk.white(`   • [${time}] → ${task.delegatee}: ${task.task.slice(0, 50)}...`));
      }
      console.log(chalk.cyan(`   输入 /collab 立即验收`));
    }
    console.log();
  }
  
  collaborationManager.getDelegationManager().setExecutor(async (delegation) => {
    try {
      // 关键：使用被委托者（delegatee）而不是当前 agent
      const delegateeAgent = state.agents.get(delegation.delegatee);
      
      if (!delegateeAgent) {
        console.error(chalk.red(`被委托者 ${delegation.delegatee} 不存在`));
        return null;
      }
      
      console.log(chalk.gray(`\n使用 ${delegateeAgent.name} (${delegation.delegatee}) 执行任务...`));
      
      // 构建完整任务提示
      let taskPrompt = delegation.task;
      if (delegation.reviewFeedback) {
        taskPrompt = `${delegation.task}\n\n注意：之前的执行结果未通过验收，反馈如下：\n${delegation.reviewFeedback}\n\n请根据反馈改进执行结果。`;
      }
      
      // 使用被委托者的 Agent 能力执行任务
      const result = await executeTaskWithAgent(state, delegateeAgent, taskPrompt, delegation);
      
      return result;
    } catch (error) {
      console.error('自动执行任务失败:', error);
      return null;
    }
  });
  
  console.log(chalk.green('✓ 委派任务执行队列已启动'));
  
  // 完整Agent任务执行器
  async function executeTaskWithAgent(
    state: ReplState,
    agent: any,
    task: string,
    delegation: any
  ): Promise<string | null> {
    const { getAvailableTools, executeTool } = await import('../tools/index.js');
    const { TaskMonitor } = await import('./task-monitor.js');
    
    // 使用共享工作空间
    const sharedWorkspace = delegation.sharedWorkspace;
    const originalWorkspace = agent.workspace;
    
    // 临时切换到共享工作空间（静默执行，不输出）
    if (sharedWorkspace) {
      agent.workspace = sharedWorkspace;
    }
    
    // 创建任务监控器（不启动独立面板）
    const monitor = new TaskMonitor({
      taskId: delegation.id,
      delegator: delegation.delegator,
      delegatee: delegation.delegatee,
      task: task
    });
    
    // 不调用 monitor.start()，避免独立面板占据界面
    // 执行进展通过系统消息发送到任务对话
    
    // 收集执行过程中的关键信息
    const executionLog = {
      workspace: sharedWorkspace || agent.workspace || process.cwd(),
      filesCreated: [] as string[],
      filesModified: [] as string[],
      commandsExecuted: [] as string[],
      testResults: [] as string[],
      keyOutputs: [] as string[],
      iterations: 0,
      toolCallsCount: 0,
    };
    
    try {
      // 获取Agent可用的工具
      const tools = getAvailableTools(agent, state.config.tools);
      const toolNames = tools.map((t: any) => t.name).join(', ');
      
      monitor.addEvent('message', {
        role: 'system',
        content: `可用工具: ${toolNames}`
      });
      
      // 构建系统提示
      const systemPrompt = agent.systemPrompt || '';
      
      // 执行多轮对话，支持工具调用
      const messages: any[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task }
      ];
      
      monitor.addEvent('message', {
        role: 'user',
        content: task
      });
      
      let finalResponse = '';
      let iterations = 0;
      const maxIterations = 20; // 最多20轮对话
      
      while (iterations < maxIterations) {
        // 检查是否被取消
        if (monitor.isCancelled()) {
          // 不需要调用 monitor.stop()
          return null;
        }
        
        // 检查是否有用户介入
        const intervention = monitor.getUserIntervention();
        if (intervention) {
          messages.push({
            role: 'user',
            content: `[人工介入] ${intervention}`
          });
          monitor.addEvent('message', {
            role: 'user',
            content: `[人工介入] ${intervention}`
          });
        }
        
        // 等待暂停解除
        while (monitor.isTaskPaused()) {
          await new Promise(resolve => setTimeout(resolve, 100));
          if (monitor.isCancelled()) {
            monitor.stop();
            return null;
          }
        }
        
        iterations++;
        monitor.addEvent('status_change', {
          from: `iteration_${iterations - 1}`,
          to: `iteration_${iterations}`
        });
        
        const params: any = {
          model: agent.model || state.config.model.model,
          messages,
          tools: tools.length > 0 ? tools : undefined,
        };
        
        const response = await state.modelAdapter.chat(params);
        
        if (!response) {
          break;
        }
        
        // 如果有工具调用，执行工具
        if (response.toolCalls && response.toolCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: response.content || '',
            toolCalls: response.toolCalls
          });
          
          if (response.content) {
            monitor.addEvent('message', {
              role: 'assistant',
              content: response.content
            });
          }
          
          for (const toolCall of response.toolCalls) {
            try {
              const tool = tools.find((t: any) => t.name === toolCall.name);
              if (!tool) {
                continue;
              }
              
              monitor.addEvent('tool_call', {
                tool: toolCall.name,
                args: toolCall.arguments
              });
              
              executionLog.toolCallsCount++;
              
              const toolResult = await executeTool(toolCall.name, toolCall.arguments, {
                agent,
                session: {} as any,
                workspace: process.cwd(),
                logger: console,
              });
              
              // 收集工具执行信息
              const toolArgs = toolCall.arguments as any;
              if (toolCall.name === 'write' && toolArgs?.file_path) {
                executionLog.filesCreated.push(toolArgs.file_path);
              } else if (toolCall.name === 'edit' && toolArgs?.file_path) {
                executionLog.filesModified.push(toolArgs.file_path);
              } else if (toolCall.name === 'exec' && toolArgs?.command) {
                const cmd = typeof toolArgs.command === 'string' ? toolArgs.command : '';
                executionLog.commandsExecuted.push(cmd);
                // 检测测试命令
                if (cmd.includes('test') || cmd.includes('pytest') || cmd.includes('jest')) {
                  executionLog.testResults.push(toolResult.content || '');
                }
              }
              
              // 收集重要输出（前200字符）
              if (toolResult.success && toolResult.content && toolResult.content.length > 50) {
                executionLog.keyOutputs.push(
                  `[${toolCall.name}] ${toolResult.content.slice(0, 200)}`
                );
              }
              
              monitor.addEvent('tool_result', {
                tool: toolCall.name,
                success: toolResult.success,
                result: toolResult.content,
                error: toolResult.error
              });
              
              messages.push({
                role: 'tool',
                name: toolCall.name,
                content: toolResult.success ? toolResult.content : `错误: ${toolResult.error}`,
                toolCallId: toolCall.id
              });
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              monitor.addEvent('error', {
                error: msg
              });
              messages.push({
                role: 'tool',
                name: toolCall.name,
                content: `执行失败: ${msg}`,
                toolCallId: toolCall.id
              });
            }
          }
        } else {
          // 没有工具调用，对话结束
          finalResponse = response.content || '';
          if (response.content) {
            monitor.addEvent('message', {
              role: 'assistant',
              content: response.content
            });
          }
          break;
        }
      }
      
      executionLog.iterations = iterations;
      
      if (iterations >= maxIterations) {
        monitor.addEvent('status_change', {
          from: 'iterating',
          to: 'max_iterations_reached'
        });
      }
      
      monitor.addEvent('complete', {
        result: finalResponse
      });
      
      // 等待一下让用户看到最终结果
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      monitor.stop();
      
      // 确保 stdin 完全恢复正常状态
      try {
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        // 清空输入缓冲区
        process.stdin.pause();
        process.stdin.resume();
      } catch {
        // 忽略错误
      }
      
      // 等待一小段时间确保终端状态恢复
      await new Promise(resolve => setTimeout(resolve, 100));
      
// 恢复 REPL 的 readline
    // 所有输出通过系统消息发送到任务对话
      
      // 生成详细的执行摘要
      const executionSummary = generateExecutionSummary(executionLog, finalResponse);
      return executionSummary;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // 错误信息通过系统消息发送到任务对话
      return null;
    } finally {
      // 恢复原来的工作空间
      if (sharedWorkspace && originalWorkspace) {
        agent.workspace = originalWorkspace;
        console.log(chalk.gray(`工作空间已恢复到: ${originalWorkspace}`));
      }
    }
  }

  // Ctrl+C 处理状态变量
  let ctrlCount = 0;
  let ctrlTimer: ReturnType<typeof setTimeout> | null = null;
  let isExiting = false;
  let lastInterruptTime = 0;
  let interruptHandled = false;
  let justInterrupted = false;

  // 创建 tab 补全函数
  const completer = (line: string): [string[], string] => {
    // 命令补全
    if (line.startsWith('/')) {
      const parts = line.split(/\s+/);
      const cmd = parts[0]?.toLowerCase();
      
      // 二级命令补全
      if (parts.length > 1 && cmd === '/collab') {
        const subCommands = [
          'status', 'messages', 'sent', 'inbox', 'tasks', 'delegate', 'review'
        ];
        const currentSub = parts[1] || '';
        const hits = subCommands.filter(sub => sub.startsWith(currentSub));
        return [hits.length ? hits.map(sub => `/collab ${sub}`) : subCommands.map(sub => `/collab ${sub}`), line];
      }
      
      // 一级命令补全
      const commands = [
        '/help', '/h', '/?', '/exit', '/quit', '/q',
        '/agent', '/agents', '/clear', '/reset', '/history',
        '/init-memory', '/init-rag', '/model', '/models',
        '/monitor', '/audit', '/plan', '/checkpoint',
        '/collab', '/errors', '/perf', '/summary',
        '/feedback', '/improve', '/skills', '/reload',
        '/config', '/status', '/memory', '/fact', '/rag',
        '/export', '/import', '/task', '/remember',
        '/patterns',
      ];
      const hits = commands.filter(c => c.startsWith(line));
      return [hits.length ? hits : commands, line];
    }
    
    // Agent 补全
    if (line.startsWith('@')) {
      const agentNames = Array.from(agents.keys()).map(id => `@${id}`);
      const hits = agentNames.filter(name => name.startsWith(line));
      return [hits.length ? hits : agentNames, line];
    }
    
    // 无补全
    return [[], line];
  };

  // 创建 readline 接口
  const rl = readlinePromises.createInterface({ 
    input: process.stdin, 
    output: process.stdout,
    completer,
    terminal: true,  // 启用终端模式，支持信号处理
    history: inputHistoryManager.getHistory(),
    historySize: 100,
  });
  
  // 使用 readline 的 SIGINT 事件（比 process.on 更可靠）
  rl.on('SIGINT', () => {
    if (isExiting) return;
    
    const now = Date.now();
    
    // 如果刚刚打断过，忽略所有后续信号（1秒内）
    if (justInterrupted && now - lastInterruptTime < 1000) {
      return;
    }
    justInterrupted = false;
    
    // 如果在执行中，打断操作
    if (state.executing && !interruptHandled) {
      console.log(chalk.yellow('\n[已打断当前操作]'));
      state.interrupted = true;
      if (state.abortController) {
        state.abortController.abort();
      }
      lastInterruptTime = now;
      interruptHandled = true;
      justInterrupted = true;
      ctrlCount = 0;
      
      setTimeout(() => { interruptHandled = false; }, 800);
      return;
    }
    
    // 非执行状态的 Ctrl+C 处理
    ctrlCount++;
    if (ctrlCount >= 2) {
      isExiting = true;
      console.log(chalk.gray('\n正在退出...'));
      state.running = false;
      rl.close();
      exitHandler().catch(() => {}).then(() => {
        setImmediate(() => process.exit(0));
      });
      return;
    }
    
    console.log(chalk.gray('\n按 Ctrl+C 再次退出，或输入 /help 查看帮助'));
    
    if (ctrlTimer) clearTimeout(ctrlTimer);
    ctrlTimer = setTimeout(() => { ctrlCount = 0; }, 1000);
  });
  
  // Ctrl+D (EOF) - 直接退出
  rl.on('close', () => {
    if (!isExiting) {
      isExiting = true;
      console.log(chalk.gray('\n正在退出...'));
      state.running = false;
      exitHandler().catch(() => {}).then(() => {
        process.exit(0);
      });
    }
  });

  // 设置确认处理器
  const confirmationHandler: ConfirmationHandler = async (request) => {
    return await showConfirmationDialog(request, rl);
  };
  confirmationManager.setHandler(confirmationHandler);

  // 注册退出处理
  const exitHandler = async () => {
    memoryMonitor.stop();
    await inputHistoryManager.saveHistory();
    await saveAllSessions(agents, sessionStorage);
  };
  
  // 全局 Ctrl+C 处理（作为 rl.on('SIGINT') 的补充）
  process.on('SIGINT', () => {
    // 如果 rl.on('SIGINT') 已经处理了，这里就不再处理
    // 这个处理器主要用于处理非 rl.question 状态下的 Ctrl+C
    if (isExiting) return;
    
    const now = Date.now();
    if (justInterrupted && now - lastInterruptTime < 1000) {
      return;
    }
    
    // 如果 rl 没有在等待输入，可能是流式输出中
    if (state.executing && !interruptHandled) {
      console.log(chalk.yellow('\n[已打断当前操作]'));
      state.interrupted = true;
      if (state.abortController) {
        state.abortController.abort();
      }
      lastInterruptTime = now;
      interruptHandled = true;
      justInterrupted = true;
      ctrlCount = 0;
      setTimeout(() => { interruptHandled = false; }, 800);
    }
  });
  
  process.on('SIGTERM', async () => {
    await exitHandler();
    process.exit(0);
  });
 
  // 主循环
  while (state.running) {
    try {
      const agent = agents.get(state.currentAgentId) ?? getDefaultAgent(agents);
      if (!agent) {
        console.log(chalk.red('错误: 找不到 Agent'));
        break;
      }

      // 构建提示符
      let prompt = chalk.cyan(`[${agent.name}]`);
      
      // 如果有正在进行的计划，显示进度
      const session = getOrCreateMainSession(agent);
      if (session.plan && session.plan.steps.some(s => s.status === 'pending' || s.status === 'in_progress')) {
        const completed = session.plan.steps.filter(s => s.status === 'completed').length;
        const inProgress = session.plan.steps.filter(s => s.status === 'in_progress').length;
        const done = completed + inProgress;
        const total = session.plan.steps.length;
        prompt += chalk.gray(` [${done}/${total}]`);
      }
      
      prompt += chalk.cyan(' > ');
      
      const inputLine = await rl.question(prompt);

      if (!inputLine.trim()) {
        // 空行时显示上下文感知提示
        const hint = ContextualHints.getSuggestion('waiting');
        if (hint) {
          console.log(hint);
        } else {
          console.log(chalk.gray('提示: 输入消息开始对话，/help 查看命令，@<agent> 切换 Agent'));
        }
        continue;
      }

      // 添加到输入历史
      inputHistoryManager.addEntry(inputLine.trim());

      // 处理命令
      if (inputLine.startsWith('/')) {
        // 检查是否有上下文提示
        const hint = ContextualHints.getHint(inputLine);
        if (hint) {
          console.log(hint);
        }
        await handleCommand(state, inputLine.trim(), rl, sessionStorage);
        continue;
      }

      // 解析 @ 前缀
      const { agentId, message } = parseAgentPrefix(inputLine);
      
      if (agentId) {
        const targetAgent = agents.get(agentId);
        if (targetAgent) {
          state.currentAgentId = agentId;
          console.log();
          console.log(chalk.cyan('┌─────────────────────────────────────┐'));
          console.log(chalk.cyan('│') + chalk.white.bold(`  🤖 正在与 ${targetAgent.name} 对话`).padEnd(37) + chalk.cyan('│'));
          console.log(chalk.cyan('└─────────────────────────────────────┘'));
          console.log();
          
          const memStatus = await memoryManager.isAgentInitialized(agentId);
          if (!memStatus.initialized) {
            console.log(chalk.gray(`💡 使用 /init-memory 初始化记忆系统`));
          }
          
          const ragConfig = targetAgent.rag;
          if (ragConfig?.enabled) {
            console.log(chalk.gray(`📚 RAG 已配置: ${ragConfig.embeddingModel || 'all-minilm'}`));
          }
          
          if (message.trim()) {
            await processMessage(state, targetAgent, message.trim(), rl, sessionStorage);
          }
        } else {
          console.log(chalk.red(`Agent 不存在: ${agentId}`));
          console.log(chalk.gray(`可用 Agent: ${Array.from(agents.keys()).join(', ')}`));
        }
      } else {
        await processMessage(state, agent, message, rl, sessionStorage);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : '';
      
      // 如果是打断操作导致的错误，忽略它，继续主循环
      const isAbortError = 
        state.interrupted ||
        errorName === 'AbortError' ||
        errorMsg.toLowerCase().includes('abort');
      
      if (isAbortError) {
        state.interrupted = false;
        state.executing = false;
        continue;
      }
      
      if (errorName === 'ERR_USE_AFTER_CLOSE' || errorMsg.includes('readline was closed')) {
        console.log(chalk.yellow('\n程序正在退出...'));
        state.running = false;
        break;
      }
      
      console.log();
      console.log(MessageFormatter.error('操作失败'));
      console.log();
      console.log(chalk.white(`原因: ${errorMsg}`));
      console.log();
      console.log(chalk.cyan('建议:'));
      console.log(MessageFormatter.listItem('使用 /reset 重置会话', 2));
      console.log(MessageFormatter.listItem('使用 /errors 查看详细错误', 2));
      console.log(MessageFormatter.listItem('如问题持续，请重新启动 SecureBot', 2));
      console.log();
      
      // 显示上下文提示
      const hint = ContextualHints.getSuggestion('error');
      if (hint) {
        console.log(hint);
      }
    }
  }

  await exitHandler();
  rl.close();
}

// ============ 辅助函数 ============

function printWelcome(state: ReplState): void {
  console.log();
  console.log(chalk.cyan.bold('SecureBot v1.0.0'));
  console.log(chalk.gray('安全可控的多 Agent AI 助手'));
  console.log();
  
  const agent = state.agents.get(state.currentAgentId);
  console.log(chalk.white(`Agent: ${agent?.name || state.currentAgentId}`));
  
  if (state.config.model.model) {
    console.log(chalk.gray(`模型: ${state.config.model.model}`));
  }
  
  console.log();
  console.log(chalk.cyan('快捷键:'));
  console.log(chalk.gray('  Tab       - 命令/Agent 补全'));
  console.log(chalk.gray('  Ctrl+C    - 打断当前操作'));
  console.log(chalk.gray('  Ctrl+C 2x - 退出程序'));
  console.log();
  console.log(chalk.cyan('常用命令:'));
  console.log(chalk.gray('  /help     - 查看所有命令'));
  console.log(chalk.gray('  /agent    - 切换 Agent'));
  console.log(chalk.gray('  /reset    - 重置会话'));
  console.log(chalk.gray('  /status   - 查看状态'));
  console.log();
  console.log(chalk.gray('提示: 输入 / 或 @ 后按 Tab 可自动补全'));
  console.log();
}

/**
 * 询问是否使用 Ralph Loop 模式
 */
async function askRalphMode(
  rl: readlinePromises.Interface, 
  agents: Map<string, { id: string; name: string }>,
  currentAgentId: string
): Promise<{ enabled: boolean; taskDescription?: string; maxIterations?: number; agentId?: string }> {
  console.log(chalk.cyan('请选择对话模式:'));
  console.log(chalk.gray('  1. 普通对话 - 单次交互模式'));
  console.log(chalk.gray('  2. Ralph Loop - 持续迭代直到任务完成'));
  console.log();
  
  const choice = await rl.question(chalk.cyan('选择模式 [1/2]: '));
  
  if (choice.trim() === '2') {
    console.log();
    console.log(chalk.cyan('🔄 Ralph Loop 模式'));
    console.log(chalk.gray('Agent 将自动分解任务并持续迭代执行。'));
    console.log();
    
    // 选择 Agent
    console.log(chalk.cyan('可用 Agent:'));
    const agentList = Array.from(agents.values());
    agentList.forEach((agent, index) => {
      const current = agent.id === currentAgentId ? ' (当前)' : '';
      console.log(chalk.gray(`  ${index + 1}. ${agent.name} [${agent.id}]${current}`));
    });
    console.log();
    
    const agentChoice = await rl.question(chalk.cyan(`选择 Agent [1-${agentList.length}，默认当前]: `));
    
    let selectedAgentId = currentAgentId;
    if (agentChoice.trim()) {
      const agentIndex = parseInt(agentChoice, 10) - 1;
      if (agentIndex >= 0 && agentIndex < agentList.length) {
        const selectedAgent = agentList[agentIndex];
        if (selectedAgent) {
          selectedAgentId = selectedAgent.id;
          console.log(chalk.gray(`已选择: ${selectedAgent.name}`));
        }
      }
    }
    console.log();
    
    const taskDescription = await rl.question(chalk.cyan('请描述任务: '));
    
    if (!taskDescription.trim()) {
      console.log(chalk.yellow('任务描述为空，切换到普通对话模式'));
      return { enabled: false };
    }
    
    const maxIterationsStr = await rl.question(chalk.cyan('最大迭代次数 [默认 20]: '));
    const maxIterations = maxIterationsStr.trim() ? parseInt(maxIterationsStr, 10) : 20;
    
    return {
      enabled: true,
      taskDescription: taskDescription.trim(),
      maxIterations: isNaN(maxIterations) ? 20 : maxIterations,
      agentId: selectedAgentId,
    };
  }
  
  return { enabled: false };
}

/**
 * 询问运行模式
 */
async function askRunMode(rl: readlinePromises.Interface): Promise<'foreground' | 'background'> {
  console.log(chalk.cyan('选择运行模式:'));
  console.log(chalk.gray('  1. 前台运行 - 实时查看进度'));
  console.log(chalk.gray('  2. 后台运行 - 完成后通知'));
  console.log();
  
  const answer = await rl.question(chalk.cyan('选择 [1/2，默认 1]: '));
  return answer.trim() === '2' ? 'background' : 'foreground';
}

/**
 * 询问是/否问题
 */
async function askYesNo(rl: readlinePromises.Interface, question: string, defaultYes: boolean = true): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await rl.question(chalk.cyan(`${question} ${hint}: `));
  
  if (!answer.trim()) {
    return defaultYes;
  }
  
  return answer.toLowerCase().startsWith('y');
}

/**
 * 生成执行摘要
 */
function generateExecutionSummary(executionLog: {
  workspace: string;
  filesCreated: string[];
  filesModified: string[];
  commandsExecuted: string[];
  testResults: string[];
  keyOutputs: string[];
  iterations: number;
  toolCallsCount: number;
}, finalResponse: string): string {
  const parts: string[] = [];
  
  // 1. 工作位置
  parts.push(`## 执行摘要\n`);
  parts.push(`**工作目录**: ${executionLog.workspace}`);
  parts.push(`**执行轮数**: ${executionLog.iterations} 轮`);
  parts.push(`**工具调用**: ${executionLog.toolCallsCount} 次\n`);
  
  // 2. 创建的文件
  if (executionLog.filesCreated.length > 0) {
    parts.push(`### 创建的文件 (${executionLog.filesCreated.length} 个)`);
    executionLog.filesCreated.forEach(f => {
      const fileName = f.split('/').pop() || f;
      parts.push(`  - ${fileName} \`${f}\``);
    });
    parts.push('');
  }
  
  // 3. 修改的文件
  if (executionLog.filesModified.length > 0) {
    parts.push(`### 修改的文件 (${executionLog.filesModified.length} 个)`);
    executionLog.filesModified.forEach(f => {
      const fileName = f.split('/').pop() || f;
      parts.push(`  - ${fileName} \`${f}\``);
    });
    parts.push('');
  }
  
  // 4. 执行的命令
  if (executionLog.commandsExecuted.length > 0) {
    parts.push(`### 执行的命令 (${executionLog.commandsExecuted.length} 个)`);
    executionLog.commandsExecuted.slice(0, 10).forEach(cmd => {
      parts.push(`  - \`${cmd.slice(0, 80)}${cmd.length > 80 ? '...' : ''}\``);
    });
    parts.push('');
  }
  
  // 5. 测试结果摘要
  if (executionLog.testResults.length > 0) {
    parts.push(`### 测试结果`);
    executionLog.testResults.forEach((result, i) => {
      const lines = result.split('\n').slice(0, 5);
      parts.push(`  测试 ${i + 1}:`);
      lines.forEach(line => {
        if (line.trim()) {
          parts.push(`    ${line.slice(0, 100)}`);
        }
      });
    });
    parts.push('');
  }
  
  // 6. Agent 最终回复（摘要）
  if (finalResponse) {
    parts.push(`### 任务完成说明`);
    const summaryLines = finalResponse.split('\n').slice(0, 10);
    summaryLines.forEach(line => {
      if (line.trim()) {
        parts.push(`${line}`);
      }
    });
    parts.push('');
  }
  
  return parts.join('\n');
}