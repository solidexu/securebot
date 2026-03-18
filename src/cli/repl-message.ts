/**
 * REPL 消息处理模块
 * 
 * 处理用户消息和工具调用循环
 */

import * as readlinePromises from 'node:readline/promises';
import chalk from 'chalk';
import type { ReplState, Agent, Message, ChatParams, Session } from '../core/types.js';
import { getOrCreateMainSession } from '../core/agent.js';
import { addUserMessage, addAssistantMessage, addToolResultMessage, buildSystemPrompt } from '../core/session.js';
import { getAvailableTools, executeTool, getAvailableToolNames } from '../tools/index.js';
import { getSkillManager, getSkillDetector } from '../core/skills.js';
import { getConfirmationManager } from '../core/confirmation.js';
import { eventBus } from '../core/event-bus.js';
import { EventTypes } from '../core/events.js';
import { getRootDir } from '../core/config.js';
import type { StreamCallback } from '../model/ollama.js';
import {
  assessComplexity,
  parseTaskPlan,
  renderTaskProgress,
  updateStepStatus,
  getNextPendingStep,
  getPlanSummary,
  type TaskPlan,
} from '../core/smart-task.js';
import { savePlanToSession, clearPlanFromSession, renderHierarchicalPlan } from './repl-plan.js';

// ============ 常量 ============

/** 最大工具调用轮数（安全兜底，正常情况下不触发） */
const MAX_TOOL_ROUNDS = 100;

// ============ 消息处理入口 ============

/**
 * 处理用户消息
 */
