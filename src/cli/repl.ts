/**
 * REPL (Read-Eval-Print Loop)
 * 
 * 交互式聊天界面，支持流式输出和会话持久化
 */

import * as readlinePromises from 'node:readline/promises';
import chalk from 'chalk';
import type { ReplState, Agent, Message, ChatParams } from '../core/types.js';
import { loadConfig, createDefaultConfig } from '../core/config.js';
import { createAgents, parseAgentPrefix, getDefaultAgent, getOrCreateMainSession } from '../core/agent.js';
import { addUserMessage, addAssistantMessage, addToolResultMessage, buildSystemPrompt, clearSessionHistory } from '../core/session.js';
import { OllamaAdapter, type StreamCallback } from '../model/ollama.js';
import { getAvailableTools, executeTool, getAvailableToolNames } from '../tools/index.js';
import { getSessionStorage } from '../core/session-storage.js';
import { getAuditLogger } from '../core/audit.js';
import { getMemoryManager } from '../core/memory.js';
import { getSkillManager } from '../core/skills.js';
import { getTaskManager, type TaskManager } from '../core/task-manager.js';
import {
  assessComplexity,
  parseTaskPlan,
  renderTaskProgress,
  updateStepStatus,
  getNextPendingStep,
  isPlanCompleted,
  getPlanSummary,
  type TaskPlan,
} from '../core/smart-task.js';
import {
  getConfirmationManager,
  type ConfirmationRequest,
  type ConfirmationHandler,
} from '../core/confirmation.js';

// ============ 常量 ============

/** 最大工具调用轮数（安全兜底，正常情况下不触发） */
const MAX_TOOL_ROUNDS = 100;

// ============ REPL 启动 ============

interface ReplOptions {
  defaultAgent?: string;
  model?: string;
  noTools?: boolean;
  /** 是否加载持久化会话 */
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

  // 工具已在 tools/index.ts 中自动注册
  // 初始化会话存储
  const sessionStorage = getSessionStorage();
  await sessionStorage.initialize();

  // 初始化记忆系统
  const memoryManager = getMemoryManager();
  await memoryManager.initialize();
  const memoryStats = memoryManager.getStats();
  console.log(chalk.green(`✓ 记忆系统就绪 (${memoryStats.totalEntries} 条记忆)`));

  // 初始化技能系统
  const skillManager = getSkillManager();
  await skillManager.initialize();
  const publicSkills = await skillManager.listPublicSkills();
  if (publicSkills.length > 0) {
    console.log(chalk.green(`✓ 技能系统就绪 (${publicSkills.length} 个公共技能)`));
  }

  // 初始化确认管理器
  const confirmationManager = getConfirmationManager();
  
  // 设置确认处理器
  const confirmationHandler: ConfirmationHandler = async (request) => {
    return await showConfirmationDialog(request, rl);
  };
  confirmationManager.setHandler(confirmationHandler);

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

  // 创建 readline 接口 (使用 promises 版本)
  const rl = readlinePromises.createInterface({ 
    input: process.stdin, 
    output: process.stdout 
  });

  // 注册退出处理
  const exitHandler = async () => {
    await saveAllSessions(agents, sessionStorage);
  };
  
  // Ctrl+C 处理：第一次提示，第二次退出
  let ctrlCount = 0;
  let ctrlTimer: ReturnType<typeof setTimeout> | null = null;
  
  process.on('SIGINT', async () => {
    // 如果在执行中，打断执行
    if (state.executing) {
      console.log(chalk.yellow('\n[已打断当前操作]'));
      state.interrupted = true;
      return;
    }
    
    // 在等待输入时
    ctrlCount++;
    if (ctrlCount >= 2) {
      console.log(chalk.gray('\n正在退出...'));
      await exitHandler();
      process.exit(0);
    }
    
    console.log(chalk.gray('\n按 Ctrl+C 再次退出，或输入 /help 查看帮助'));
    
    // 1 秒内没按第二次，重置计数
    if (ctrlTimer) clearTimeout(ctrlTimer);
    ctrlTimer = setTimeout(() => { ctrlCount = 0; }, 1000);
  });
  
  process.on('SIGTERM', async () => {
    await exitHandler();
    process.exit(0);
  });

