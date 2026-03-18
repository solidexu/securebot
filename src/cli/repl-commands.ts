/**
 * REPL 命令处理模块
 * 
 * 处理所有 / 开头的命令
 */

import * as readlinePromises from 'node:readline/promises';
import chalk from 'chalk';
import type { ReplState } from '../core/types.js';
import { getOrCreateMainSession, getDefaultAgent } from '../core/agent.js';
import { clearSessionHistory } from '../core/session.js';
import { getSessionStorage } from '../core/session-storage.js';
import { getAuditLogger } from '../core/audit.js';
import { getMemoryManager } from '../core/memory.js';
import { getSkillManager } from '../core/skills.js';
import { getTaskManager } from '../core/task-manager.js';
import { getConfirmationManager } from '../core/confirmation.js';
import { getMemoryMonitor, performMemoryCleanup } from '../core/memory-monitor.js';
import { saveAllSessions } from './repl-session.js';
import { clearPlanFromSession, popSubPlan, renderHierarchicalPlan } from './repl-plan.js';
import { eventBus } from '../core/event-bus.js';
import { EventTypes } from '../core/events.js';

// ============ 命令处理入口 ============

/**
 * 处理 / 开头的命令
 */
export async function handleCommand(
  state: ReplState,
  command: string,
  _rl: readlinePromises.Interface,
  sessionStorage: ReturnType<typeof getSessionStorage>
): Promise<void> {
  const parts = command.slice(1).split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const arg = parts[1];

  switch (cmd) {
    case 'help':
    case 'h':
    case '?':
      printHelp();
      break;

    case 'exit':
    case 'quit':
    case 'q':
      state.running = false;
      console.log(chalk.gray('再见！'));
      break;

    case 'agent':
      await handleAgentCommand(state, arg);
      break;

    case 'agents':
      handleAgentsCommand(state);
      break;

    case 'clear':
      console.clear();
      break;

    case 'reset':
      await handleResetCommand(state, sessionStorage);
      break;

    case 'history':
      handleHistoryCommand(state);
      break;

    case 'init-memory':
      await handleInitMemoryCommand(state);
      break;

    case 'init-rag':
      handleInitRagCommand(state);
      break;

    case 'model':
      handleModelCommand(state, arg);
      break;

    case 'models':
      await handleModelsCommand(state);
      break;

    case 'monitor':
      await handleMonitorCommand(arg);
      break;

    case 'audit':
      await handleAuditCommand(arg);
      break;

    case 'plan':
      await handlePlanCommand(state, arg, parts, sessionStorage);
      break;

    case 'save': {
      const count = await saveAllSessions(state.agents, sessionStorage);
      console.log(chalk.green(`✓ 已保存 ${count} 个会话`));
      break;
    }

    case 'export':
      await handleExportCommand(state, arg);
      break;

    case 'reload':
      await handleReloadCommand(state);
      break;

    case 'skills':
      await handleSkillsCommand(state);
      break;

    case 'memory':
      await handleMemoryCommand(state, arg, parts);
      break;

    case 'sessions':
      await handleSessionsCommand(sessionStorage);
      break;

    case 'confirm':
      handleConfirmCommand(arg);
      break;

    case 'checkpoint':
      handleCheckpointCommand(arg, parts);
      break;

    case 'collab':
      await handleCollabCommand(state, arg, parts);
      break;

    case 'errors':
      await handleErrorsCommand(arg);
      break;

    case 'behavior':
      handleBehaviorCommand();
      break;

    case 'summary':
      await handleSummaryCommand(arg);
      break;

    case 'perf':
      handlePerfCommand(arg);
      break;

    default:
      console.log(chalk.yellow(`未知命令: ${cmd}`));
      console.log(chalk.gray('输入 /help 查看帮助'));
  }
}

// ============ 具体命令处理函数 ============

async function handleAgentCommand(state: ReplState, arg?: string): Promise<void> {
  if (arg) {
    const targetAgent = state.agents.get(arg);
    if (targetAgent) {
      state.currentAgentId = arg;
      console.log();
      console.log(chalk.cyan('┌─────────────────────────────────────┐'));
      console.log(chalk.cyan('│') + chalk.white.bold(`  🤖 正在与 ${targetAgent.name} 对话`).padEnd(37) + chalk.cyan('│'));
      console.log(chalk.cyan('└─────────────────────────────────────┘'));
      console.log();
    } else {
      console.log(chalk.red(`Agent 不存在: ${arg}`));
      console.log(chalk.gray(`可用 Agent: ${Array.from(state.agents.keys()).join(', ')}`));
    }
  } else {
    const currentAgent = state.agents.get(state.currentAgentId);
    if (currentAgent) {
      console.log();
      console.log(chalk.cyan('┌─────────────────────────────────────┐'));
      console.log(chalk.cyan('│') + chalk.white.bold(`  🤖 正在与 ${currentAgent.name} 对话`).padEnd(37) + chalk.cyan('│'));
      console.log(chalk.cyan('└─────────────────────────────────────┘'));
      console.log();
    }
  }
}

function handleAgentsCommand(state: ReplState): void {
  console.log(chalk.cyan('可用 Agent:'));
  for (const [id, agent] of state.agents) {
    const current = id === state.currentAgentId ? chalk.green(' (当前)') : '';
    const session = agent.sessions.get(`agent:${id}:main`);
    const historyCount = session?.history.length ?? 0;
    console.log(`  ${id} - ${agent.name}${current} ${chalk.gray(`[${historyCount} 条历史]`)}`);
  }
}

async function handleResetCommand(
  state: ReplState,
  sessionStorage: ReturnType<typeof getSessionStorage>
): Promise<void> {
  const agent = state.agents.get(state.currentAgentId);
  if (agent) {
    const session = getOrCreateMainSession(agent);
    clearSessionHistory(session);
    await sessionStorage.deleteSession(session.sessionKey);
    console.log(chalk.green('✓ 已清除当前会话历史'));
  }
}