export async function processMessage(
  state: ReplState,
  agent: Agent,
  message: string,
  rl: readlinePromises.Interface,
  sessionStorage?: ReturnType<typeof import('../core/session-storage.js').getSessionStorage>
): Promise<void> {
  // 标记正在执行
  state.executing = true;
  state.interrupted = false;
  
  // 创建 AbortController 用于取消 LLM 请求
  const abortController = new AbortController();
  state.abortController = abortController;
  
  try {
    const session = getOrCreateMainSession(agent);
    
    // 添加用户消息
    addUserMessage(session, message);
    
    // 判断任务复杂度
    const complexity = assessComplexity(message);
    
    // 发布用户消息事件
    eventBus.publishSync({
      type: EventTypes.USER_MESSAGE,
      timestamp: new Date(),
      agentId: agent.id,
      sessionId: session.sessionKey,
      payload: { message, complexity },
    });
    
    let currentPlan: TaskPlan | null = null;
    let lastPlanRender = '';
    let shouldExecutePlan = false;
    
    // 恢复会话中的规划状态
    if (session.plan && session.plan.steps.some(s => s.status === 'pending' || s.status === 'in_progress')) {
      currentPlan = {
        title: session.plan.title,
        steps: session.plan.steps,
        createdAt: new Date(session.plan.createdAt),
        updatedAt: new Date(session.plan.updatedAt),
      };
      console.log();
      console.log(chalk.cyan('📋 恢复上次未完成的任务规划:'));
      console.log(renderHierarchicalPlan(session));
      
      const completed = currentPlan.steps.filter(s => s.status === 'completed').length;
      const total = currentPlan.steps.length;
      const levelInfo = session.plan.level && session.plan.level > 0 ? 
        ` (子规划 Level ${session.plan.level})` : '';
      console.log(chalk.gray(`  进度: ${completed}/${total} 步骤已完成${levelInfo}`));
      
      if (session.plan.originalTask) {
        console.log(chalk.gray(`  原始任务: ${session.plan.originalTask.slice(0, 100)}...`));
      }
      
      if (session.plan.context) {
        if (session.plan.context.currentStepDetail) {
          console.log(chalk.gray(`  当前步骤: ${session.plan.context.currentStepDetail}`));
        }
        if (session.plan.context.notes && session.plan.context.notes.length > 0) {
          console.log(chalk.yellow(`  注意事项:`));
          for (const note of session.plan.context.notes) {
            console.log(chalk.yellow(`    - ${note}`));
          }
        }
      }
      
      const continueKeywords = ['继续', '继续开发', '继续执行', '执行', '开始', 'run', 'continue'];
      const isContinueRequest = continueKeywords.some(kw => message.trim().toLowerCase() === kw.toLowerCase());
      
      if (isContinueRequest) {
        console.log(chalk.green('\n✓ 继续执行已有计划...'));
        const nextStep = getNextPendingStep(currentPlan);
        if (nextStep) {
          console.log(chalk.cyan(`执行步骤: ${nextStep.description}`));
        }
        shouldExecutePlan = true;
      }
      
      console.log();
    }
    
    if (!shouldExecutePlan && complexity === 'complex' && !currentPlan) {
      console.log();
      console.log(chalk.cyan('🔍 检测到复杂任务，系统将先制定计划...'));
      console.log();
    }
    
    if (shouldExecutePlan && currentPlan) {
      const nextStep = getNextPendingStep(currentPlan);
      if (nextStep) {
        addUserMessage(session, 
          `继续执行计划。当前进度：${currentPlan.steps.filter(s => s.status === 'completed').length}/${currentPlan.steps.length}\n\n` +
          `下一步：${nextStep.description}\n\n` +
          `请使用可用工具完成这个步骤。`
        );
      }
    }
    
    // 自动保存
    if (sessionStorage) {
      await sessionStorage.saveSession(session);
    }
    
    // 获取可用工具
    const availableTools = getAvailableTools(agent, state.config.tools);
    
    // 智能检测技能
    const skillDetector = getSkillDetector();
    const skillMatch = await skillDetector.detectBest(message, agent.id);
    
    // 加载技能提示词
    const skillManager = getSkillManager();
    
    let activeSkills = agent.skills || [];
    if (skillMatch && skillMatch.score >= 0.5) {
      if (!activeSkills.includes(skillMatch.skill.id)) {
        activeSkills = [...activeSkills, skillMatch.skill.id];
        console.log(chalk.cyan(`🎯 激活技能: ${skillMatch.skill.name} (${skillMatch.method})`));
      }
    }
    
    const skillsPrompt = await skillManager.buildSkillsPrompt(agent.id, activeSkills);
    
    // 构建系统提示
    let systemPrompt = await buildSystemPrompt(
      agent,
      state.config,
      getAvailableToolNames(agent, state.config.tools),
      skillsPrompt
    );
    
    // 复杂任务规划指令
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
    await runToolCallLoop({
      state,
      agent,
      session,
      message,
      systemPrompt,
      availableTools,
      currentPlan,
      lastPlanRender,
      shouldExecutePlan,
      complexity,
      sessionStorage,
      rl,
      abortController,
    });
    
  } finally {
    state.executing = false;
    state.interrupted = false;
    state.abortController = undefined;
  }
}

// ============ 工具调用循环 ============

interface ToolCallLoopContext {
  state: ReplState;
  agent: Agent;
  session: Session;
  message: string;
  systemPrompt: string;
  availableTools: ReturnType<typeof getAvailableTools>;
  currentPlan: TaskPlan | null;
  lastPlanRender: string;
  shouldExecutePlan: boolean;
  complexity: 'simple' | 'moderate' | 'complex';
  sessionStorage?: ReturnType<typeof import('../core/session-storage.js').getSessionStorage>;
  rl: readlinePromises.Interface;
  abortController: AbortController;
}