  // 主循环
  while (state.running) {
    // 获取当前 Agent
    const agent = agents.get(state.currentAgentId) ?? getDefaultAgent(agents);
    if (!agent) {
      console.log(chalk.red('错误: 找不到 Agent'));
      break;
    }

    // 提示符
    const prompt = chalk.cyan(`[${agent.name}] > `);
    const inputLine = await rl.question(prompt);

    // 处理空输入
    if (!inputLine.trim()) {
      continue;
    }

    // 处理命令
    if (inputLine.startsWith('/')) {
      await handleCommand(state, inputLine.trim(), rl, sessionStorage);
      continue;
    }

    // 解析 @ 前缀
    const { agentId, message } = parseAgentPrefix(inputLine);
    
    if (agentId) {
      // 切换 Agent
      const targetAgent = agents.get(agentId);
      if (targetAgent) {
        state.currentAgentId = agentId;
        // 显示醒目的切换提示
        console.log();
        console.log(chalk.cyan('┌─────────────────────────────────────┐'));
        console.log(chalk.cyan('│') + chalk.white.bold(`  🤖 正在与 ${targetAgent.name} 对话`).padEnd(37) + chalk.cyan('│'));
        console.log(chalk.cyan('└─────────────────────────────────────┘'));
        console.log();
        
        // 检查 Agent 记忆是否已初始化
        const memStatus = await memoryManager.isAgentInitialized(agentId);
        if (!memStatus.initialized) {
          console.log(chalk.yellow('💡 检测到该 Agent 尚未初始化记忆系统'));
          console.log(chalk.gray('─'.repeat(45)));
          console.log(chalk.white('初始化后 Agent 可以：'));
          console.log(chalk.gray('  • 记住你的偏好和重要信息'));
          console.log(chalk.gray('  • 保持跨会话的上下文'));
          console.log(chalk.gray('  • 学习和适应用户习惯'));
          console.log();
          console.log(chalk.white('初始化方法：'));
          console.log(chalk.cyan('  /init-memory'));
          console.log(chalk.gray('  或告诉 Agent："记住我的名字是xxx"'));
          console.log(chalk.gray('─'.repeat(45)));
          console.log();
        }
        
        // 如果有消息，继续处理
        if (message.trim()) {
          await processMessage(state, targetAgent, message.trim(), rl, sessionStorage);
        }
      } else {
        console.log(chalk.red(`Agent 不存在: ${agentId}`));
        console.log(chalk.gray(`可用 Agent: ${Array.from(agents.keys()).join(', ')}`));
      }
    } else {
      // 使用当前 Agent 处理消息
      await processMessage(state, agent, message, rl, sessionStorage);
    }
  }

  // 保存所有会话
  await exitHandler();
  rl.close();
}

// ============ 消息处理 ============