function handleHistoryCommand(state: ReplState): void {
  const agent = state.agents.get(state.currentAgentId);
  if (agent) {
    const session = getOrCreateMainSession(agent);
    console.log(chalk.cyan(`对话历史 (${session.history.length} 条):`));
    for (const msg of session.history) {
      const role = { user: '用户', assistant: '助手', system: '系统', tool: '工具' }[msg.role];
      const preview = msg.content.length > 100 ? msg.content.slice(0, 100) + '...' : msg.content;
      console.log(chalk.gray(`[${role}] ${preview}`));
    }
  }
}

async function handleInitMemoryCommand(state: ReplState): Promise<void> {
  const memoryManager = getMemoryManager();
  const agent = state.agents.get(state.currentAgentId);
  if (agent) {
    console.log(chalk.cyan.bold('\n🧠 初始化 Agent 记忆系统\n'));
    
    console.log(chalk.white('1. 创建 Agent 档案...'));
    const profile = await memoryManager.getAgentProfile(agent.id, agent.name);
    await memoryManager.saveAgentProfile(profile);
    console.log(chalk.gray(`   ✓ memory/profiles/agent_${agent.id}.json`));
    
    console.log(chalk.white('2. 创建工作记忆...'));
    eventBus.publishSync({
      type: EventTypes.MEMORY_REMEMBER,
      timestamp: new Date(),
      agentId: agent.id,
      sessionId: 'init',
      payload: {
        type: 'event',
        content: '记忆系统初始化',
        importance: 3,
        tags: ['init'],
      },
    });
    
    const today = new Date().toISOString().split('T')[0]!;
    console.log(chalk.gray(`   ✓ memory/daily/${today}_${agent.id}.json`));
    
    console.log(chalk.white('3. 检查用户档案...'));
    const userProfile = memoryManager.getUserProfile();
    if (userProfile) {
      const keyInfoCount = Object.keys(userProfile.keyInfo || {}).length;
      if (keyInfoCount > 0) {
        console.log(chalk.gray(`   ✓ memory/profiles/user.json (${keyInfoCount} 条信息)`));
      } else {
        console.log(chalk.gray(`   ✓ memory/profiles/user.json (暂无用户信息)`));
      }
    }
    
    console.log();
    console.log(chalk.green('✓ 记忆系统初始化完成'));
    
    const memStatus = await memoryManager.isAgentInitialized(agent.id);
    console.log(chalk.gray(`  Agent 档案: ${memStatus.hasProfile ? '✓' : '✗'}`));
    console.log(chalk.gray(`  工作记忆: ${memStatus.hasMemory ? '✓' : '✗'}`));
    
    if (!memStatus.hasKeyInfo) {
      console.log(chalk.gray(`  用户信息: ✗ (说"记住我的名字是xxx"添加信息)`));
    } else {
      console.log(chalk.gray(`  用户信息: ✓`));
    }
    
    const ragConfig = agent.rag;
    if (ragConfig?.enabled) {
      console.log();
      console.log(chalk.cyan('检查 RAG 知识库配置...'));
      
      try {
        const models = await state.modelAdapter.listModels();
        const embeddingModel = ragConfig.embeddingModel || 'nomic-embed-text';
        const hasEmbeddingModel = models.some(m => m.includes(embeddingModel) || m === embeddingModel);
        
        if (hasEmbeddingModel) {
          console.log(chalk.green(`✓ 嵌入模型 ${embeddingModel} 已安装`));
        } else {
          console.log(chalk.yellow(`⚠ 嵌入模型 ${embeddingModel} 未安装`));
          console.log(chalk.gray(`  安装命令: ollama pull ${embeddingModel}`));
        }
      } catch {
        console.log(chalk.yellow('⚠ 无法检查嵌入模型，确保 Ollama 正在运行'));
      }
      
      const knowledgeDirs = ragConfig.knowledgeDirs || [];
      if (knowledgeDirs.length > 0) {
        console.log(chalk.gray(`  知识库目录: ${knowledgeDirs.join(', ')}`));
        console.log(chalk.gray('  Agent 可使用 rag_search 搜索知识库'));
      } else {
        console.log(chalk.yellow('⚠ 未配置知识库目录'));
        console.log(chalk.gray('  在 config.json 中设置 rag.knowledgeDirs'));
      }
    }
  }
}

