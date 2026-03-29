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
import { getFeedbackCollector, getImprovementLogManager, getSuccessPatternStore, getErrorPatternStore, getSelfReflectionEngine, getPromptOptimizer, getSkillGenerator } from '../core/self-improving/index.js';
import { getAvailableTools } from '../tools/index.js';
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

    case 'remember':
      await handleRememberCommand(state, parts.slice(1).join(' '));
      break;

    case 'rag':
      await handleRagCommand(state, _rl, arg, parts.slice(2));
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

    case 'ralph':
      await handleRalphCommand(state, arg || '', parts.slice(2));
      break;

    case 'branch':
      await handleBranchCommand(arg || '', parts.slice(2));
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

    case 'feedback':
      await handleFeedbackCommand(state, arg, parts);
      break;

    case 'improve':
      await handleImproveCommand(state, arg, parts, sessionStorage);
      break;

    case 'patterns':
      await handlePatternsCommand(state, arg);
      break;

    case 'unified':
    case 'us':
      await handleUnifiedSearchCommand(state, parts.slice(1).join(' '));
      break;

    case 'context':
    case 'ctx':
      await handleContextCommand(state);
      break;

    case 'ollama':
      await handleOllamaCommand(state, arg);
      break;

    case 'delete':
    case 'del':
      await handleDeleteCommand(state, arg);
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

/**
 * 处理 /delete 命令 - 清除工作空间（保留 .rag）
 */