async function processMessage(
  state: ReplState,
  agent: Agent,
  message: string,
  rl: readlinePromises.Interface,
  sessionStorage?: ReturnType<typeof getSessionStorage>
): Promise<void> {
  // 标记正在执行
  state.executing = true;
  state.interrupted = false;
  
  try {
    const session = getOrCreateMainSession(agent);
    
    // 添加用户消息
    addUserMessage(session, message);
  
  // 记录用户请求到记忆
  const memoryManager = getMemoryManager();
  await memoryManager.remember(agent.id, `用户请求: ${message}`, 'conversation', 3);
  
  // 判断任务复杂度
  const complexity = assessComplexity(message);
  let currentPlan: TaskPlan | null = null;
  let lastPlanRender = '';
  
  if (complexity === 'complex') {
    console.log();
    console.log(chalk.cyan('🔍 检测到复杂任务，系统将先制定计划...'));
    console.log();
  }
  
  // 自动保存
  if (sessionStorage) {
    await sessionStorage.saveSession(session);
  }
  
  // 获取可用工具
  const availableTools = getAvailableTools(agent, state.config.tools);

  // 加载技能提示词
  const skillManager = getSkillManager();
  const skillsPrompt = await skillManager.buildSkillsPrompt(agent.id, agent.skills);

  // 构建系统提示
  let systemPrompt = await buildSystemPrompt(
    agent,
    state.config,
    getAvailableToolNames(agent, state.config.tools),
    skillsPrompt
  );
  
  // 如果是复杂任务，在提示词最前面添加强制规划指令
  if (complexity === 'complex') {
    const planInstruction = `
══════════════════════════════════════════════════════════════════
                   ⚠️  复杂任务规划模式
══════════════════════════════════════════════════════════════════

你必须先输出任务计划，格式如下：

# 执行计划

1. 步骤描述
2. 步骤描述
3. 步骤描述
...

要求：
- 只输出计划，不要输出介绍、解释或其他内容
- 不要调用任何工具
- 计划输出后等待系统指示

`;
    systemPrompt = planInstruction + systemPrompt;
  }

  // 多轮工具调用循环
  let round = 0;
  let lastContent = '';
  let planAttempts = 0;  // 规划尝试次数
  const MAX_PLAN_ATTEMPTS = 3;  // 最大规划尝试次数
  
  while (round < MAX_TOOL_ROUNDS) {
    // 检查是否被打断
    if (state.interrupted) {
      console.log(chalk.yellow('\n[操作已打断]'));
      return;
    }
    
    round++;
    
    // 构建消息列表
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...session.history,
    ];

    // 显示思考提示
    if (round === 1) {
      process.stdout.write(chalk.gray('思考中... '));
    } else {
      process.stdout.write(chalk.gray(`继续思考 (轮次 ${round})... `));
    }
    
    // 复杂任务：有计划之前不传工具
    let toolsForThisRound = availableTools;
    if (complexity === 'complex' && !currentPlan) {
      toolsForThisRound = [];  // 没有计划不给工具
    }
    
    let result;
    try {
      // 使用流式输出
      let streamStarted = false;
      let hasContent = false;
      let interrupted = false;
      
      // 设置中断监听
      const handleInterrupt = () => {
        interrupted = true;
        process.stdout.write('\n' + chalk.yellow('[已打断]') + '\n');
      };
      
      // 监听 Ctrl+C
      process.once('SIGINT', handleInterrupt);
      
      const onStream: StreamCallback = (chunk) => {
        if (interrupted) return;
        
        if (!streamStarted && chunk.content) {
          // 首次收到内容，显示 Agent 名称后开始输出
          process.stdout.write('\n' + chalk.cyan(`[${agent.name}]`) + '\n');
          streamStarted = true;
        }
        
        if (chunk.content) {
          hasContent = true;
          // 直接输出内容，不做额外处理
          process.stdout.write(chunk.content);
        }
        
        // 流结束时换行
        if (chunk.done && hasContent) {
          process.stdout.write('\n');
        }
      };
      
      // 检查是否支持流式
      if (state.modelAdapter.chatWithStream) {
        result = await state.modelAdapter.chatWithStream({
          model: state.config.model.model,
          messages,
          tools: toolsForThisRound.length > 0 ? toolsForThisRound : undefined,
          onStream,
        } as ChatParams & { onStream: StreamCallback });
      } else {
        // 回退到非流式
        result = await state.modelAdapter.chat({
          model: state.config.model.model,
          messages,
          tools: toolsForThisRound.length > 0 ? toolsForThisRound : undefined,
        } as ChatParams);
      }
      
      // 恢复原始监听器
      process.removeListener('SIGINT', handleInterrupt);
      
      // 如果被打断，直接返回
      if (interrupted) {
        return;
      }
      
      // 如果没有流式内容（可能是工具调用），清除提示
      if (!result.content) {
        process.stdout.write('\r' + ' '.repeat(30) + '\r');
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`\n模型调用失败: ${errMsg}`));
      return;
    }

    lastContent = result.content;

    // 尝试解析任务计划
    if (complexity === 'complex' && result.content) {
      const parsedPlan = parseTaskPlan(result.content);
      if (parsedPlan && parsedPlan.steps.length > 0) {
        currentPlan = parsedPlan;
        const newRender = renderTaskProgress(currentPlan);
        if (newRender !== lastPlanRender) {
          console.log();
          console.log(chalk.cyan('📋 任务计划已生成:'));
          console.log(newRender);
          lastPlanRender = newRender;
        }
      }
      // 解析失败时不显示警告，让后续流程处理
    }

    // 没有工具调用，检查是否应该继续
    if (!result.toolCalls || result.toolCalls.length === 0) {
      // 检查是否任务已完成（模型输出总结/完成信号）
      const completionSignals = [
        '任务完成', '开发完成', '实现完成', '已完成', 
        '开发完毕', '实现完毕', '总结', '总结一下',
        '项目完成', '功能完成', '全部完成', '完整实现'
      ];
      const isTaskCompleted = completionSignals.some(signal => 
        result.content?.includes(signal)
      );
      
      // 复杂任务处理
      if (complexity === 'complex') {
        // 情况1：任务已完成 → 返回结果，等待用户指示
        if (isTaskCompleted) {
          addAssistantMessage(session, result.content);
          
          // 记录任务完成到记忆
          await memoryManager.remember(agent.id, `完成任务: ${message}`, 'task', 4);
          
          if (currentPlan) {
            console.log();
            console.log(chalk.green('✓ 任务完成'));
            console.log(getPlanSummary(currentPlan));
            
            // 记录计划完成
            await memoryManager.remember(agent.id, 
              `计划完成: ${currentPlan.steps.length} 个步骤`, 
              'task', 4
            );
          }
          
          if (sessionStorage) {
            await sessionStorage.saveSession(session);
          }
          
          if (result.usage) {
            console.log(chalk.gray(
              `\nToken: 输入 ${result.usage.promptTokens} / 输出 ${result.usage.completionTokens} / 总计 ${result.usage.totalTokens}`
            ));
          }
          console.log();
          return;
        }
        
        // 情况2：有计划但没有工具调用 → 提示模型开始执行
        if (currentPlan) {
          console.log(chalk.green('\n✓ 计划已生成，开始执行...'));
          addAssistantMessage(session, result.content);
          // 添加提示让模型开始执行第一步
          addUserMessage(session, 
            '计划已确认。现在请开始执行第一步：\n' +
            `"${currentPlan.steps[0]?.description}"\n\n` +
            '使用可用工具完成这个步骤。'
          );
          continue;
        }
        
        // 情况3：没有计划，继续尝试
        addAssistantMessage(session, result.content);
        continue;
      }
      
      // 简单任务：没有工具调用，直接返回
      addAssistantMessage(session, result.content);
      
      // 记录简单任务完成
      await memoryManager.remember(agent.id, `完成任务: ${message}`, 'conversation', 3);
      
      // 如果有任务计划，显示最终状态
      if (currentPlan) {
        console.log();
        console.log(chalk.green('✓ 任务完成'));
        console.log(getPlanSummary(currentPlan));
      }
      
      // 自动保存
      if (sessionStorage) {
        await sessionStorage.saveSession(session);
      }
      
      // 显示 Token 统计
      if (result.usage) {
        console.log(chalk.gray(
          `\nToken: 输入 ${result.usage.promptTokens} / 输出 ${result.usage.completionTokens} / 总计 ${result.usage.totalTokens}`
        ));
      }
      console.log();
      return;
    }

    // 有工具调用
    // 复杂任务：必须先有计划才能执行工具
    if (complexity === 'complex' && !currentPlan) {
      planAttempts++;
      
      console.log(chalk.yellow('\n⚠️ 检测到模型尝试直接执行工具'));
      console.log(chalk.gray(`复杂任务需要先输出计划 (尝试 ${planAttempts}/${MAX_PLAN_ATTEMPTS})`));
      
      // 检查是否超过最大尝试次数
      if (planAttempts >= MAX_PLAN_ATTEMPTS) {
        console.log();
        console.log(chalk.red('❌ 规划阶段已达到最大尝试次数'));
        console.log(chalk.gray('模型多次尝试直接执行工具，未能输出计划'));
        console.log(chalk.gray('您可以选择：'));
        console.log(chalk.gray('  1. 继续尝试（输入 y）'));
        console.log(chalk.gray('  2. 跳过规划，直接执行（输入 s）'));
        console.log(chalk.gray('  3. 取消任务（输入其他）'));
        
        // 使用主循环的 readline 获取用户输入
        const answer = await rl.question(chalk.cyan('\n请选择 [y/s/N]: '));
        
        if (answer.toLowerCase() === 'y') {
          planAttempts = 0;  // 重置尝试次数
          console.log(chalk.gray('继续尝试规划...'));
        } else if (answer.toLowerCase() === 's') {
          console.log(chalk.yellow('⏭️  跳过规划阶段，直接执行'));
          // 创建一个默认计划
          currentPlan = {
            title: '直接执行模式',
            steps: [
              { id: 'step-1', description: '执行任务', status: 'in_progress' },
            ],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        } else {
          console.log(chalk.red('✗ 任务已取消'));
          return;
        }
      }
      
      // 添加警告到历史
      addAssistantMessage(session, result.content);
      addUserMessage(session, 
        '【系统提示】请只输出计划，不要调用工具！\n\n' +
        '输出格式：\n' +
        '# 执行计划\n' +
        '1. 步骤一\n' +
        '2. 步骤二\n' +
        '...\n\n' +
        '输出计划后等待系统指示。'
      );
      continue;
    }

    // 正常执行工具
    addAssistantMessage(session, result.content, result.toolCalls);
    
    // 执行所有工具
    for (const toolCall of result.toolCalls) {
      console.log(chalk.blue(`\n调用工具: ${toolCall.name}`));
      
      let toolResult;
      try {
        // 敏感操作确认
        const confirmationManager = getConfirmationManager();
        const needsConfirm = confirmationManager.needsConfirmation(
          toolCall.name,
          toolCall.arguments,
          { agent, session, workspace: agent.workspace, logger: console }
        );
        
        if (needsConfirm) {
          const confirmResult = await confirmationManager.requestConfirmation(
            toolCall.name,
            toolCall.arguments,
            { agent, session, workspace: agent.workspace, logger: console }
          );
          
          if (!confirmResult.confirmed) {
            toolResult = {
              success: false,
              error: '用户取消了操作',
            };
            // 添加工具结果
            addToolResultMessage(
              session,
              toolCall.id,
              toolCall.name,
              `已取消: 用户拒绝执行`
            );
            console.log(chalk.gray('✗ 用户取消'));
            continue;
          }
          
          // 如果用户选择了"总是允许"，记住这个决定
          if (confirmResult.remember) {
            const scope = confirmResult.rememberScope ?? 'tool';
            confirmationManager.rememberDecision(toolCall.name, toolCall.arguments, scope);
            const scopeText = scope === 'tool' ? '所有操作' : '此目录的操作';
            console.log(chalk.gray(`✓ 已记住选择，后续 ${toolCall.name} ${scopeText}不再询问`));
          }
        }
        
        // 执行工具
        toolResult = await executeTool(toolCall.name, toolCall.arguments, {
          agent,
          session,
          workspace: agent.workspace,
          logger: console,
        });
        
        // 显示结果
        if (toolResult.success) {
          console.log(chalk.green('✓ 成功'));
          if (toolResult.content) {
            console.log(chalk.gray(toolResult.content.slice(0, 500)));
          }
          
          // 更新任务进度
          if (currentPlan) {
            const currentStep = getNextPendingStep(currentPlan);
            if (currentStep) {
              updateStepStatus(currentPlan, currentStep.id, 'completed');
              console.log();
              console.log(renderTaskProgress(currentPlan));
            }
          }
        } else {
          const errorMsg = toolResult.error || '未知错误';
          console.log(chalk.red(`✗ 失败`));
          console.log(chalk.yellow(`  原因: ${errorMsg}`));
          
          // 标记任务失败
          if (currentPlan) {
            const currentStep = getNextPendingStep(currentPlan);
            if (currentStep) {
              updateStepStatus(currentPlan, currentStep.id, 'failed', errorMsg);
              console.log();
              console.log(renderTaskProgress(currentPlan));
            }
          }
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        toolResult = {
          success: false,
          error: errMsg,
        };
        console.log(chalk.red(`✗ 异常: ${errMsg}`));
      }
      
      // 添加工具结果
      addToolResultMessage(
        session,
        toolCall.id,
        toolCall.name,
        toolResult.success 
          ? toolResult.content ?? '(成功)'
          : `错误: ${toolResult.error}`
      );
      
      // 显示结果
      console.log(chalk.gray(toolResult.success ? '✓ 成功' : '✗ 失败'));
      if (toolResult.content) {
        const preview = toolResult.content.length > 200 
          ? toolResult.content.slice(0, 200) + '...'
          : toolResult.content;
        console.log(chalk.gray(preview));
      }
      
      // 记录重要工具调用到记忆
      if (toolResult.success && ['write', 'edit', 'exec'].includes(toolCall.name)) {
        const toolDesc = toolCall.name === 'write' ? '写入文件' :
                        toolCall.name === 'edit' ? '编辑文件' : '执行命令';
        const target = toolCall.arguments['path'] || toolCall.arguments['command'] || '';
        await memoryManager.remember(agent.id, 
          `${toolDesc}: ${String(target).slice(0, 100)}`, 
          'task', 
          3
        );
      }
    }
    
    // 自动保存
    if (sessionStorage) {
      await sessionStorage.saveSession(session);
    }
  }

  // 达到最大轮数，输出最后的内容
  console.log(chalk.yellow(`\n已达到最大工具调用轮数 (${MAX_TOOL_ROUNDS})`));
  console.log();
  console.log(formatResponse(lastContent));
  console.log();
  
  // 自动保存
  if (sessionStorage) {
    await sessionStorage.saveSession(session);
  }
  } finally {
    // 标记执行结束
    state.executing = false;
    state.interrupted = false;
  }
}