function handleInitRagCommand(state: ReplState): void {
  const agent = state.agents.get(state.currentAgentId);
  if (agent) {
    console.log(chalk.cyan.bold('\n📚 RAG 知识库初始化\n'));
    console.log(chalk.white('RAG (检索增强生成) 让 Agent 可以搜索你的文档库。'));
    console.log();
    console.log(chalk.cyan.bold('推荐配置 (CPU 友好)：'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.white('  Embedding:     embeddinggemma-300M-GGUF'));
    console.log(chalk.white('  Reranking:     Qwen3-Reranker-0.6B-Q8_0-GGUF'));
    console.log(chalk.white('  Query Expand:  qmd-query-expansion-1.7B-gguf'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log();
    console.log(chalk.cyan('步骤 1: 导入 GGUF 模型到 Ollama'));
    console.log(chalk.gray('  # 下载 GGUF 文件后创建 Modelfile'));
    console.log(chalk.gray('  ollama create embeddinggemma -f Modelfile'));
    console.log();
    console.log(chalk.cyan('步骤 2: 准备知识库目录'));
    console.log(chalk.white('  mkdir -p ./knowledge'));
    console.log(chalk.white('  # 放入 .md/.txt/.json 文档'));
    console.log();
    console.log(chalk.cyan('步骤 3: 配置 Agent (config.json)'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.white(`{
  "agents": [{
    "id": "${agent.id}",
    "name": "${agent.name}",
    "workspace": "${agent.workspace}",
    "rag": {
      "enabled": true,
      "knowledgeDirs": ["./knowledge"],
      "embeddingModel": "embeddinggemma",
      "rerankModel": "qwen3-reranker",
      "queryExpansionModel": "qmd-query-expansion",
      "enableRerank": true,
      "enableQueryExpansion": true
    }
  }]
}`));
    console.log(chalk.gray('─'.repeat(50)));
    console.log();
    console.log(chalk.cyan('步骤 4: 重新加载配置'));
    console.log(chalk.white('  /reload'));
    console.log();
    console.log(chalk.cyan('可用工具（启用 RAG 后）：'));
    console.log(chalk.gray('  • rag_search <query>  - 搜索知识库'));
    console.log(chalk.gray('  • rag_index <path>    - 添加文档到知识库'));
    console.log(chalk.gray('  • rag_status          - 查看知识库状态'));
    console.log();
    console.log(chalk.yellow('提示: 使用 OLLAMA_NO_GPU=1 强制 CPU 运行'));
  }
}

function handleModelCommand(state: ReplState, arg?: string): void {
  if (arg) {
    state.config.model.model = arg;
    console.log(chalk.green(`✓ 已切换到模型: ${arg}`));
  } else {
    console.log(chalk.cyan(`当前模型: ${state.config.model.model}`));
    console.log(chalk.gray('切换模型: /model <模型名>'));
  }
}

async function handleModelsCommand(state: ReplState): Promise<void> {
  try {
    const models = await state.modelAdapter.listModels();
    console.log(chalk.cyan('可用模型:'));
    for (const model of models) {
      const current = model === state.config.model.model ? chalk.green(' (当前)') : '';
      console.log(`  ${model}${current}`);
    }
  } catch {
    console.log(chalk.yellow('无法获取模型列表，请确保 Ollama 正在运行'));
  }
}

async function handleMonitorCommand(arg?: string): Promise<void> {
  const { getPerformanceMonitor } = await import('../core/handlers/performance-handler.js');
  const { getErrorTracker } = await import('../core/handlers/error-handler.js');
  const { getEventPersistence } = await import('../core/handlers/persistence-handler.js');
  
  if (arg === 'perf' || arg === 'performance') {
    const monitor = getPerformanceMonitor();
    const summary = monitor.getSummary();
    console.log(chalk.cyan('\n📊 性能监控:'));
    console.log(`  运行时间: ${summary.uptime}s`);
    console.log(`  总事件数: ${summary.totalEvents}`);
    console.log(`  事件类型: ${summary.eventTypes}`);
    if (summary.topEvents.length > 0) {
      console.log(chalk.gray('  TOP 事件:'));
      for (const e of summary.topEvents.slice(0, 5)) {
        console.log(chalk.gray(`    ${e.type}: ${e.count} 次 (${e.avgTime}ms)`));
      }
    }
  } else if (arg === 'errors') {
    const tracker = getErrorTracker();
    const stats = tracker.getStats();
    const errors = tracker.getErrors(5);
    console.log(chalk.red('\n❌ 错误追踪:'));
    console.log(`  总错误数: ${stats.totalErrors}`);
    console.log(`  最近1小时: ${stats.recentErrors}`);
    if (errors.length > 0) {
      console.log(chalk.gray('  最近错误:'));
      for (const e of errors) {
        console.log(chalk.gray(`    ${e.error.slice(0, 60)}...`));
      }
    }
  } else if (arg === 'events') {
    const persistence = getEventPersistence();
    const status = persistence.getStatus();
    console.log(chalk.cyan('\n📝 事件持久化:'));
    console.log(`  状态: ${status.enabled ? '启用' : '禁用'}`);
    console.log(`  日志目录: ${status.logDir}`);
  } else {
    const monitor = getPerformanceMonitor();
    const tracker = getErrorTracker();
    const summary = monitor.getSummary();
    const stats = tracker.getStats();
    
    console.log(chalk.cyan('\n📊 监控报告'));
    console.log('─'.repeat(50));
    console.log(`运行时间: ${summary.uptime}s | 事件: ${summary.totalEvents} | 错误: ${stats.totalErrors}`);
    if (summary.topEvents.length > 0) {
      console.log(chalk.gray('高频事件:'));
      for (const e of summary.topEvents.slice(0, 5)) {
        console.log(chalk.gray(`  ${e.type}: ${e.count} 次`));
      }
    }
    console.log('─'.repeat(50));
  }
  
  console.log(chalk.gray('\n命令:'));
  console.log(chalk.gray('  /monitor          显示监控报告'));
  console.log(chalk.gray('  /monitor perf     性能监控'));
  console.log(chalk.gray('  /monitor errors   错误追踪'));
  console.log(chalk.gray('  /monitor events   事件持久化'));
}

async function handleAuditCommand(arg?: string): Promise<void> {
  const auditLogger = getAuditLogger();
  if (arg === 'off') {
    auditLogger.setEnabled(false);
    console.log(chalk.green('✓ 已关闭审计日志'));
  } else if (arg === 'on') {
    auditLogger.setEnabled(true);
    console.log(chalk.green('✓ 已开启审计日志'));
  } else if (arg === 'stats') {
    const stats = auditLogger.getStats();
    console.log(chalk.cyan('审计统计:'));
    console.log(`  总调用次数: ${stats.totalCalls}`);
    console.log(`  成功率: ${(stats.successRate * 100).toFixed(1)}%`);
    if (Object.keys(stats.byTool).length > 0) {
      console.log(chalk.gray('  按工具:'));
      for (const [tool, count] of Object.entries(stats.byTool)) {
        console.log(chalk.gray(`    ${tool}: ${count}`));
      }
    }
  } else {
    const entries = auditLogger.readRecent(20);
    if (entries.length === 0) {
      console.log(chalk.gray('暂无审计记录'));
    } else {
      console.log(chalk.cyan(`最近 ${entries.length} 条审计记录:`));
      for (const entry of entries) {
        const time = new Date(entry.timestamp).toLocaleTimeString('zh-CN');
        const resultColor = entry.result === 'success' ? chalk.green : chalk.red;
        console.log(`  ${chalk.gray(time)} [${entry.agentId}] ${entry.tool} ${resultColor(entry.result)}`);
      }
    }
    console.log(chalk.gray('\n命令: /audit [on|off|stats]'));
  }
}

async function handlePlanCommand(
  state: ReplState,
  arg: string | undefined,
  _parts: string[],
  sessionStorage: ReturnType<typeof getSessionStorage>
): Promise<void> {
  const agent = state.agents.get(state.currentAgentId);
  if (!agent) return;
  
  const session = getOrCreateMainSession(agent);
  
  if (arg === 'clear') {
    session.planStack = [];
    clearPlanFromSession(session);
    await sessionStorage.saveSession(session);
    console.log(chalk.green('✓ 已清除所有任务规划'));
  } else if (arg === 'reset') {
    if (session.plan) {
      session.plan.steps = session.plan.steps.map(s => ({
        ...s,
        status: 'pending' as const,
      }));
      session.plan.updatedAt = new Date().toISOString();
      await sessionStorage.saveSession(session);
      console.log(chalk.green('✓ 已重置规划状态，所有步骤设为待处理'));
    } else {
      console.log(chalk.gray('当前没有任务规划'));
    }
  } else if (arg === 'back' || arg === 'pop') {
    if (session.planStack && session.planStack.length > 0) {
      popSubPlan(session, false);
      await sessionStorage.saveSession(session);
      console.log(chalk.green('✓ 已返回父规划'));
      if (session.plan) {
        console.log(renderHierarchicalPlan(session));
      }
    } else {
      console.log(chalk.gray('当前没有父规划'));
    }
  } else if (arg === 'tree') {
    if (session.plan || (session.planStack && session.planStack.length > 0)) {
      console.log(chalk.cyan.bold('\n🌲 规划树结构:\n'));
      console.log(renderHierarchicalPlan(session));
      
      const stackDepth = session.planStack?.length ?? 0;
      if (stackDepth > 0) {
        console.log(chalk.gray(`\n规划栈深度: ${stackDepth}`));
      }
    } else {
      console.log(chalk.gray('当前没有任务规划'));
    }
  } else {
    if (session.plan) {
      console.log(chalk.cyan.bold('\n📋 当前任务规划\n'));
      console.log(renderHierarchicalPlan(session));
      
      const completed = session.plan.steps.filter(s => s.status === 'completed').length;
      const total = session.plan.steps.length;
      const inProgress = session.plan.steps.filter(s => s.status === 'in_progress').length;
      const pending = session.plan.steps.filter(s => s.status === 'pending').length;
      
      console.log(chalk.gray(`\n进度统计:`));
      console.log(chalk.green(`  ✅ 已完成: ${completed}`));
      console.log(chalk.yellow(`  🔄 进行中: ${inProgress}`));
      console.log(chalk.gray(`  ⬜ 待处理: ${pending}`));
      console.log(chalk.gray(`  📊 总计: ${total}`));
      
      if (session.plan.level && session.plan.level > 0) {
        console.log(chalk.gray(`  📐 层级: Level ${session.plan.level}`));
      }
      
      const stackDepth = session.planStack?.length ?? 0;
      if (stackDepth > 0) {
        console.log(chalk.gray(`  📚 规划栈: ${stackDepth} 个父规划`));
      }
      
      if (session.plan.originalTask) {
        console.log(chalk.gray(`\n原始任务: ${session.plan.originalTask}`));
      }
      
      if (session.plan.context) {
        console.log(chalk.gray(`\n规划上下文:`));
        if (session.plan.context.currentStepDetail) {
          console.log(chalk.gray(`  当前步骤: ${session.plan.context.currentStepDetail}`));
        }
        if (session.plan.context.completedWork) {
          console.log(chalk.gray(`  已完成工作: ${session.plan.context.completedWork}`));
        }
        if (session.plan.context.notes && session.plan.context.notes.length > 0) {
          console.log(chalk.yellow(`  注意事项:`));
          for (const note of session.plan.context.notes) {
            console.log(chalk.yellow(`    - ${note}`));
          }
        }
      }
      
      console.log(chalk.gray('\n命令:'));
      console.log(chalk.gray('  /plan         查看当前规划'));
      console.log(chalk.gray('  /plan tree    查看规划树'));
      console.log(chalk.gray('  /plan reset   重置规划状态'));
      console.log(chalk.gray('  /plan back    返回父规划'));
      console.log(chalk.gray('  /plan clear   清除所有规划'));
    } else {
      console.log(chalk.gray('当前没有进行中的任务规划'));
      console.log(chalk.gray('发送复杂任务时会自动生成规划'));
    }
  }
}

async function handleExportCommand(state: ReplState, arg?: string): Promise<void> {
  const { exportSession } = await import('../core/export.js');
  const agent = state.agents.get(state.currentAgentId);
  if (agent) {
    const session = getOrCreateMainSession(agent);
    const format = (arg || 'markdown') as 'markdown' | 'json' | 'txt';
    
    if (!['markdown', 'json', 'txt'].includes(format)) {
      console.log(chalk.red('不支持的格式，可选: markdown, json, txt'));
      return;
    }
    
    const result = exportSession(session, agent.name, { format });
    if (result.success) {
      console.log(chalk.green(`✓ 已导出到: ${result.path}`));
    } else {
      console.log(chalk.red(result.error ?? '导出失败'));
    }
  }
}

async function handleReloadCommand(state: ReplState): Promise<void> {
  const { loadConfig } = await import('../core/config.js');
  const { createAgents } = await import('../core/agent.js');
  const { OllamaAdapter } = await import('../model/ollama.js');
  
  try {
    const newConfig = loadConfig();
    state.config = newConfig;
    
    const newAgents = createAgents(newConfig);
    
    for (const [oldId, oldAgent] of state.agents) {
      const newAgent = newAgents.get(oldId);
      if (newAgent && oldAgent.sessions.size > 0) {
        newAgent.sessions = oldAgent.sessions;
      }
    }
    
    state.agents = newAgents;
    
    if (!newAgents.has(state.currentAgentId)) {
      const defaultAgent = getDefaultAgent(newAgents);
      if (defaultAgent) {
        state.currentAgentId = defaultAgent.id;
        console.log(chalk.yellow(`当前 Agent 已删除，切换到: ${defaultAgent.name}`));
      }
    }
    
    if (state.modelAdapter instanceof OllamaAdapter) {
      state.modelAdapter.setDefaultModel(newConfig.model.model);
    }
    
    console.log(chalk.green('✓ 配置已重新加载'));
    console.log(chalk.gray(`  Agent 数量: ${newAgents.size}`));
    console.log(chalk.gray(`  当前模型: ${newConfig.model.model}`));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`配置重载失败: ${msg}`));
  }
}

async function handleSkillsCommand(state: ReplState): Promise<void> {
  const currentAgent = state.agents.get(state.currentAgentId);
  if (!currentAgent) return;

  const skillManager = getSkillManager();
  const publicSkills = await skillManager.listPublicSkills();
  const privateSkills = await skillManager.listPrivateSkills(state.currentAgentId);

  console.log(chalk.cyan.bold(`\n📚 ${currentAgent.name} 的技能\n`));

  console.log(chalk.green('公共技能:'));
  if (publicSkills.length === 0) {
    console.log(chalk.gray('  (无)'));
  } else {
    for (const skill of publicSkills) {
      const assigned = currentAgent.skills?.includes(skill.id);
      const marker = assigned ? chalk.green(' ✓') : '';
      console.log(`  ${skill.id} - ${skill.name}${marker}`);
      console.log(chalk.gray(`    ${skill.description}`));
    }
  }

  console.log(chalk.yellow('\n个人技能:'));
  if (privateSkills.length === 0) {
    console.log(chalk.gray('  (无)'));
  } else {
    for (const skill of privateSkills) {
      console.log(`  ${skill.id} - ${skill.name}`);
      console.log(chalk.gray(`    ${skill.description}`));
    }
  }

  if (currentAgent.skills && currentAgent.skills.length > 0) {
    console.log(chalk.cyan('\n已激活的技能:'));
    for (const skillId of currentAgent.skills) {
      console.log(`  - ${skillId}`);
    }
  }

  console.log(chalk.gray('\n管理技能: securebot skill list/create/assign'));
}

async function handleMemoryCommand(state: ReplState, arg: string | undefined, parts: string[]): Promise<void> {
  const memoryManager = getMemoryManager();
  const memMonitor = getMemoryMonitor();
  
  if (arg === 'stats') {
    const stats = memoryManager.getStats();
    const profile = memoryManager.getUserProfile();
    const memStatus = memMonitor.getStatus();
    
    console.log(chalk.cyan('记忆系统状态:'));
    console.log(`  每日记忆: ${stats.dailyMemoryCount} 个`);
    console.log(`  总条目: ${stats.totalEntries} 条`);
    console.log(`  Agent 档案: ${stats.agentCount} 个`);
    console.log(`  用户信息: ${Object.keys(profile?.keyInfo ?? {}).length} 条`);
    
    console.log(chalk.cyan('\n内存使用:'));
    console.log(`  堆内存: ${memStatus.heapUsedMB}MB / ${memStatus.heapTotalMB}MB`);
    console.log(`  RSS: ${memStatus.rssMB}MB`);
    const levelColor = memStatus.level === 'normal' ? chalk.green :
                      memStatus.level === 'warning' ? chalk.yellow :
                      memStatus.level === 'danger' ? chalk.red : chalk.red.bold;
    console.log(`  状态: ${levelColor(memStatus.level.toUpperCase())}`);
    
    const thresholds = memMonitor.getThresholds();
    console.log(chalk.gray(`\n  阈值: 警告 ${thresholds.warning}MB / 危险 ${thresholds.danger}MB / 临界 ${thresholds.critical}MB`));
    
  } else if (arg === 'cleanup') {
    console.log(chalk.cyan('执行内存清理...'));
    
    const result = await performMemoryCleanup(
      {
        clearCaches: true,
        clearSessionHistory: false,
        keepRecentMessages: 50,
      },
      {
        clearCaches: async () => {
          memoryManager.clearCache?.();
        },
      }
    );
    
    console.log(chalk.green(`✓ 内存清理完成`));
    console.log(chalk.gray(`  清理前: ${result.beforeMB}MB`));
    console.log(chalk.gray(`  清理后: ${result.afterMB}MB`));
    console.log(chalk.gray(`  释放: ${result.freedMB}MB`));
    for (const detail of result.details) {
      console.log(chalk.gray(`  - ${detail}`));
    }
    
  } else if (arg === 'clear') {
    console.log(chalk.yellow('确定要清除工作记忆吗？这将清除缓存但不会删除文件。'));
    console.log(chalk.gray('使用 /memory cleanup 执行内存清理'));
    
  } else if (arg === 'search' && parts[2]) {
    const query = parts.slice(2).join(' ');
    const entries = await memoryManager.search(query, { agentId: state.currentAgentId });
    if (entries.length === 0) {
      console.log(chalk.gray('未找到相关记忆'));
    } else {
      console.log(chalk.cyan(`找到 ${entries.length} 条记忆:`));
      for (const entry of entries.slice(0, 10)) {
        const date = new Date(entry.timestamp).toLocaleDateString('zh-CN');
        console.log(chalk.gray(`  [${date}] ${entry.content.slice(0, 80)}...`));
      }
    }
  } else {
    const summary = await memoryManager.getContextSummary(state.currentAgentId);
    if (summary) {
      console.log(chalk.cyan('工作记忆摘要:'));
      console.log(summary);
    } else {
      console.log(chalk.gray('暂无工作记忆'));
    }
    console.log(chalk.gray('\n命令:'));
    console.log(chalk.gray('  /memory stats    显示详细状态'));
    console.log(chalk.gray('  /memory cleanup  清理内存'));
    console.log(chalk.gray('  /memory search <关键词>  搜索记忆'));
  }
}

async function handleSessionsCommand(
  sessionStorage: ReturnType<typeof getSessionStorage>
): Promise<void> {
  const sessions = await sessionStorage.listSessions();
  if (sessions.length === 0) {
    console.log(chalk.gray('暂无保存的会话'));
  } else {
    console.log(chalk.cyan('已保存的会话:'));
    for (const s of sessions) {
      const time = s.updatedAt.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      console.log(`  ${s.agentId} ${chalk.gray(`[${s.messageCount} 条] ${time}`)}`);
    }
  }
}

function handleConfirmCommand(arg?: string): void {
  const confirmationManager = getConfirmationManager();
  if (arg === 'off') {
    confirmationManager.updatePolicy({ mode: 'off' });
    console.log(chalk.green('✓ 已关闭敏感操作确认'));
  } else if (arg === 'on') {
    confirmationManager.updatePolicy({ mode: 'on-risk' });
    console.log(chalk.green('✓ 已开启敏感操作确认'));
  } else if (arg === 'always') {
    confirmationManager.updatePolicy({ mode: 'always' });
    console.log(chalk.green('✓ 已开启所有操作确认'));
  } else {
    console.log(chalk.cyan('敏感操作确认设置:'));
    console.log(`  /confirm on     - 开启（仅敏感操作）`);
    console.log(`  /confirm off    - 关闭`);
    console.log(`  /confirm always - 始终确认`);
  }
}

function handleCheckpointCommand(arg: string | undefined, parts: string[]): void {
  const taskManager = getTaskManager();
  
  if (arg === 'list') {
    const checkpoints = taskManager.listCheckpoints();
    if (checkpoints.length === 0) {
      console.log(chalk.gray('暂无检查点'));
    } else {
      console.log(chalk.cyan(`检查点列表 (${checkpoints.length} 个):`));
      for (const cp of checkpoints) {
        const time = new Date(cp.createdAt).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        const progress = `${cp.progress.done}/${cp.progress.total}`;
        console.log(`  ${chalk.gray(time)} ${cp.id} [${progress}] ${cp.sessionId}`);
      }
    }
  } else if (arg === 'save') {
    const checkpointId = taskManager.saveCheckpoint();
    console.log(chalk.green(`✓ 检查点已保存: ${checkpointId}`));
  } else if (arg === 'resume' && parts[2]) {
    const checkpointId = parts[2];
    const result = taskManager.resumeFromCheckpoint({ checkpointId });
    if (result.success) {
      console.log(chalk.green('✓ 任务已恢复'));
      console.log(chalk.gray(`  剩余任务: ${result.remainingTasks.length} 个`));
      console.log(chalk.gray(`  进度: ${result.progress.done}/${result.progress.total}`));
    } else {
      console.log(chalk.red(`恢复失败: ${result.message}`));
    }
  } else if (arg === 'status') {
    const status = taskManager.getStatus();
    const summary = taskManager.getSummary();
    console.log(chalk.cyan('任务状态:'));
    console.log(`  总任务: ${status.total}`);
    console.log(`  已完成: ${status.done}`);
    console.log(`  进行中: ${status.inProgress}`);
    console.log(`  失败: ${status.failed}`);
    console.log(`  跳过: ${status.skipped}`);
    console.log(chalk.gray(`\n  ${summary}`));
  } else {
    console.log(chalk.cyan('检查点命令:'));
    console.log('  /checkpoint list          列出所有检查点');
    console.log('  /checkpoint save          保存检查点');
    console.log('  /checkpoint status        显示任务状态');
    console.log('  /checkpoint resume <id>   恢复任务');
  }
}

async function handleCollabCommand(state: ReplState, arg: string | undefined, parts: string[]): Promise<void> {
  const { getCollaborationManager } = await import('../core/collaboration.js');
  const collaborationManager = getCollaborationManager();
  
  if (arg === 'status') {
    const stats = collaborationManager.getStats();
    console.log(chalk.cyan('协作状态:'));
    console.log(`  待处理消息: ${stats.pendingMessages}`);
    console.log(`  活跃委派: ${stats.activeDelegations}`);
    console.log(`  共享空间: ${stats.sharedWorkspaces}`);
  } else if (arg === 'messages') {
    const messages = collaborationManager.getMessageBus().getMessages(state.currentAgentId);
    if (messages.length === 0) {
      console.log(chalk.gray('暂无消息'));
    } else {
      console.log(chalk.cyan(`消息列表 (${messages.length} 条):`));
      for (const msg of messages.slice(0, 10)) {
        const time = new Date(msg.createdAt).toLocaleTimeString('zh-CN');
        const typeColor = msg.type === 'request' ? chalk.yellow : 
                         msg.type === 'delegation' ? chalk.magenta : chalk.gray;
        console.log(`  ${chalk.gray(time)} [${typeColor(msg.type)}] ${msg.fromAgent}: ${msg.content.slice(0, 50)}...`);
      }
    }
  } else if (arg === 'delegate' && parts[2] && parts[3]) {
    const delegatee = parts[2];
    const task = parts.slice(3).join(' ');
    try {
      const delegation = await collaborationManager.delegateTask(
        state.currentAgentId,
        delegatee,
        task
      );
      console.log(chalk.green(`✓ 任务已委派给 ${delegatee}`));
      console.log(chalk.gray(`  委派ID: ${delegation.id}`));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`委派失败: ${msg}`));
    }
  } else if (arg === 'delegations') {
    const delegations = collaborationManager.getDelegationManager()
      .getDelegations(state.currentAgentId);
    if (delegations.length === 0) {
      console.log(chalk.gray('暂无委派'));
    } else {
      console.log(chalk.cyan(`委派列表 (${delegations.length} 条):`));
      for (const d of delegations.slice(0, 10)) {
        const time = new Date(d.createdAt).toLocaleTimeString('zh-CN');
        const statusColor = d.status === 'completed' ? chalk.green :
                           d.status === 'failed' ? chalk.red : chalk.yellow;
        console.log(`  ${chalk.gray(time)} [${statusColor(d.status)}] ${d.task.slice(0, 40)}...`);
      }
    }
  } else {
    console.log(chalk.cyan('协作命令:'));
    console.log('  /collab status              协作状态');
    console.log('  /collab messages            查看消息');
    console.log('  /collab delegations         查看委派');
    console.log('  /collab delegate <agent> <task>  委派任务');
  }
}

