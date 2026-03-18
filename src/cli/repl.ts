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
import { getMemoryManager } from '../core/memory.js';
import { ragManager } from '../rag/tools.js';
import { getSkillManager } from '../core/skills.js';
import { initializeEventHandlers } from '../core/handlers/index.js';
import { getConfirmationManager, type ConfirmationHandler } from '../core/confirmation.js';
import { getMemoryMonitor, type MemoryAlert } from '../core/memory-monitor.js';
import { handleCommand } from './repl-commands.js';
import { processMessage } from './repl-message.js';
import { loadPersistedSessions, saveAllSessions, showConfirmationDialog } from './repl-session.js';
import { ContextualHints, MessageFormatter } from './message-formatter.js';

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

  // 初始化记忆系统
  const memoryManager = getMemoryManager(config);
  await memoryManager.initialize();
  const memoryStats = memoryManager.getStats();
  console.log(chalk.green(`✓ 记忆系统就绪 (${memoryStats.totalEntries} 条记忆)`));
  console.log(chalk.gray(`  记忆目录: ${config.rootDir ?? '~/.securebot'}/memory`));

  // 初始化 RAG 并连接到记忆系统
  for (const agent of agents.values()) {
    if (agent.rag?.enabled) {
      try {
        const ragStore = await ragManager.getStore(agent, {
          enabled: true,
          knowledgeDirs: agent.rag.knowledgeDirs || [],
          embeddingModel: agent.rag.embeddingModel || 'all-minilm',
        });
        
        if (ragStore) {
          memoryManager.setRAGStore(ragStore);
          console.log(chalk.green(`✓ RAG 已连接到记忆系统 (Agent: ${agent.id})`));
          break;
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

  // 创建 tab 补全函数
  const completer = (line: string): [string[], string] => {
    // 命令补全
    if (line.startsWith('/')) {
      const commands = [
        '/help', '/h', '/?', '/exit', '/quit', '/q',
        '/agent', '/agents', '/clear', '/reset', '/history',
        '/init-memory', '/init-rag', '/model', '/models',
        '/monitor', '/audit', '/plan', '/checkpoint',
        '/collab', '/errors', '/perf', '/summary',
        '/feedback', '/improve', '/skills', '/reload',
        '/config', '/status', '/memory', '/rag',
        '/export', '/import', '/task',
      ];
      const hits = commands.filter(cmd => cmd.startsWith(line));
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
  });

  // 设置确认处理器
  const confirmationHandler: ConfirmationHandler = async (request) => {
    return await showConfirmationDialog(request, rl);
  };
  confirmationManager.setHandler(confirmationHandler);

  // 注册退出处理
  const exitHandler = async () => {
    memoryMonitor.stop();
    await saveAllSessions(agents, sessionStorage);
  };
  
  // Ctrl+C 处理
  let ctrlCount = 0;
  let ctrlTimer: ReturnType<typeof setTimeout> | null = null;
  let isExiting = false;
  let lastInterruptTime = 0;
  let interruptHandled = false;  // 标记这次打断是否已处理
  
  process.on('SIGINT', async () => {
    if (isExiting) return;
    
    const now = Date.now();
    
    // 如果在执行中，打断操作
    if (state.executing && !interruptHandled) {
      console.log(chalk.yellow('\n[已打断当前操作]'));
      state.interrupted = true;
      if (state.abortController) {
        state.abortController.abort();
      }
      lastInterruptTime = now;
      interruptHandled = true;  // 标记已处理
      ctrlCount = 0;
      
      // 500ms 后重置 interruptHandled
      setTimeout(() => { interruptHandled = false; }, 500);
      return;
    }
    
    // 如果距离上次打断不到 800ms，忽略这次 Ctrl+C
    // （因为这是打断操作后的残留信号）
    if (now - lastInterruptTime < 800) {
      return;
    }
    
    ctrlCount++;
    if (ctrlCount >= 2) {
      isExiting = true;
      console.log(chalk.gray('\n正在退出...'));
      state.running = false;
      rl.close();
      try {
        await exitHandler();
      } catch {
        // 忽略退出时的错误
      }
      setImmediate(() => process.exit(0));
      return;
    }
    
    console.log(chalk.gray('\n按 Ctrl+C 再次退出，或输入 /help 查看帮助'));
    
    if (ctrlTimer) clearTimeout(ctrlTimer);
    ctrlTimer = setTimeout(() => { ctrlCount = 0; }, 1000);
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