// ============ 命令处理 ============

async function handleCommand(
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
      if (arg) {
        // 切换 Agent
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
        // 显示当前 Agent 信息
        const currentAgent = state.agents.get(state.currentAgentId);
        if (currentAgent) {
          console.log();
          console.log(chalk.cyan('┌─────────────────────────────────────┐'));
          console.log(chalk.cyan('│') + chalk.white.bold(`  🤖 正在与 ${currentAgent.name} 对话`).padEnd(37) + chalk.cyan('│'));
          console.log(chalk.cyan('└─────────────────────────────────────┘'));
          console.log();
        }
      }
      break;

    case 'agents':
      console.log(chalk.cyan('可用 Agent:'));
      for (const [id, agent] of state.agents) {
        const current = id === state.currentAgentId ? chalk.green(' (当前)') : '';
        const session = agent.sessions.get(`agent:${id}:main`);
        const historyCount = session?.history.length ?? 0;
        console.log(`  ${id} - ${agent.name}${current} ${chalk.gray(`[${historyCount} 条历史]`)}`);
      }
      break;

    case 'clear':
      console.clear();
      break;

    case 'reset': {
      const agent = state.agents.get(state.currentAgentId);
      if (agent) {
        const session = getOrCreateMainSession(agent);
        clearSessionHistory(session);
        await sessionStorage.deleteSession(session.sessionKey);
        console.log(chalk.green('✓ 已清除当前会话历史'));
      }
      break;
    }

    case 'history': {
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
      break;
    }

    case 'init-memory': {
      const agent = state.agents.get(state.currentAgentId);
      if (agent) {
        const memStatus = await memoryManager.isAgentInitialized(agent.id);
        if (memStatus.initialized) {
          console.log(chalk.green('✓ 该 Agent 记忆系统已初始化'));
          console.log(chalk.gray(`  Agent 档案: ${memStatus.hasProfile ? '✓' : '✗'}`));
          console.log(chalk.gray(`  工作记忆: ${memStatus.hasMemory ? '✓' : '✗'}`));
        } else {
          console.log(chalk.cyan('正在初始化记忆系统...'));
          await memoryManager.initializeAgentMemory(agent.id, agent.name, agent.systemPrompt);
          console.log(chalk.green('✓ 记忆系统初始化完成'));
          console.log();
          console.log(chalk.white('现在你可以：'));
          console.log(chalk.gray('  • 说"记住我的名字是xxx"记录个人信息'));
          console.log(chalk.gray('  • 说"记住项目路径是/xxx"记录重要路径'));
          console.log(chalk.gray('  • 说"我喜欢xxx"记录偏好'));
          console.log();
          console.log(chalk.gray('使用 /memory stats 查看记忆状态'));
        }
      }
      break;
    }

    case 'init-rag': {
      const agent = state.agents.get(state.currentAgentId);
      if (agent) {
        console.log(chalk.cyan.bold('\n📚 RAG 知识库初始化\n'));
        console.log(chalk.white('RAG (检索增强生成) 让 Agent 可以搜索你的文档库。'));
        console.log();
        console.log(chalk.cyan('初始化步骤：'));
        console.log(chalk.white('  1. 准备知识库目录（存放 .md/.txt/.json 文件）'));
        console.log(chalk.white('  2. 安装嵌入模型: ollama pull nomic-embed-text'));
        console.log(chalk.white('  3. 配置 Agent 的 RAG 设置'));
        console.log();
        console.log(chalk.cyan('配置示例 (config.json)：'));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(chalk.white(`{
  "agents": [{
    "id": "${agent.id}",
    "name": "${agent.name}",
    "workspace": "${agent.workspace}",
    "rag": {
      "enabled": true,
      "knowledgeDirs": ["./docs", "./knowledge"],
      "embeddingModel": "nomic-embed-text"
    }
  }]
}`));
        console.log(chalk.gray('─'.repeat(50)));
        console.log();
        console.log(chalk.cyan('可用工具（启用 RAG 后）：'));
        console.log(chalk.gray('  • rag_search <query>  - 搜索知识库'));
        console.log(chalk.gray('  • rag_index <path>    - 添加文档到知识库'));
        console.log(chalk.gray('  • rag_status          - 查看知识库状态'));
        console.log();
        console.log(chalk.yellow('提示: 修改配置后使用 /reload 重新加载'));
      }
      break;
    }

    case 'model':
      if (arg) {
        // 动态切换模型
        state.config.model.model = arg;
        console.log(chalk.green(`✓ 已切换到模型: ${arg}`));
      } else {
        console.log(chalk.cyan(`当前模型: ${state.config.model.model}`));
        console.log(chalk.gray('切换模型: /model <模型名>'));
      }
      break;

    case 'models': {
      // 列出可用模型
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
      break;
    }

    case 'audit': {
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
        // 显示最近日志
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
      break;
    }

    case 'save': {
      const count = await saveAllSessions(state.agents, sessionStorage);
      console.log(chalk.green(`✓ 已保存 ${count} 个会话`));
      break;
    }

    case 'export': {
      const { exportSession } = await import('../core/export.js');
      const agent = state.agents.get(state.currentAgentId);
      if (agent) {
        const session = getOrCreateMainSession(agent);
        const format = (arg || 'markdown') as 'markdown' | 'json' | 'txt';
        
        if (!['markdown', 'json', 'txt'].includes(format)) {
          console.log(chalk.red('不支持的格式，可选: markdown, json, txt'));
          break;
        }
        
        const result = exportSession(session, agent.name, { format });
        if (result.success) {
          console.log(chalk.green(`✓ 已导出到: ${result.path}`));
        } else {
          console.log(chalk.red(result.error ?? '导出失败'));
        }
      }
      break;
    }

    case 'reload': {
      try {
        const newConfig = loadConfig();
        state.config = newConfig;
        
        // 重新创建 Agent
        const newAgents = createAgents(newConfig);
        
        // 迁移现有会话到新 Agent
        for (const [oldId, oldAgent] of state.agents) {
          const newAgent = newAgents.get(oldId);
          if (newAgent && oldAgent.sessions.size > 0) {
            // 保留会话历史
            newAgent.sessions = oldAgent.sessions;
          }
        }
        
        state.agents = newAgents;
        
        // 检查当前 Agent 是否还存在
        if (!newAgents.has(state.currentAgentId)) {
          const defaultAgent = getDefaultAgent(newAgents);
          if (defaultAgent) {
            state.currentAgentId = defaultAgent.id;
            console.log(chalk.yellow(`当前 Agent 已删除，切换到: ${defaultAgent.name}`));
          }
        }
        
        // 更新模型
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
      break;
    }

    case 'skills': {
      const currentAgent = state.agents.get(state.currentAgentId);
      if (!currentAgent) break;

      const skillManager = getSkillManager();
      const publicSkills = await skillManager.listPublicSkills();
      const privateSkills = await skillManager.listPrivateSkills(state.currentAgentId);

      console.log(chalk.cyan.bold(`\n📚 ${currentAgent.name} 的技能\n`));

      // 公共技能
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

      // 个人技能
      console.log(chalk.yellow('\n个人技能:'));
      if (privateSkills.length === 0) {
        console.log(chalk.gray('  (无)'));
      } else {
        for (const skill of privateSkills) {
          console.log(`  ${skill.id} - ${skill.name}`);
          console.log(chalk.gray(`    ${skill.description}`));
        }
      }

      // 已分配的技能
      if (currentAgent.skills && currentAgent.skills.length > 0) {
        console.log(chalk.cyan('\n已激活的技能:'));
        for (const skillId of currentAgent.skills) {
          console.log(`  - ${skillId}`);
        }
      }

      console.log(chalk.gray('\n管理技能: securebot skill list/create/assign'));
      break;
    }

    case 'memory': {
      const memoryManager = getMemoryManager();
      
      if (arg === 'stats') {
        const stats = memoryManager.getStats();
        const profile = memoryManager.getUserProfile();
        console.log(chalk.cyan('记忆系统状态:'));
        console.log(`  每日记忆: ${stats.dailyMemoryCount} 个`);
        console.log(`  总条目: ${stats.totalEntries} 条`);
        console.log(`  Agent 档案: ${stats.agentCount} 个`);
        console.log(`  用户信息: ${Object.keys(profile?.keyInfo ?? {}).length} 条`);
      } else if (arg === 'clear') {
        // 清除工作记忆缓存
        console.log(chalk.yellow('确定要清除工作记忆吗？这将清除缓存但不会删除文件。'));
      } else if (arg === 'search' && parts[2]) {
        // 搜索记忆
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
        // 显示记忆摘要
        const summary = await memoryManager.getContextSummary(state.currentAgentId);
        if (summary) {
          console.log(chalk.cyan('工作记忆摘要:'));
          console.log(summary);
        } else {
          console.log(chalk.gray('暂无工作记忆'));
        }
        console.log(chalk.gray('\n命令: /memory [stats|search <关键词>]'));
      }
      break;
    }

    case 'sessions': {
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
      break;
    }

    case 'confirm': {
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
      break;
    }

    // ========== 新增命令 ==========

    case 'checkpoint': {
      const taskManager = getTaskManager();
      
      if (arg === 'list') {
        // 列出检查点
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
        // 保存检查点
        const checkpointId = taskManager.saveCheckpoint();
        console.log(chalk.green(`✓ 检查点已保存: ${checkpointId}`));
      } else if (arg === 'resume' && parts[2]) {
        // 恢复检查点
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
        // 显示任务状态
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
        console.log('  /checkpoint resume <id>   恢复检查点');
      }
      break;
    }

    case 'collab': {
      const { getCollaborationManager } = await import('../core/collaboration.js');
      const collaborationManager = getCollaborationManager();
      
      if (arg === 'status') {
        const stats = collaborationManager.getStats();
        console.log(chalk.cyan('协作状态:'));
        console.log(`  待处理消息: ${stats.pendingMessages}`);
        console.log(`  活跃委派: ${stats.activeDelegations}`);
        console.log(`  共享空间: ${stats.sharedWorkspaces}`);
      } else if (arg === 'messages') {
        // 显示消息
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
        // 委派任务
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
        // 显示委派列表
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
      break;
    }

    case 'errors': {
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
      break;
    }

    case 'behavior': {
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
      break;
    }

    case 'summary': {
      // 触发记忆摘要
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
      break;
    }

    case 'perf': {
      const { getPerformanceMonitor } = await import('../core/performance.js');
      const monitor = getPerformanceMonitor();
      
      if (arg === 'report') {
        console.log(monitor.generateReport());
      } else if (arg === 'clear') {
        monitor.clear();
        console.log(chalk.green('✓ 性能指标已清除'));
      } else {
        // 显示基本信息
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
      break;
    }

    default:
      console.log(chalk.yellow(`未知命令: ${cmd}`));
      console.log(chalk.gray('输入 /help 查看帮助'));
  }
}

// ============ 辅助函数 ============

function printWelcome(state: ReplState): void {
  console.log();
  console.log(chalk.cyan.bold('SecureBot v0.1.0'));
  console.log(chalk.gray('安全可控的多 Agent AI 助手'));
  console.log();
  console.log(chalk.gray(`模型: ${state.config.model.model}`));
  console.log(chalk.gray(`默认 Agent: ${state.currentAgentId}`));
  console.log();
  console.log(chalk.gray('输入消息开始对话，或输入 /help 查看帮助'));
  console.log(chalk.gray('使用 @<agent> 切换 Agent，如: @dev 帮我写代码'));
  console.log();
}

function printHelp(): void {
  console.log();
  console.log(chalk.cyan('命令列表:'));
  console.log('  /help, /h, /?    显示帮助');
  console.log('  /exit, /quit, /q  退出');
  console.log('  /agent [name]    显示/切换当前 Agent');
  console.log('  /agents          列出所有 Agent');
  console.log('  /init-memory     初始化当前 Agent 的记忆系统');
  console.log('  /skills          显示当前 Agent 的技能');
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
  console.log('  /memory stats    显示记忆统计');
  console.log('  /memory search   搜索记忆内容');
  console.log(chalk.gray('  提示: 告诉 Agent "记住xxx" 会自动记录'));
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

function formatResponse(content: string): string {
  if (!content) return '(无回复)';
  return content
    .split('\n')
    .map(line => `  ${line}`)
    .join('\n');
}

// ============ 会话持久化辅助函数 ============

/**
 * 加载持久化的会话
 */
async function loadPersistedSessions(
  agents: Map<string, Agent>,
  sessionStorage: ReturnType<typeof getSessionStorage>
): Promise<number> {
  let loaded = 0;
  
  for (const [agentId, agent] of agents) {
    const sessionKey = `agent:${agentId}:main`;
    const session = await sessionStorage.loadSession(sessionKey);
    
    if (session && session.history.length > 0) {
      // 将加载的会话添加到 agent
      agent.sessions.set(sessionKey, session);
      loaded++;
    }
  }
  
  return loaded;
}

/**
 * 保存所有会话
 */
async function saveAllSessions(
  agents: Map<string, Agent>,
  sessionStorage: ReturnType<typeof getSessionStorage>
): Promise<number> {
  let saved = 0;
  
  for (const agent of agents.values()) {
    for (const session of agent.sessions.values()) {
      if (session.history.length > 0) {
        await sessionStorage.saveSession(session);
        saved++;
      }
    }
  }
  
  return saved;
}

// ============ 敏感操作确认 ============

/**
 * 显示确认对话框
 */
async function showConfirmationDialog(
  request: ConfirmationRequest,
  rl: readlinePromises.Interface
): Promise<{ confirmed: boolean; remember?: boolean; rememberScope?: 'tool' | 'pattern' }> {
  console.log();
  console.log(chalk.yellow.bold('⚠️  敏感操作确认'));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(chalk.cyan(`工具: ${request.tool}`));
  console.log(chalk.white(request.message));
  
  if (request.risk) {
    console.log(chalk.yellow(`风险: ${request.risk}`));
  }
  
  if (request.suggestions && request.suggestions.length > 0) {
    console.log(chalk.gray('建议:'));
    for (const suggestion of request.suggestions) {
      console.log(chalk.gray(`  • ${suggestion}`));
    }
  }
  
  console.log(chalk.gray('─'.repeat(40)));
  
  const levelEmoji: Record<string, string> = {
    safe: '✅',
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    critical: '🔴',
  };
  
  const emoji = levelEmoji[request.level] ?? '❓';
  console.log(chalk.gray(`敏感级别: ${emoji} ${request.level.toUpperCase()}`));
  console.log();
  
  // 询问用户
  console.log(chalk.cyan('请选择:'));
  console.log(chalk.white('  y = 本次确认'));
  console.log(chalk.white('  N = 拒绝执行（默认）'));
  console.log(chalk.white('  a = 总是允许此工具的所有操作'));
  // 如果有路径参数，显示目录选项
  if (request.params['path']) {
    console.log(chalk.white('  p = 总是允许此目录的操作'));
  }
  console.log();
  
  const answer = await rl.question(
    chalk.cyan('确认执行? [y/N/a] ')
  );
  
  const input = answer.trim().toLowerCase();
  
  if (input === 'y' || input === 'yes') {
    return { confirmed: true };
  }
  
  if (input === 'a' || input === 'always') {
    return { confirmed: true, remember: true, rememberScope: 'tool' };
  }
  
  if (input === 'p' && request.params['path']) {
    return { confirmed: true, remember: true, rememberScope: 'pattern' };
  }
  
  console.log(chalk.red('✗ 操作已取消'));
  return { confirmed: false };
}