async function handleErrorsCommand(arg?: string): Promise<void> {
  const { getErrorHandler } = await import('../core/error-handler.js');
  const errorHandler = getErrorHandler();
  
  if (arg === 'clear') {
    errorHandler.clearLog();
    console.log(chalk.green('✓ 错误日志已清除'));
  } else {
    const stats = errorHandler.getStats();
    const errors = errorHandler.getErrorLog(10);
    
    console.log(chalk.cyan('错误统计:'));
    console.log(`  总错误: ${stats.totalErrors}`);
    
    if (Object.keys(stats.byType).length > 0) {
      console.log(chalk.gray('  按类型:'));
      for (const [type, count] of Object.entries(stats.byType)) {
        if (count > 0) {
          console.log(chalk.gray(`    ${type}: ${count}`));
        }
      }
    }
    
    if (Object.keys(stats.bySeverity).length > 0) {
      console.log(chalk.gray('  按严重程度:'));
      for (const [severity, count] of Object.entries(stats.bySeverity)) {
        if (count > 0) {
          const color = severity === 'critical' ? chalk.red :
                       severity === 'high' ? chalk.yellow : chalk.gray;
          console.log(color(`    ${severity}: ${count}`));
        }
      }
    }
    
    if (errors.length > 0) {
      console.log(chalk.cyan(`\n最近 ${errors.length} 条错误:`));
      for (const err of errors) {
        const time = new Date(err.timestamp).toLocaleTimeString('zh-CN');
        console.log(chalk.gray(`  [${time}] [${err.type}] ${err.message.slice(0, 60)}...`));
      }
    }
    
    console.log(chalk.gray('\n命令: /errors [clear]'));
  }
}