async function handleDeleteCommand(state: ReplState, arg?: string): Promise<void> {
  const agent = state.agents.get(state.currentAgentId);
  if (!agent) {
    console.log(chalk.red('无法获取当前 Agent'));
    return;
  }
  
  const { getAgentsDir } = await import('../core/config.js');
  const { existsSync, readdirSync, statSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  
  const agentsDir = getAgentsDir(state.config);
  const workspace = agent.workspace.startsWith('/')
    ? agent.workspace
    : `${agentsDir}/${agent.workspace}`;
  
  if (!existsSync(workspace)) {
    console.log(chalk.yellow('工作空间不存在'));
    return;
  }
  
  // 列出将要删除的内容
  const items = readdirSync(workspace);
  const toDelete = items.filter(item => item !== '.rag');
  
  if (toDelete.length === 0) {
    console.log(chalk.gray('工作空间为空（.rag 目录已保留）'));
    return;
  }
  
  // 确认
  if (arg !== 'force' && arg !== '-f') {
    console.log();
    console.log(chalk.yellow('⚠️ 即将删除工作空间中的以下内容：'));
    console.log();
    for (const item of toDelete.slice(0, 10)) {
      const itemPath = join(workspace, item);
      const isDir = statSync(itemPath).isDirectory();
      console.log(chalk.gray(`  ${isDir ? '📁' : '📄'} ${item}`));
    }
    if (toDelete.length > 10) {
      console.log(chalk.gray(`  ... 以及 ${toDelete.length - 10} 个其他项目`));
    }
    console.log();
    console.log(chalk.cyan('.rag 目录将被保留'));
    console.log();
    console.log(chalk.gray('确认删除？输入 /delete force 或 /delete -f 确认'));
    return;
  }
  
  // 执行删除
  let deleted = 0;
  for (const item of toDelete) {
    const itemPath = join(workspace, item);
    try {
      rmSync(itemPath, { recursive: true, force: true });
      deleted++;
    } catch (error) {
      console.log(chalk.red(`删除失败: ${item}`));
    }
  }
  
  console.log(chalk.green(`✓ 已删除 ${deleted} 个项目`));
  console.log(chalk.gray('已保留: .rag 目录'));
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
      console.log(chalk.cyan('📚 初始化 RAG 知识库...'));
      
      try {
        // 检查嵌入模型
        const models = await state.modelAdapter.listModels();
        const embeddingModel = ragConfig.embeddingModel || 'all-minilm';
        const hasEmbeddingModel = models.some(m => m.includes(embeddingModel) || m === embeddingModel);
        
        if (hasEmbeddingModel) {
          console.log(chalk.green(`✓ 嵌入模型 ${embeddingModel} 已安装`));
        } else {
          console.log(chalk.yellow(`⚠ 嵌入模型 ${embeddingModel} 未安装`));
          console.log(chalk.gray(`  安装命令: ollama pull ${embeddingModel}`));
        }
        
        // 设置 RAG 配置
        const { ragManager } = await import('../rag/tools.js');
        ragManager.setAgentConfig(agent.id, {
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
        
        // 尝试初始化 RAG 存储
        const ragStore = await ragManager.getStore(agent);
        if (ragStore) {
          const stats = await ragStore.getStats();
          console.log(chalk.green(`✓ RAG 知识库已初始化`));
          console.log(chalk.gray(`  文档数量: ${stats.documentCount}`));
          console.log(chalk.gray(`  分块数量: ${stats.chunkCount}`));
          
          // 连接到记忆系统
          memoryManager.setRAGStore(ragStore);
          console.log(chalk.green('✓ RAG 已连接到记忆系统'));
        }
        
        const knowledgeDirs = ragConfig.knowledgeDirs || [];
        if (knowledgeDirs.length > 0) {
          console.log(chalk.gray(`  知识库目录: ${knowledgeDirs.join(', ')}`));
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(chalk.yellow(`⚠ RAG 初始化失败: ${msg}`));
        console.log(chalk.gray('  使用 /init-rag 查看初始化指引'));
      }
    } else {
      console.log();
      console.log(chalk.gray('RAG 未启用。配置 agent.rag.enabled = true 后可使用知识库检索功能。'));
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

async function handleRememberCommand(state: ReplState, content: string): Promise<void> {
  const { getMemoryManager } = await import('../core/memory.js');
  const memoryManager = getMemoryManager(state.config);
  
  if (!content || content.trim().length === 0) {
    console.log(chalk.yellow('用法: /remember <内容>'));
    console.log(chalk.gray('示例: /remember 用户偏好使用 TypeScript'));
    return;
  }
  
  try {
    // 使用 rememberToRAG 方法存储到 RAG 和记忆系统
    const result = await memoryManager.rememberToRAG(
      content.trim(),
      undefined,  // 自动生成标题
      ['user-memory']  // 标签
    );
    
    if (result.success) {
      console.log(chalk.green('✓ 已记住: ') + content.slice(0, 50) + (content.length > 50 ? '...' : ''));
      console.log(chalk.gray('这条记忆将在相关对话中自动被唤醒'));
    } else {
      console.log(chalk.red('✗ 存储失败: ') + result.message);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red('✗ 存储失败: ') + msg);
  }
}

async function handleRagCommand(state: ReplState, rl: readlinePromises.Interface, action?: string, args?: string[]): Promise<void> {
  const { ragManager } = await import('../rag/tools.js');
  const { getMemoryManager } = await import('../core/memory.js');
  const agent = state.agents.get(state.currentAgentId);
  
  if (!agent) {
    console.log(chalk.red('错误: 找不到 Agent'));
    return;
  }
  
  if (!action) {
    console.log(chalk.cyan('RAG 知识库命令:'));
    console.log('  /rag status       查看知识库状态');
    console.log('  /rag search <查询> 搜索知识库');
    console.log('  /rag index <路径>  添加文档到知识库');
    console.log('  /rag clear        清空知识库（不可恢复）');
    console.log();
    console.log(chalk.gray('提示: 需要在 Agent 配置中启用 rag.enabled = true'));
    return;
  }
  
  // 尝试从 ragManager 获取 store，或者从 memoryManager 获取
  const memoryManager = getMemoryManager(state.config);
  let store = await ragManager.getStore(agent);
  
  // 如果 Agent 没有配置 RAG，尝试使用全局记忆系统的 RAG
  if (!store) {
    const ragStore = memoryManager.getRAGStore();
    if (ragStore) {
      store = ragStore;
    } else {
      console.log(chalk.yellow('RAG 未启用'));
      console.log(chalk.gray('配置方法: 在 config.json 中设置 agent.rag.enabled = true'));
      console.log(chalk.gray('或者使用 /init-rag 查看初始化指引'));
      return;
    }
  }
  
  switch (action) {
    case 'status': {
      const stats = await store.getStats();
      console.log(chalk.cyan.bold('\n📚 RAG 知识库状态\n'));
      console.log(`  文档数量: ${stats.documentCount}`);
      console.log(`  分块数量: ${stats.chunkCount}`);
      console.log(`  嵌入状态: ${stats.hasEmbeddings ? '已启用' : '未启用'}`);
      if (stats.embeddingDimension) {
        console.log(`  嵌入维度: ${stats.embeddingDimension}`);
      }
      console.log(`  嵌入模型: ${agent.rag?.embeddingModel || '默认'}`);
      if (agent.rag?.enableRerank) {
        console.log(`  重排序模型: ${agent.rag.rerankModel || '未设置'}`);
      }
      console.log();
      break;
    }
    
    case 'search': {
      if (!args || args.length === 0) {
        console.log(chalk.yellow('用法: /rag search <查询内容>'));
        return;
      }
      
      const query = args.join(' ');
      console.log(chalk.cyan(`\n🔍 搜索: ${query}\n`));
      
      const results = await store.advancedSearch(query, 5);
      
      if (results.length === 0) {
        console.log(chalk.gray('未找到相关内容'));
        return;
      }
      
      for (let i = 0; i < results.length; i++) {
        const r = results[i]!;
        console.log(chalk.white(`\n### 结果 ${i + 1} (相关度: ${(r.score * 100).toFixed(1)}%)`));
        console.log(chalk.gray(`来源: ${r.chunk.metadata.source}`));
        console.log(chalk.gray('─'.repeat(40)));
        console.log(r.chunk.content.slice(0, 300) + (r.chunk.content.length > 300 ? '...' : ''));
      }
      console.log();
      break;
    }
    
    case 'index': {
      if (!args || args.length === 0) {
        console.log(chalk.yellow('用法: /rag index <文件或目录路径>'));
        return;
      }
      
      const path = args?.[0];
      if (!path) {
        console.log(chalk.yellow('用法: /rag index <文件或目录路径>'));
        return;
      }
      
      const { resolve, join } = await import('node:path');
      const { existsSync, statSync, readFileSync } = await import('node:fs');
      const { basename } = await import('node:path');
      const { getRootDir } = await import('../core/config.js');
      
      // ★ 处理知识库目录的特殊映射
      let fullPath: string;
      
      if (path === 'knowledge' || path === '/workspace/knowledge') {
        // 映射到知识库目录: {rootDir}/knowledge/{agent.id}
        const rootDir = getRootDir(state.config);
        fullPath = join(rootDir, 'knowledge', agent.id);
      } else if (path.startsWith('/workspace/')) {
        // 容器内路径 -> 主机路径
        const relativePath = path.slice('/workspace/'.length);
        fullPath = resolve(agent.workspace, relativePath);
      } else {
        // 相对路径
        fullPath = resolve(agent.workspace, path);
      }
      
      console.log(chalk.gray(`解析路径: ${fullPath}`));
      
      if (!existsSync(fullPath)) {
        console.log(chalk.red(`路径不存在: ${path}`));
        console.log(chalk.gray(`主机路径: ${fullPath}`));
        return;
      }
      
      console.log(chalk.cyan(`\n📥 索引: ${path}\n`));
      
      const stat = statSync(fullPath);
      let count = 0;
      
      if (stat.isDirectory()) {
        count = await store.addDirectory(fullPath);
        console.log(chalk.green(`✓ 已索引 ${count} 个文档`));
      } else {
        const content = readFileSync(fullPath, 'utf-8');
        await store.addDocument(content, {
          source: fullPath,
          title: basename(fullPath),
        });
        count = 1;
        console.log(chalk.green('✓ 已索引 1 个文档'));
      }
      console.log();
      break;
    }
    
    case 'clear':
    case 'reset': {
      const stats = await store.getStats();
      
      console.log(chalk.yellow('\n⚠️  清空知识库'));
      console.log(chalk.gray(`当前文档数: ${stats.documentCount}`));
      console.log(chalk.gray(`当前分块数: ${stats.chunkCount}`));
      console.log();
      console.log(chalk.red('此操作将删除所有已索引的文档，不可恢复！'));
      console.log();
      
      // ★ 使用已有的 rl 接口
      const answer = await rl.question(chalk.cyan('确认清空？(yes/no): '));
      
      if (answer.toLowerCase() === 'yes') {
        await ragManager.clearAgent(agent.id);
        console.log(chalk.green('\n✓ 知识库已清空'));
        
        // 同时删除知识库文件
        const { getRootDir } = await import('../core/config.js');
        const { rmSync, existsSync } = await import('node:fs');
        const { join } = await import('node:path');
        
        const rootDir = getRootDir(state.config);
        const knowledgeDir = join(rootDir, 'knowledge', agent.id);
        
        if (existsSync(knowledgeDir)) {
          rmSync(knowledgeDir, { recursive: true, force: true });
          console.log(chalk.gray(`已删除知识库目录: ${knowledgeDir}`));
        }
      } else {
        console.log(chalk.gray('已取消'));
      }
      break;
    }
    
    default:
      console.log(chalk.yellow(`未知操作: ${action}`));
      console.log(chalk.gray('可用操作: status, search, index, clear'));
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

// ============ Self-Improving 命令 ============

/**
 * 处理 /feedback 命令
 */
async function handleFeedbackCommand(
  state: ReplState,
  arg: string | undefined,
  parts: string[]
): Promise<void> {
  const feedbackCollector = getFeedbackCollector();
  
  if (!arg) {
    // 显示反馈帮助
    console.log(chalk.cyan('用户反馈:'));
    console.log('  /feedback <1-5> [评论]   提交评分（1-5分）');
    console.log('  /feedback good [评论]    正面反馈');
    console.log('  /feedback bad [评论]     负面反馈');
    console.log('  /feedback stats          查看反馈统计');
    console.log();
    console.log(chalk.gray('示例:'));
    console.log(chalk.gray('  /feedback 5 完美解决'));
    console.log(chalk.gray('  /feedback 3 还可以更快'));
    return;
  }
  
  const agent = state.agents.get(state.currentAgentId);
  if (!agent) return;
  
  const session = getOrCreateMainSession(agent);
  
  // 统计
  if (arg === 'stats') {
    const trends = await feedbackCollector.analyzeTrends(agent.id);
    console.log(chalk.cyan('反馈统计:'));
    console.log(`  总反馈数: ${trends.totalFeedback}`);
    console.log(`  平均评分: ${trends.averageRating.toFixed(2)}`);
    console.log(chalk.gray('\n  按类型:'));
    for (const [type, count] of Object.entries(trends.feedbackByType)) {
      if (count > 0) {
        console.log(chalk.gray(`    ${type}: ${count}`));
      }
    }
    if (trends.commonIssues.length > 0) {
      console.log(chalk.yellow('\n  常见问题:'));
      for (const issue of trends.commonIssues.slice(0, 3)) {
        console.log(chalk.yellow(`    - ${issue.slice(0, 50)}...`));
      }
    }
    return;
  }
  
  // 解析评分
  let rating: number | undefined;
  let content: string;
  
  if (/^[1-5]$/.test(arg)) {
    rating = parseInt(arg, 10);
    content = parts.slice(2).join(' ') || `用户评分: ${rating}/5`;
  } else if (arg === 'good') {
    rating = 5;
    content = parts.slice(2).join(' ') || '正面反馈';
  } else if (arg === 'bad') {
    rating = 2;
    content = parts.slice(2).join(' ') || '负面反馈';
  } else {
    // 其他情况当作评论
    content = [arg, ...parts.slice(2)].join(' ');
  }
  
  // 收集反馈
  await feedbackCollector.collect({
    agentId: agent.id,
    sessionId: session.sessionKey,
    type: rating !== undefined ? 'rating' : 'suggestion',
    rating,
    content,
  });
  
  console.log(chalk.green('✓ 感谢您的反馈！'));
  if (rating) {
    console.log(chalk.gray(`  评分: ${rating}/5`));
  }
  console.log(chalk.gray(`  内容: ${content}`));
  
  // 如果是低分，记录改进日志
  if (rating !== undefined && rating < 3) {
    const improvementLog = getImprovementLogManager();
    await improvementLog.log({
      agentId: agent.id,
      trigger: 'user_feedback',
      type: 'behavior_change',
      before: '当前行为',
      after: '需要改进',
      reason: content,
      userFeedback: content,
    });
    console.log(chalk.yellow('  已记录改进点，Agent 会从中学习'));
  }
}

/**
 * 处理 /improve 命令
 */
async function handleImproveCommand(
  state: ReplState,
  arg: string | undefined,
  _parts: string[],
  _sessionStorage: ReturnType<typeof getSessionStorage>
): Promise<void> {
  const improvementLog = getImprovementLogManager();
  const feedbackCollector = getFeedbackCollector();
  
  if (!arg) {
    // 显示改进状态
    const agent = state.agents.get(state.currentAgentId);
    if (!agent) return;
    
    const stats = await improvementLog.getStats(agent.id);
    const trends = await feedbackCollector.analyzeTrends(agent.id);
    
    console.log(chalk.cyan.bold(`\n📊 ${agent.name} 自我改进状态\n`));
    console.log(chalk.white('改进统计:'));
    console.log(`  总改进数: ${stats.totalImprovements}`);
    console.log(`  最近 7 天: ${stats.recentCount}`);
    console.log(`  平均效果: ${(stats.averageEffectiveness * 100).toFixed(0)}%`);
    
    console.log(chalk.white('\n用户反馈:'));
    console.log(`  总反馈: ${trends.totalFeedback}`);
    console.log(`  平均评分: ${trends.averageRating.toFixed(2)}/5`);
    
    // 显示最近改进
    const recentImprovements = await improvementLog.getRecentImprovements(agent.id, 7);
    if (recentImprovements.length > 0) {
      console.log(chalk.cyan('\n最近改进:'));
      for (const imp of recentImprovements.slice(0, 5)) {
        const time = new Date(imp.timestamp).toLocaleDateString('zh-CN');
        const emoji = imp.trigger === 'user_feedback' ? '💬' :
                     imp.trigger === 'task_success' ? '✅' :
                     imp.trigger === 'task_failure' ? '❌' : '📝';
        console.log(chalk.gray(`  ${time} ${emoji} ${imp.reason.slice(0, 50)}...`));
      }
    }
    
    console.log(chalk.gray('\n命令:'));
    console.log(chalk.gray('  /improve log       查看改进日志'));
    console.log(chalk.gray('  /improve stats     详细统计'));
    console.log(chalk.gray('  /improve feedback  查看用户反馈'));
    console.log(chalk.gray('  /improve success   查看成功模式'));
    console.log(chalk.gray('  /improve errors    查看错误模式'));
    console.log(chalk.gray('  /improve reflect   执行自我反思'));
    console.log(chalk.gray('  /improve optimize  优化 Prompt'));
    console.log(chalk.gray('  /improve skills    管理/生成技能'));
    console.log(chalk.gray('  /improve skill-optimize  优化技能'));
    console.log(chalk.gray('  /improve clear     清除改进数据'));
    console.log(chalk.gray('\n  /patterns          查看经验模式'));
    return;
  }
  
  const agent = state.agents.get(state.currentAgentId);
  if (!agent) return;
  
  switch (arg) {
    case 'log': {
      const entries = await improvementLog.getLog(agent.id, 20);
      if (entries.length === 0) {
        console.log(chalk.gray('暂无改进日志'));
      } else {
        console.log(chalk.cyan(`改进日志 (${entries.length} 条):\n`));
        for (const entry of entries) {
          const time = new Date(entry.timestamp).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });
          console.log(chalk.gray(`[${time}] ${entry.trigger} - ${entry.type}`));
          console.log(chalk.white(`  原因: ${entry.reason}`));
          if (entry.userFeedback) {
            console.log(chalk.gray(`  反馈: ${entry.userFeedback}`));
          }
          console.log();
        }
      }
      break;
    }
    
    case 'stats': {
      const stats = await improvementLog.getStats(agent.id);
      console.log(chalk.cyan('详细统计:\n'));
      console.log(chalk.white('按类型:'));
      for (const [type, count] of Object.entries(stats.byType)) {
        if (count > 0) {
          console.log(chalk.gray(`  ${type}: ${count}`));
        }
      }
      console.log(chalk.white('\n按触发源:'));
      for (const [trigger, count] of Object.entries(stats.byTrigger)) {
        if (count > 0) {
          console.log(chalk.gray(`  ${trigger}: ${count}`));
        }
      }
      break;
    }
    
    case 'feedback': {
      const feedbacks = await feedbackCollector.getFeedbackForAgent(agent.id, 20);
      if (feedbacks.length === 0) {
        console.log(chalk.gray('暂无用户反馈'));
      } else {
        console.log(chalk.cyan(`用户反馈 (${feedbacks.length} 条):\n`));
        for (const fb of feedbacks) {
          const time = new Date(fb.createdAt).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });
          const ratingStr = fb.rating ? ` [${fb.rating}/5]` : '';
          console.log(chalk.gray(`[${time}]${ratingStr} ${fb.type}`));
          console.log(chalk.white(`  ${fb.content}`));
          console.log();
        }
      }
      break;
    }
    
    case 'clear': {
      console.log(chalk.yellow('确定要清除所有改进数据吗？'));
      console.log(chalk.gray('这将删除: 改进日志、用户反馈、成功模式、错误模式'));
      // 简单起见，直接清除
      await improvementLog.clear(agent.id);
      await feedbackCollector.clearAgentFeedback(agent.id);
      
      const successStore = getSuccessPatternStore();
      const errorStore = getErrorPatternStore();
      await successStore.clearAgent(agent.id);
      await errorStore.clearAgent(agent.id);
      
      console.log(chalk.green('✓ 已清除所有改进数据'));
      break;
    }
    
    case 'success': {
      const successStore = getSuccessPatternStore();
      const patterns = await successStore.getPatternsByAgent(agent.id);
      
      if (patterns.length === 0) {
        console.log(chalk.gray('暂无成功模式记录'));
        console.log(chalk.gray('完成任务后会自动记录成功的经验'));
      } else {
        console.log(chalk.cyan.bold(`\n✅ 成功模式 (${patterns.length} 个)\n`));
        for (const p of patterns.slice(0, 10)) {
          const time = new Date(p.createdAt).toLocaleDateString('zh-CN');
          console.log(chalk.white(`${p.taskType}: ${p.taskDescription.slice(0, 50)}...`));
          console.log(chalk.gray(`  效果: ${(p.effectiveness * 100).toFixed(0)}% | 使用: ${p.usageCount} 次 | ${time}`));
          console.log();
        }
      }
      break;
    }
    
    case 'errors': {
      const errorStore = getErrorPatternStore();
      const patterns = await errorStore.getPatternsByAgent(agent.id);
      const unresolved = patterns.filter(p => !p.resolved);
      
      if (patterns.length === 0) {
        console.log(chalk.gray('暂无错误模式记录'));
      } else {
        console.log(chalk.cyan.bold(`\n❌ 错误模式 (${patterns.length} 个，${unresolved.length} 个未解决)\n`));
        for (const p of patterns.slice(0, 10)) {
          const status = p.resolved ? chalk.green('✓') : chalk.red('✗');
          console.log(chalk.white(`${status} ${p.errorType}: ${p.errorMessage.slice(0, 50)}...`));
          console.log(chalk.gray(`  发生: ${p.occurrenceCount} 次`));
          console.log();
        }
      }
      break;
    }
    
    case 'reflect': {
      console.log(chalk.cyan('\n🤔 正在进行自我反思...\n'));
      
      const reflectionEngine = getSelfReflectionEngine();
      const result = await reflectionEngine.reflect(agent.id);
      
      console.log(chalk.cyan.bold('📋 反思报告\n'));
      console.log(chalk.gray(`分析时间范围: ${new Date(result.timeRange.start).toLocaleString('zh-CN')} - ${new Date(result.timeRange.end).toLocaleString('zh-CN')}`));
      console.log(chalk.gray(`分析任务数: ${result.tasksAnalyzed}\n`));
      
      // 做得好的方面
      console.log(chalk.green.bold('✅ 做得好的方面:'));
      for (const item of result.whatWentWell) {
        console.log(chalk.green(`  • ${item}`));
      }
      
      // 需要改进
      console.log(chalk.yellow.bold('\n⚠️ 需要改进:'));
      for (const item of result.whatCouldBeImproved) {
        console.log(chalk.yellow(`  • ${item}`));
      }
      
      // 学到的教训
      console.log(chalk.blue.bold('\n📚 学到的教训:'));
      for (const item of result.lessonsLearned) {
        console.log(chalk.blue(`  • ${item}`));
      }
      
      // 改进建议
      if (result.suggestedActions.length > 0) {
        console.log(chalk.magenta.bold('\n💡 改进建议:'));
        for (const action of result.suggestedActions) {
          const priorityEmoji = action.priority === 'high' ? '🔴' : 
                               action.priority === 'medium' ? '🟡' : '🟢';
          console.log(chalk.magenta(`  ${priorityEmoji} ${action.description}`));
          console.log(chalk.gray(`     预期效果: ${action.expectedOutcome}`));
        }
      }
      
      // 自我评估
      console.log(chalk.white.bold('\n📊 自我评估:'));
      console.log(`  整体表现: ${result.selfAssessment.overallPerformance}/100`);
      console.log(`  信心水平: ${result.selfAssessment.confidenceLevel}/100`);
      if (result.selfAssessment.areasToFocus.length > 0) {
        console.log(chalk.gray(`  关注领域: ${result.selfAssessment.areasToFocus.join(', ')}`));
      }
      
      console.log();
      break;
    }
    
    case 'optimize': {
      console.log(chalk.cyan('\n⚡ 优化 Agent Prompt...\n'));
      
      const promptOptimizer = getPromptOptimizer();
      const basePrompt = agent.systemPrompt || '你是一个有帮助的 AI 助手。';
      
      await promptOptimizer.optimizePrompt(agent.id, basePrompt);
      
      console.log(chalk.green('✓ Prompt 已优化'));
      console.log(chalk.gray('\n注入的经验内容:'));
      
      const injection = promptOptimizer.getCachedInjection(agent.id);
      if (injection) {
        console.log(chalk.gray(injection.slice(0, 500) + (injection.length > 500 ? '...' : '')));
      } else {
        console.log(chalk.gray('  (暂无学习到的经验)'));
      }
      
      console.log(chalk.gray('\n提示: 优化后的 Prompt 会在下次对话时生效'));
      break;
    }
    
    case 'skills': {
      const skillGenerator = getSkillGenerator();
      const skills = await skillGenerator.getSkillsByAgent(agent.id);
      
      if (skills.length === 0) {
        console.log(chalk.gray('暂无自动生成的技能'));
        console.log(chalk.gray('完成任务后会自动从成功模式生成技能'));
      } else {
        console.log(chalk.cyan.bold(`\n🛠️ 自动生成的技能 (${skills.length} 个)\n`));
        for (const skill of skills) {
          const sourceEmoji = skill.source === 'success_pattern' ? '✅' :
                             skill.source === 'user_request' ? '👤' : 
                             skill.source === 'merged' ? '↔' : '🤖';
          console.log(chalk.white(`${sourceEmoji} ${skill.name}`));
          console.log(chalk.gray(`  描述: ${skill.description.slice(0, 50)}...`));
          console.log(chalk.gray(`  使用: ${skill.usageCount} 次 | 成功率: ${(skill.successRate * 100).toFixed(0)}%`));
          console.log();
        }
      }
      break;
    }
    
    case 'skill-optimize':
    case 'skillopt': {
      console.log(chalk.cyan('🔍 检查技能优化机会...'));
      
      const skillGenerator = getSkillGenerator();
      const result = await skillGenerator.checkAndGenerateSkills(agent.id);
      
      console.log();
      if (result.generated.length > 0) {
        console.log(chalk.green.bold(`✓ 生成 ${result.generated.length} 个新技能:`));
        for (const skill of result.generated) {
          console.log(chalk.gray(`  - ${skill.name}`));
        }
      }
      
      if (result.merged.length > 0) {
        console.log(chalk.cyan.bold(`↔ 合并 ${result.merged.length} 组相似技能:`));
        for (const merge of result.merged) {
          console.log(chalk.gray(`  - ${merge.from.length} 个 → ${merge.to}`));
        }
      }
      
      if (result.retired.length > 0) {
        console.log(chalk.yellow.bold(`✗ 淘汰 ${result.retired.length} 个低效技能`));
      }
      
      if (result.generated.length === 0 && result.merged.length === 0 && result.retired.length === 0) {
        console.log(chalk.gray('暂无优化建议'));
      }
      
      // 显示技能质量评估
      console.log();
      console.log(chalk.cyan('📊 技能质量评估:'));
      const evaluations = await skillGenerator.evaluateSkillQuality(agent.id);
      
      for (const evaluation of evaluations.slice(0, 5)) {
        const scoreColor = evaluation.score >= 60 ? chalk.green : 
                          evaluation.score >= 40 ? chalk.yellow : chalk.red;
        console.log(scoreColor(`  ${evaluation.skill.name}: ${evaluation.score.toFixed(0)} 分`));
        if (evaluation.issues.length > 0) {
          console.log(chalk.gray(`    问题: ${evaluation.issues.join(', ')}`));
        }
      }
      break;
    }
    
    default:
      console.log(chalk.yellow(`未知参数: ${arg}`));
      console.log(chalk.gray('可用: log, stats, feedback, success, errors, reflect, optimize, skills, clear'));
  }
}

/**
 * 处理 /patterns 命令 - 查看成功/错误模式
 */
async function handlePatternsCommand(
  state: ReplState,
  arg: string | undefined
): Promise<void> {
  const successStore = getSuccessPatternStore();
  const errorStore = getErrorPatternStore();
  
  const agent = state.agents.get(state.currentAgentId);
  if (!agent) return;
  
  if (arg === 'success') {
    const patterns = await successStore.getPatternsByAgent(agent.id);
    if (patterns.length === 0) {
      console.log(chalk.gray('暂无成功模式记录'));
      console.log(chalk.gray('完成任务后会自动记录成功的经验'));
    } else {
      console.log(chalk.cyan.bold(`\n✅ 成功模式 (${patterns.length} 个)\n`));
      for (const p of patterns.slice(0, 10)) {
        const time = new Date(p.createdAt).toLocaleDateString('zh-CN');
        console.log(chalk.white(`${p.taskType}: ${p.taskDescription.slice(0, 50)}...`));
        console.log(chalk.gray(`  效果: ${(p.effectiveness * 100).toFixed(0)}% | 使用: ${p.usageCount} 次 | ${time}`));
        if (p.toolsUsed.length > 0) {
          console.log(chalk.gray(`  工具: ${p.toolsUsed.slice(0, 3).join(', ')}`));
        }
        console.log();
      }
    }
  } else if (arg === 'errors') {
    const patterns = await errorStore.getPatternsByAgent(agent.id);
    const unresolved = patterns.filter(p => !p.resolved);
    
    if (patterns.length === 0) {
      console.log(chalk.gray('暂无错误模式记录'));
    } else {
      console.log(chalk.cyan.bold(`\n❌ 错误模式 (${patterns.length} 个，${unresolved.length} 个未解决)\n`));
      for (const p of patterns.slice(0, 10)) {
        const status = p.resolved ? chalk.green('✓') : chalk.red('✗');
        console.log(chalk.white(`${status} ${p.errorType}: ${p.errorMessage.slice(0, 50)}...`));
        console.log(chalk.gray(`  发生: ${p.occurrenceCount} 次 | 上下文: ${p.taskContext.slice(0, 40)}...`));
        if (p.solution) {
          console.log(chalk.gray(`  解决: ${p.solution.slice(0, 60)}...`));
        }
        console.log();
      }
    }
  } else if (arg === 'stats') {
    const successStats = await successStore.getStats(agent.id);
    const errorStats = await errorStore.getStats(agent.id);
    
    console.log(chalk.cyan.bold('\n📊 经验模式统计\n'));
    
    console.log(chalk.white('成功模式:'));
    console.log(`  总数: ${successStats.totalPatterns}`);
    console.log(`  平均效果: ${(successStats.averageEffectiveness * 100).toFixed(0)}%`);
    console.log(`  总使用次数: ${successStats.totalUsage}`);
    
    console.log(chalk.white('\n错误模式:'));
    console.log(`  总数: ${errorStats.totalPatterns}`);
    console.log(`  未解决: ${errorStats.unresolvedCount}`);
    console.log(`  总发生次数: ${errorStats.totalOccurrences}`);
    
    // 显示按任务类型的成功模式分布
    if (successStats.totalPatterns > 0) {
      console.log(chalk.white('\n成功模式分布:'));
      for (const [type, count] of Object.entries(successStats.byTaskType)) {
        if (count > 0) {
          console.log(chalk.gray(`  ${type}: ${count}`));
        }
      }
    }
    
  } else {
    console.log(chalk.cyan('经验模式管理:'));
    console.log('  /patterns success  查看成功模式');
    console.log('  /patterns errors   查看错误模式');
    console.log('  /patterns stats    查看统计');
  }
}

/**
 * 处理 /context 命令
 */
async function handleContextCommand(state: ReplState): Promise<void> {
  const { getContextManager } = await import('../core/context-manager.js');
  const contextManager = getContextManager();
  
  const session = state.sessions.get(state.currentSessionKey);
  if (!session) {
    console.log(chalk.yellow('当前没有活动会话'));
    return;
  }
  
  // 获取可用工具
  const agent = state.agents.get(state.currentAgentId);
  const tools = agent ? getAvailableTools(agent, state.config.tools) : undefined;
  
  // 构建消息列表
  const messages = [
    { role: 'system' as const, content: '(系统提示)' },
    ...session.history,
  ];
  
  // 显示统计
  console.log(contextManager.formatStats(messages, tools));
  
  // 显示优化建议
  const suggestions = contextManager.getOptimizationSuggestions(messages, tools);
  if (suggestions.length > 0) {
    console.log();
    console.log(chalk.cyan('💡 优化建议:'));
    for (const suggestion of suggestions) {
      console.log(chalk.gray(`  • ${suggestion}`));
    }
  }
}

/**
 * 处理 /ollama 命令
 */
async function handleOllamaCommand(state: ReplState, arg?: string): Promise<void> {
  const { OllamaAdapter } = await import('../model/ollama.js');
  
  // 获取当前模型适配器
  const adapter = state.modelAdapter;
  if (!(adapter instanceof OllamaAdapter)) {
    console.log(chalk.yellow('当前模型不是 Ollama'));
    console.log(chalk.gray('使用 /model 命令切换到 Ollama 模型'));
    return;
  }
  
  if (arg === 'check') {
    console.log(chalk.cyan('正在检查 Ollama 服务...'));
    const result = await adapter.checkConnection();
    
    if (result.connected) {
      console.log(chalk.green('✓ Ollama 服务运行正常'));
      if (result.models && result.models.length > 0) {
        console.log(chalk.cyan('\n可用模型:'));
        for (const model of result.models) {
          console.log(chalk.gray(`  - ${model}`));
        }
      }
    } else {
      console.log(chalk.red(`✗ Ollama 服务不可用: ${result.error}`));
      console.log(chalk.gray('\n解决方案:'));
      console.log(chalk.gray('  1. 启动 Ollama: ollama serve'));
      console.log(chalk.gray('  2. 或使用 /model 切换到云端模型'));
    }
  } else if (arg === 'status') {
    const status = adapter.getConnectionStatus();
    const statusText = {
      unknown: chalk.gray('未知'),
      connected: chalk.green('已连接'),
      disconnected: chalk.red('已断开'),
    }[status];
    
    console.log(chalk.cyan('Ollama 状态:'));
    console.log(`  连接: ${statusText}`);
    console.log(`  地址: ${adapter['baseUrl']}`);
    console.log(`  默认模型: ${adapter['defaultModel']}`);
    console.log(`  超时: ${adapter['timeout'] / 1000}秒`);
  } else {
    console.log(chalk.cyan('Ollama 管理:'));
    console.log('  /ollama check   检查服务连接');
    console.log('  /ollama status  查看连接状态');
  }
}

/**
 * 处理统一搜索命令
 */
async function handleUnifiedSearchCommand(
  state: ReplState,
  query: string
): Promise<void> {
  const { getUnifiedStore } = await import('../core/self-improving/unified-store.js');
  const store = getUnifiedStore();
  
  if (!query) {
    // 显示统计
    const stats = await store.stats();
    console.log(chalk.cyan.bold('\n📊 统一存储统计\n'));
    console.log(`总计: ${stats.total} 条`);
    console.log('\n按类型:');
    console.log(`  记忆: ${stats.byType.memory}`);
    console.log(`  成功模式: ${stats.byType.success}`);
    console.log(`  错误模式: ${stats.byType.error}`);
    console.log(`  反馈: ${stats.byType.feedback}`);
    console.log('\n用法:');
    console.log('  /unified <查询词>  统一搜索');
    console.log('  /us <查询词>       简写');
    return;
  }
  
  const agent = state.agents.get(state.currentAgentId);
  
  // 搜索
  const results = await store.search(query, {
    agentId: agent?.id,
    limit: 10,
  });
  
  if (results.length === 0) {
    console.log(chalk.gray('未找到相关内容'));
    return;
  }
  
  console.log(chalk.cyan.bold(`\n🔍 搜索结果 (${results.length} 条)\n`));
  
  for (const result of results) {
    const typeEmoji = {
      memory: '📝',
      success: '✅',
      error: '❌',
      feedback: '💬',
    }[result.entry.type];
    
    const typeLabel = {
      memory: '记忆',
      success: '成功',
      error: '错误',
      feedback: '反馈',
    }[result.entry.type];
    
    console.log(chalk.white(`${typeEmoji} [${typeLabel}] ${(result.score * 100).toFixed(0)}%`));
    console.log(chalk.gray(result.entry.content.slice(0, 150)) + (result.entry.content.length > 150 ? '...' : ''));
    if (result.highlights && result.highlights.length > 0) {
      console.log(chalk.yellow(`  匹配: ${result.highlights[0]}`));
    }
    console.log();
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
  console.log('  /delete [force]  清除工作空间（保留 .rag）');
  console.log('  /save            手动保存所有会话');
  console.log('  /sessions        列出已保存的会话');
  console.log('  /export [format] 导出会话 (markdown/json/txt)');
  console.log('  /confirm [on/off/always]  敏感操作确认设置');
  console.log('  /clear           清屏');
  console.log();
  console.log(chalk.cyan('用户反馈:'));
  console.log('  /feedback <1-5> [评论]   提交评分');
  console.log('  /feedback stats          查看反馈统计');
  console.log();
  console.log(chalk.cyan('自我改进:'));
  console.log('  /improve          查看 Agent 改进状态');
  console.log('  /improve log      查看改进日志');
  console.log('  /improve feedback 查看用户反馈');
  console.log('  /improve reflect  执行自我反思');
  console.log('  /improve optimize 优化 Prompt');
  console.log('  /improve skills   查看自动生成的技能');
  console.log('  /improve skill-optimize  优化技能');
  console.log();
  console.log(chalk.cyan('经验模式:'));
  console.log('  /patterns success 查看成功模式');
  console.log('  /patterns errors  查看错误模式');
  console.log('  /patterns stats   查看统计');
  console.log();
  console.log(chalk.cyan('记忆系统:'));
  console.log('  /init-memory     初始化当前 Agent 的记忆');
  console.log('  /remember <内容> 存储重要信息到记忆系统');
  console.log('  /memory stats    显示记忆统计和内存状态');
  console.log('  /memory cleanup  清理内存缓存');
  console.log('  /memory search   搜索记忆内容');
  console.log(chalk.gray('  提示: 告诉 Agent "记住xxx" 会自动记录'));
  console.log(chalk.gray('  提示: /remember 存储的信息会在相关对话中自动唤醒'));
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
  console.log('  /rag status               查看知识库状态');
  console.log('  /rag search <查询>        搜索知识库');
  console.log('  /rag index <路径>         添加文档到知识库');
  console.log('  /rag clear                清空知识库');
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
  console.log(chalk.gray('提示: 使用 /ralph 管理后台 Ralph 任务'));
  console.log();
}

/**
 * 处理 Ralph 后台任务命令
 */
async function handleRalphCommand(
  _state: ReplState,
  subCommand: string,
  args: string[]
): Promise<void> {
  const { listTasks, loadTask, cancelTask, getTaskLog, formatTaskStatus } = await import('./daemon.js');
  
  switch (subCommand) {
    case 'status': {
      const tasks = listTasks({ runningOnly: true });
      if (tasks.length === 0) {
        console.log(chalk.gray('没有运行中的后台任务'));
      } else {
        console.log(chalk.cyan.bold(`\n运行中的任务 (${tasks.length}):\n`));
        for (const task of tasks) {
          console.log(formatTaskStatus(task));
          console.log();
        }
      }
      break;
    }
    
    case 'list': {
      const tasks = listTasks({ limit: 10 });
      if (tasks.length === 0) {
        console.log(chalk.gray('没有后台任务'));
      } else {
        console.log(chalk.cyan.bold(`\n最近任务 (${tasks.length}):\n`));
        for (const task of tasks) {
          const statusEmoji = {
            pending: '⏳',
            running: '🔄',
            completed: '✅',
            failed: '❌',
            cancelled: '🚫',
          };
          console.log(`${statusEmoji[task.status]} ${task.id}: ${task.task.slice(0, 40)}...`);
        }
        console.log();
        console.log(chalk.gray('查看详情: /ralph show <taskId>'));
      }
      break;
    }
    
    case 'show': {
      const taskId = args[0];
      if (!taskId) {
        console.log(chalk.yellow('用法: /ralph show <taskId>'));
        break;
      }
      
      const task = loadTask(taskId);
      if (!task) {
        console.log(chalk.red(`任务不存在: ${taskId}`));
        break;
      }
      
      console.log();
      console.log(formatTaskStatus(task));
      console.log();
      break;
    }
    
    case 'log': {
      const taskId = args[0];
      if (!taskId) {
        console.log(chalk.yellow('用法: /ralph log <taskId>'));
        break;
      }
      
      const log = getTaskLog(taskId);
      if (!log) {
        console.log(chalk.red(`日志不存在: ${taskId}`));
        break;
      }
      
      console.log();
      console.log(chalk.cyan.bold(`日志: ${taskId}`));
      console.log(chalk.gray('─'.repeat(40)));
      console.log(log);
      break;
    }
    
    case 'cancel': {
      const taskId = args[0];
      if (!taskId) {
        console.log(chalk.yellow('用法: /ralph cancel <taskId>'));
        break;
      }
      
      const task = loadTask(taskId);
      if (!task) {
        console.log(chalk.red(`任务不存在: ${taskId}`));
        break;
      }
      
      if (task.status !== 'running') {
        console.log(chalk.yellow(`任务已结束: ${task.status}`));
        break;
      }
      
      cancelTask(taskId);
      console.log(chalk.green(`✓ 已取消任务: ${taskId}`));
      break;
    }
    
    default:
      console.log(chalk.cyan.bold('\nRalph 后台任务管理\n'));
      console.log('命令:');
      console.log('  /ralph status           查看运行中的任务');
      console.log('  /ralph list             列出最近任务');
      console.log('  /ralph show <taskId>    查看任务详情');
      console.log('  /ralph log <taskId>     查看任务日志');
      console.log('  /ralph cancel <taskId>  取消运行中的任务');
      console.log();
  }
}

/**
 * 处理分支命令
 */
async function handleBranchCommand(
  subCommand: string,
  args: string[]
): Promise<void> {
  const { 
    createBranch, 
    listBranches, 
    deleteBranch, 
    abandonBranch, 
    restoreBranch,
    formatBranchList,
    formatBranchDetail,
    renderBranchTree,
  } = await import('./branch.js');
  
  switch (subCommand) {
    case 'create': {
      const name = args[0];
      if (!name) {
        console.log(chalk.yellow('用法: /branch create <名称> [描述]'));
        break;
      }
      
      const description = args.slice(1).join(' ');
      const branch = createBranch(name, 'main', 0, description);
      
      console.log(chalk.green(`✓ 已创建分支: ${branch.name}`));
      console.log(chalk.gray(`ID: ${branch.id}`));
      break;
    }
    
    case 'list': {
      const branches = listBranches();
      console.log(chalk.cyan.bold('\n📋 分支列表\n'));
      console.log(formatBranchList(branches));
      console.log();
      break;
    }
    
    case 'tree': {
      const includeAbandoned = args[0] === '--all';
      console.log();
      console.log(renderBranchTree(includeAbandoned));
      console.log();
      break;
    }
    
    case 'show': {
      const branchId = args[0];
      if (!branchId) {
        console.log(chalk.yellow('用法: /branch show <分支名或ID>'));
        break;
      }
      
      // 尝试通过名称或 ID 查找
      const branches = listBranches();
      const branch = branches.find(b => b.id === branchId || b.name === branchId);
      
      if (!branch) {
        console.log(chalk.red(`分支不存在: ${branchId}`));
        break;
      }
      
      console.log();
      console.log(formatBranchDetail(branch));
      console.log();
      break;
    }
    
    case 'abandon': {
      const branchId = args[0];
      if (!branchId) {
        console.log(chalk.yellow('用法: /branch abandon <分支名或ID>'));
        break;
      }
      
      const branches = listBranches();
      const branch = branches.find(b => b.id === branchId || b.name === branchId);
      
      if (!branch) {
        console.log(chalk.red(`分支不存在: ${branchId}`));
        break;
      }
      
      abandonBranch(branch.id);
      console.log(chalk.yellow(`✓ 已废弃分支: ${branch.name}`));
      break;
    }
    
    case 'restore': {
      const branchId = args[0];
      if (!branchId) {
        console.log(chalk.yellow('用法: /branch restore <分支名或ID>'));
        break;
      }
      
      const branches = listBranches();
      const branch = branches.find(b => b.id === branchId || b.name === branchId);
      
      if (!branch) {
        console.log(chalk.red(`分支不存在: ${branchId}`));
        break;
      }
      
      restoreBranch(branch.id);
      console.log(chalk.green(`✓ 已恢复分支: ${branch.name}`));
      break;
    }
    
    case 'delete': {
      const branchId = args[0];
      if (!branchId) {
        console.log(chalk.yellow('用法: /branch delete <分支名或ID>'));
        break;
      }
      
      const branches = listBranches();
      const branch = branches.find(b => b.id === branchId || b.name === branchId);
      
      if (!branch) {
        console.log(chalk.red(`分支不存在: ${branchId}`));
        break;
      }
      
      deleteBranch(branch.id);
      console.log(chalk.green(`✓ 已删除分支: ${branch.name}`));
      break;
    }
    
    default:
      console.log(chalk.cyan.bold('\n🌿 会话分支管理\n'));
      console.log('命令:');
      console.log('  /branch create <名称> [描述]  创建新分支');
      console.log('  /branch list                  列出所有分支');
      console.log('  /branch tree [--all]          显示分支树');
      console.log('  /branch show <名称|ID>        查看分支详情');
      console.log('  /branch abandon <名称|ID>     废弃分支');
      console.log('  /branch restore <名称|ID>     恢复分支');
      console.log('  /branch delete <名称|ID>      删除分支');
      console.log();
      console.log(chalk.gray('提示: 分支允许你尝试不同方案后选择最佳结果'));
      console.log();
  }
}