async function runToolCallLoop(ctx: ToolCallLoopContext): Promise<void> {
  const { state, agent, session, message, systemPrompt, availableTools, sessionStorage } = ctx;
  let { currentPlan, lastPlanRender, shouldExecutePlan, complexity } = ctx;
  
  let round = 0;
  let planAttempts = 0;
  let noToolCallRounds = 0;
  const MAX_PLAN_ATTEMPTS = 3;
  const MAX_NO_TOOL_CALL_ROUNDS = 3;
  
  while (round < MAX_TOOL_ROUNDS) {
    if (state.interrupted) {
      console.log(chalk.yellow('\n[操作已打断]'));
      return;
    }
    
    if (noToolCallRounds >= MAX_NO_TOOL_CALL_ROUNDS) {
      console.log(chalk.yellow('\n⚠️ 检测到连续多轮无工具调用，结束对话'));
      console.log(chalk.gray('如果需要继续，请发送新消息'));
      break;
    }
    
    round++;
    
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...session.history,
    ];
    
    if (round === 1) {
      process.stdout.write(chalk.gray('思考中... '));
    } else {
      process.stdout.write(chalk.gray(`继续思考 (轮次 ${round})... `));
    }
    
    // 复杂任务：有计划之前不传工具
    let toolsForThisRound = availableTools;
    if (complexity === 'complex' && !currentPlan) {
      toolsForThisRound = [];
    }
    
    let result;
    try {
      let streamStarted = false;
      let hasContent = false;
      
      const onStream: StreamCallback = (chunk) => {
        if (state.interrupted) return;
        
        if (!streamStarted && chunk.content) {
          process.stdout.write('\n' + chalk.cyan(`[${agent.name}]`) + '\n');
          streamStarted = true;
        }
        
        if (chunk.content) {
          hasContent = true;
          process.stdout.write(chunk.content);
        }
        
        if (chunk.done && hasContent) {
          process.stdout.write('\n');
        }
      };
      
      if (state.modelAdapter.chatWithStream) {
        result = await state.modelAdapter.chatWithStream({
          model: state.config.model.model,
          messages,
          tools: toolsForThisRound.length > 0 ? toolsForThisRound : undefined,
          onStream,
          signal: ctx.abortController.signal,
        } as ChatParams & { onStream: StreamCallback; signal: AbortSignal });
      } else {
        result = await state.modelAdapter.chat({
          model: state.config.model.model,
          messages,
          tools: toolsForThisRound.length > 0 ? toolsForThisRound : undefined,
        } as ChatParams);
      }
      
      if (state.interrupted) {
        return;
      }
      
      if (!result.content) {
        process.stdout.write('\r' + ' '.repeat(30) + '\r');
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`\n模型调用失败: ${errMsg}`));
      return;
    }
    
    // 解析任务计划
    if (complexity === 'complex' && result.content) {
      const parsedPlan = parseTaskPlan(result.content);
      if (parsedPlan && parsedPlan.steps.length > 0) {
        currentPlan = parsedPlan;
        savePlanToSession(session, currentPlan, message);
        const newRender = renderTaskProgress(currentPlan);
        if (newRender !== lastPlanRender) {
          console.log();
          console.log(chalk.cyan('📋 任务计划已生成:'));
          console.log(newRender);
          lastPlanRender = newRender;
        }
      }
    }
    
    // 没有工具调用
    if (!result.toolCalls || result.toolCalls.length === 0) {
      const completionSignals = [
        '任务完成', '开发完成', '实现完成', '已完成', 
        '开发完毕', '实现完毕', '总结', '总结一下',
        '项目完成', '功能完成', '全部完成', '完整实现'
      ];
      const isTaskCompleted = completionSignals.some(signal => 
        result.content?.includes(signal)
      );
      
      if (complexity === 'complex') {
        if (isTaskCompleted) {
          addAssistantMessage(session, result.content);
          
          eventBus.publishSync({
            type: EventTypes.TASK_COMPLETE,
            timestamp: new Date(),
            agentId: agent.id,
            sessionId: session.sessionKey,
            payload: {
              taskDescription: message,
              planId: session.plan?.id,
              stepsCompleted: currentPlan?.steps.filter(s => s.status === 'completed').length ?? 0,
              stepsTotal: currentPlan?.steps.length ?? 0,
            },
          });
          
          if (currentPlan) {
            console.log();
            console.log(chalk.green('✓ 任务完成'));
            console.log(getPlanSummary(currentPlan));
            clearPlanFromSession(session);
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
        
        if (currentPlan) {
          addAssistantMessage(session, result.content);
          noToolCallRounds = 0;
          
          const isPlanOnlyRequest = 
            message.includes('计划') || 
            message.includes('规划') || 
            message.includes('方案') ||
            message.includes('怎么') ||
            message.includes('如何');
          
          if (isPlanOnlyRequest) {
            console.log();
            console.log(chalk.cyan('📋 计划已生成，等待您的确认...'));
            console.log(chalk.gray('确认执行请输入: "继续"、"执行"、"开始" 或描述具体要做什么'));
            console.log(chalk.gray('修改计划请输入: 您的修改意见'));
            console.log(chalk.gray('取消请输入: "取消" 或开始新话题'));
            console.log();
            if (sessionStorage) {
              await sessionStorage.saveSession(session);
            }
            return;
          }
          
          console.log(chalk.green('\n✓ 计划已生成，开始执行...'));
          addUserMessage(session, 
            '计划已确认。现在请开始执行第一步：\n' +
            `"${currentPlan.steps[0]?.description}"\n\n` +
            '使用可用工具完成这个步骤。'
          );
          continue;
        }
        
        addAssistantMessage(session, result.content);
        if (result.content?.includes('步骤') || result.content?.includes('计划') || result.content?.includes('执行')) {
          noToolCallRounds = 0;
        }
        continue;
      }
      
      noToolCallRounds++;
      
      addAssistantMessage(session, result.content);
      
      eventBus.publishSync({
        type: EventTypes.TASK_COMPLETE,
        timestamp: new Date(),
        agentId: agent.id,
        sessionId: session.sessionKey,
        payload: {
          taskDescription: message,
          stepsCompleted: 0,
          stepsTotal: 0,
        },
      });
      
      if (currentPlan) {
        console.log();
        console.log(chalk.green('✓ 任务完成'));
        console.log(getPlanSummary(currentPlan));
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
    
    // 有工具调用
    if (complexity === 'complex' && !currentPlan && !shouldExecutePlan) {
      planAttempts++;
      
      console.log(chalk.yellow('\n⚠️ 检测到模型尝试直接执行工具'));
      console.log(chalk.gray(`复杂任务需要先输出计划 (尝试 ${planAttempts}/${MAX_PLAN_ATTEMPTS})`));
      
      if (planAttempts >= MAX_PLAN_ATTEMPTS) {
        console.log();
        console.log(chalk.red('❌ 规划阶段已达到最大尝试次数'));
        console.log(chalk.gray('模型多次尝试直接执行工具，未能输出计划'));
        console.log(chalk.gray('您可以选择：'));
        console.log(chalk.gray('  1. 继续尝试（输入 y）'));
        console.log(chalk.gray('  2. 跳过规划，直接执行（输入 s）'));
        console.log(chalk.gray('  3. 取消任务（输入其他）'));
        
        const answer = await ctx.rl.question(chalk.cyan('\n请选择 [y/s/N]: '));
        
        if (answer.toLowerCase() === 'y') {
          planAttempts = 0;
          console.log(chalk.gray('继续尝试规划...'));
        } else if (answer.toLowerCase() === 's') {
          console.log(chalk.yellow('⏭️  跳过规划阶段，直接执行'));
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
    
    // 执行工具
    addAssistantMessage(session, result.content, result.toolCalls);
    noToolCallRounds = 0;
    
    for (const toolCall of result.toolCalls) {
      await executeToolCall({
        toolCall,
        agent,
        session,
        state,
        currentPlan,
        sessionStorage,
      });
    }
    
    if (sessionStorage) {
      await sessionStorage.saveSession(session);
    }
  }
  
  console.log(chalk.yellow(`\n已达到最大工具调用轮数 (${MAX_TOOL_ROUNDS})`));
  console.log();
}

// ============ 工具调用执行 ============

interface ToolCallExecuteContext {
  toolCall: { id: string; name: string; arguments: Record<string, unknown> };
  agent: Agent;
  session: Session;
  state: ReplState;
  currentPlan: TaskPlan | null;
  sessionStorage?: ReturnType<typeof import('../core/session-storage.js').getSessionStorage>;
}

async function executeToolCall(ctx: ToolCallExecuteContext): Promise<void> {
  const { toolCall, agent, session, state, currentPlan } = ctx;
  
  console.log(chalk.blue(`\n调用工具: ${toolCall.name}`));
  
  let toolResult;
  try {
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
        
        eventBus.publishSync({
          type: EventTypes.TOOL_CONFIRMATION_RESULT,
          timestamp: new Date(),
          agentId: agent.id,
          sessionId: session.sessionKey,
          payload: {
            toolName: toolCall.name,
            arguments: toolCall.arguments,
            decision: 'denied',
          },
        });
        
        addToolResultMessage(
          session,
          toolCall.id,
          toolCall.name,
          `已取消: 用户拒绝执行`
        );
        console.log(chalk.gray('✗ 用户取消'));
        return;
      }
      
      if (confirmResult.remember) {
        const scope = confirmResult.rememberScope ?? 'tool';
        eventBus.publishSync({
          type: EventTypes.TOOL_CONFIRMATION_RESULT,
          timestamp: new Date(),
          agentId: agent.id,
          sessionId: session.sessionKey,
          payload: {
            toolName: toolCall.name,
            arguments: toolCall.arguments,
            decision: 'approved',
            remember: true,
            rememberScope: scope,
          },
        });
        const scopeText = scope === 'tool' ? '所有操作' : '此目录的操作';
        console.log(chalk.gray(`✓ 已记住选择，后续 ${toolCall.name} ${scopeText}不再询问`));
      }
    }
    
    const toolStartTime = Date.now();
    const rootDir = getRootDir(state.config);
    toolResult = await executeTool(toolCall.name, toolCall.arguments, {
      agent,
      session,
      workspace: agent.workspace,
      logger: console,
      allowedPaths: [
        rootDir,
        `${rootDir}/memory`,
        `${rootDir}/knowledges`,
        `${rootDir}/skills`,
      ],
    });
    const toolDuration = ((Date.now() - toolStartTime) / 1000).toFixed(1);
    
    if (toolResult.success) {
      const durationInfo = toolDuration !== '0.0' ? chalk.gray(` (${toolDuration}s)`) : '';
      console.log(chalk.green(`✓ 成功${durationInfo}`));
      if (toolResult.content) {
        console.log(chalk.gray(toolResult.content.slice(0, 500)));
      }
      
      if (currentPlan) {
        const currentStep = getNextPendingStep(currentPlan);
        if (currentStep) {
          updateStepStatus(currentPlan, currentStep.id, 'completed');
          savePlanToSession(session, currentPlan);
          console.log();
          console.log(renderTaskProgress(currentPlan));
        }
      }
    } else {
      const errorMsg = toolResult.error || '未知错误';
      const durationInfo = toolDuration !== '0.0' ? chalk.gray(` (${toolDuration}s)`) : '';
      console.log(chalk.red(`✗ 失败${durationInfo}`));
      console.log(chalk.yellow(`  原因: ${errorMsg}`));
      
      if (currentPlan) {
        const currentStep = getNextPendingStep(currentPlan);
        if (currentStep) {
          updateStepStatus(currentPlan, currentStep.id, 'failed', errorMsg);
          savePlanToSession(session, currentPlan);
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
  
  addToolResultMessage(
    session,
    toolCall.id,
    toolCall.name,
    toolResult.success 
      ? toolResult.content ?? '(成功)'
      : `错误: ${toolResult.error}`
  );
  
  console.log(chalk.gray(toolResult.success ? '✓ 成功' : '✗ 失败'));
  if (toolResult.content) {
    const preview = toolResult.content.length > 200 
      ? toolResult.content.slice(0, 200) + '...'
      : toolResult.content;
    console.log(chalk.gray(preview));
  }
}