function handleBehaviorCommand(): void {
  const memoryManager = getMemoryManager();
  const profile = memoryManager.getUserProfile();
  
  console.log(chalk.cyan('用户行为档案:'));
  
  if (profile) {
    console.log(`\n  用户ID: ${profile.userId}`);
    
    if (profile.displayName) {
      console.log(`  显示名: ${profile.displayName}`);
    }
    
    if (Object.keys(profile.preferences).length > 0) {
      console.log(chalk.gray('\n  偏好设置:'));
      for (const [key, value] of Object.entries(profile.preferences)) {
        console.log(chalk.gray(`    ${key}: ${JSON.stringify(value)}`));
      }
    }
    
    if (profile.frequentAgents.length > 0) {
      console.log(chalk.gray('\n  常用 Agent:'));
      console.log(chalk.gray(`    ${profile.frequentAgents.join(', ')}`));
    }
    
    if (Object.keys(profile.keyInfo).length > 0) {
      console.log(chalk.gray('\n  关键信息:'));
      for (const [key, value] of Object.entries(profile.keyInfo)) {
        console.log(chalk.gray(`    ${key}: ${value}`));
      }
    }
  } else {
    console.log(chalk.gray('暂无用户档案'));
  }
  
  console.log(chalk.gray('\n提示: 系统会自动学习您的偏好和使用习惯'));
}

async function handleSummaryCommand(arg?: string): Promise<void> {
  const memoryManager = getMemoryManager();
  
  if (arg === 'trigger') {
    const results = await memoryManager.triggerSummary();
    if (results.length > 0) {
      console.log(chalk.green(`✓ 已生成 ${results.length} 个摘要`));
      for (const r of results) {
        console.log(chalk.gray(`  压缩 ${r.originalCount} 条 → ${r.summarizedCount} 条`));
      }
    } else {
      console.log(chalk.gray('无需摘要（记忆条目未达阈值）'));
    }
  } else if (arg === 'history') {
    const history = await memoryManager.getSummaryHistory();
    if (history.length === 0) {
      console.log(chalk.gray('暂无摘要历史'));
    } else {
      console.log(chalk.cyan(`摘要历史 (${history.length} 条):`));
      for (const h of history.slice(0, 5)) {
        const time = new Date(h.createdAt).toLocaleString('zh-CN');
        console.log(chalk.gray(`  [${time}] 压缩 ${h.originalCount} 条`));
        console.log(chalk.gray(`    ${h.summary.slice(0, 60)}...`));
      }
    }
  } else {
    console.log(chalk.cyan('摘要命令:'));
    console.log('  /summary trigger   手动触发摘要');
    console.log('  /summary history   查看摘要历史');
  }
}

function handlePerfCommand(arg?: string): void {
  const { getPerformanceMonitor } = require('../core/performance.js');
  const monitor = getPerformanceMonitor();
  
  if (arg === 'report') {
    console.log(monitor.generateReport());
  } else if (arg === 'clear') {
    monitor.clear();
    console.log(chalk.green('✓ 性能指标已清除'));
  } else {
    const mem = monitor.getMemoryUsage();
    const uptime = monitor.getUptime();
    const metrics = monitor.getMetrics();
    
    console.log(chalk.cyan('性能监控:'));
    console.log(`  运行时间: ${Math.floor(uptime / 1000)} 秒`);
    console.log(`  内存使用:`);
    console.log(`    堆内存: ${mem.heapUsedMB}MB / ${mem.heapTotalMB}MB`);
    console.log(`    RSS: ${mem.rssMB}MB`);
    
    if (metrics.size > 0) {
      console.log(chalk.gray('\n  执行统计:'));
      for (const [name, data] of metrics) {
        console.log(chalk.gray(`    ${name}: ${data.count}次, 平均 ${data.avg.toFixed(1)}ms`));
      }
    }
    
    console.log(chalk.gray('\n命令: /perf [report|clear]'));
  }
}

// ============ 帮助函数 ============

function printHelp(): void {
  console.log();
  console.log(chalk.cyan('命令列表:'));
  console.log('  /help, /h, /?    显示帮助');
  console.log('  /exit, /quit, /q  退出');
  console.log('  /agent [name]    显示/切换当前 Agent');
  console.log('  /agents          列出所有 Agent');
  console.log('  /init-memory     初始化当前 Agent 的记忆系统');
  console.log('  /skills          显示当前 Agent 的技能');
  console.log('  /plan [status|clear|reset]  查看/管理任务规划');
  console.log('  /history         显示对话历史');
  console.log('  /model [name]    显示/切换当前模型');
  console.log('  /models          列出可用模型');
  console.log('  /audit [on/off/stats]  审计日志管理');
  console.log('  /memory [stats|search <词>]  记忆系统');
  console.log('  /reload          重新加载配置文件');
  console.log('  /reset           清除当前会话历史');
  console.log('  /save            手动保存所有会话');
  console.log('  /sessions        列出已保存的会话');
  console.log('  /export [format] 导出会话 (markdown/json/txt)');
  console.log('  /confirm [on/off/always]  敏感操作确认设置');
  console.log('  /clear           清屏');
  console.log();
  console.log(chalk.cyan('记忆系统:'));
  console.log('  /init-memory     初始化当前 Agent 的记忆');
  console.log('  /memory stats    显示记忆统计和内存状态');
  console.log('  /memory cleanup  清理内存缓存');
  console.log('  /memory search   搜索记忆内容');
  console.log(chalk.gray('  提示: 告诉 Agent "记住xxx" 会自动记录'));
  console.log();
  console.log(chalk.cyan('任务规划:'));
  console.log('  /plan            查看当前任务规划');
  console.log('  /plan tree       查看规划树（层次结构）');
  console.log('  /plan back       返回父规划');
  console.log('  /plan reset      重置规划状态');
  console.log('  /plan clear      清除所有规划');
  console.log(chalk.gray('  提示: 支持层次化规划，可嵌套子规划'));
  console.log();
  console.log(chalk.cyan('性能监控:'));
  console.log('  /monitor         显示所有监控报告');
  console.log('  /monitor perf    性能监控统计');
  console.log('  /monitor errors  错误追踪');
  console.log('  /monitor events  事件持久化状态');
  console.log();
  console.log(chalk.cyan('任务管理:'));
  console.log('  /checkpoint list          列出检查点');
  console.log('  /checkpoint save          保存检查点');
  console.log('  /checkpoint status        任务状态');
  console.log('  /checkpoint resume <id>   恢复任务');
  console.log();
  console.log(chalk.cyan('协作系统:'));
  console.log('  /collab status            协作状态');
  console.log('  /collab messages          查看消息');
  console.log('  /collab delegations       查看委派');
  console.log('  /collab delegate <agent> <task>  委派任务');
  console.log();
  console.log(chalk.cyan('RAG 知识库:'));
  console.log('  /init-rag                 RAG 初始化指引');
  console.log(chalk.gray('  提示: 需要配置 agent.rag.enabled = true'));
  console.log();
  console.log(chalk.cyan('诊断工具:'));
  console.log('  /errors [clear]           错误统计');
  console.log('  /behavior                 用户行为档案');
  console.log('  /summary [trigger|history] 记忆摘要');
  console.log('  /perf [report|clear]      性能监控');
  console.log();
  console.log(chalk.cyan('Agent 切换:'));
  console.log('  @dev <消息>      切换到开发助手');
  console.log('  @support <消息>  切换到客服助手');
  console.log('  @admin <消息>    切换到管理助手');
  console.log();
  console.log(chalk.gray('提示: 会话会自动保存，重启后恢复历史'));
  console.log(chalk.gray('提示: 敏感操作（文件写入、命令执行等）需要确认'));
  console.log(chalk.gray('提示: 所有工具调用都会记录审计日志'));
  console.log(chalk.gray('提示: 修改配置文件后用 /reload 热重载'));
  console.log(chalk.gray('提示: 执行中按 Ctrl+C 打断操作，等待时按两次 Ctrl+C 退出'));
  console.log(chalk.gray('提示: 使用 /checkpoint 管理任务检查点'));
  console.log(chalk.gray('提示: 使用 /collab 进行 Agent 协作'));
  console.log();
}