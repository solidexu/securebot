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
import { recordTaskExecution, buildEnhancedSystemPrompt } from '../core/self-improving-integration.js';
import { ProgressAnimation } from './progress-animation.js';
import {
  showTaskProgress,
  showProgressBar,
  advanceToNextStep,
  createExecutionState,
  updateExecutionState,
  type ExecutionState,
} from './task-executor.js';

// ============ 常量 ============

/** 最大工具调用轮数（安全兜底，正常情况下不触发） */
const MAX_TOOL_ROUNDS = 100;

/** 问题结尾模式 - 检测 agent 是否在问用户问题 */
const QUESTION_PATTERNS = [
  // 中文问题结尾
  /[吗？|？]$/,
  /\？$/,
  // 中文常见问题
  /有什么|是否需要|您想|请提供|请告诉我|请问|你希望|你需要|是否/,
  // 英文问题结尾
  /\?$/,
  // 英文常见问题
  /\bwhat\b.*\?/i,
  /\bhow\b.*\?/i,
  /\bwould you\b/i,
  /\bdo you\b/i,
  /\bcan you\b/i,
  /\bcould you\b/i,
  /\bany\s+(specific|particular)/i,
  /\bplease\s+(provide|tell|share|let me know)/i,
];

/**
 * 检测内容是否是在问用户问题
 * 返回 true 表示检测到问题，应该停止循环等待用户回复
 */
function isAskingUserQuestion(content: string | null | undefined): boolean {
  if (!content || content.trim().length === 0) {
    return false;
  }
  
  const trimmedContent = content.trim();
  
  // 检查是否匹配问题模式
  for (const pattern of QUESTION_PATTERNS) {
    if (pattern.test(trimmedContent)) {
      return true;
    }
  }
  
  // 额外检查：如果最后一句以问号结尾
  const sentences = trimmedContent.split(/[。.!！\n]/).filter(s => s.trim());
  const lastSentence = sentences[sentences.length - 1];
  if (lastSentence && /\？|\?$/.test(lastSentence.trim())) {
    return true;
  }
  
  return false;
}

/** 任务追踪状态 */
interface TaskTracker {
  toolsUsed: Set<string>;
  steps: { id: string; description: string; success: boolean }[];
  startTime: number;
}

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
      
      const completed = currentPlan.steps.filter(s => s.status === 'completed').length;
      const total = currentPlan.steps.length;
      
      console.log();
      console.log(chalk.cyan('📋 恢复上次未完成的任务规划:'));
      console.log(renderHierarchicalPlan(session));
      
      // 显示进度条
      console.log();
      console.log(chalk.gray('进度: ' + showProgressBar(completed, total)));
      
      if (session.plan.originalTask) {
        console.log(chalk.gray(`原始任务: ${session.plan.originalTask.slice(0, 100)}...`));
      }
      
      const continueKeywords = ['继续', '继续开发', '继续执行', '执行', '开始', 'run', 'continue'];
      const isContinueRequest = continueKeywords.some(kw => message.trim().toLowerCase() === kw.toLowerCase());
      
      if (isContinueRequest) {
        console.log(chalk.green('\n✓ 继续执行已有计划...'));
        
        // 检查是否已有进行中的步骤
        const currentInProgress = currentPlan.steps.find(s => s.status === 'in_progress');
        if (currentInProgress) {
          // 已有进行中的步骤，直接显示
          console.log(chalk.cyan(`📍 当前步骤: ${currentInProgress.description}`));
        } else {
          // 没有进行中的步骤，从第一个待执行的步骤开始
          const nextStep = getNextPendingStep(currentPlan);
          if (nextStep) {
            console.log(chalk.cyan(`📍 下一步: ${nextStep.description}`));
            updateStepStatus(currentPlan, nextStep.id, 'in_progress');
            savePlanToSession(session, currentPlan);
          }
        }
        shouldExecutePlan = true;
      } else {
        console.log(chalk.gray('\n输入"继续"恢复执行，或描述新任务。'));
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
    
    // 构建基础系统提示
    let baseSystemPrompt = await buildSystemPrompt(
      agent,
      state.config,
      getAvailableToolNames(agent, state.config.tools),
      skillsPrompt
    );
    
    // 使用增强的 Prompt（自动注入学习到的经验）
    let systemPrompt = await buildEnhancedSystemPrompt(agent, baseSystemPrompt);
    
    // 复杂任务规划指令
    if (complexity === 'complex') {
      const planInstruction = `
## 重要：请先制定执行计划

在开始执行前，请列出完成这个任务需要的**具体执行步骤**。

**要求**：
1. 步骤必须是可执行的**操作**（动词开头：创建、实现、编写、测试、添加）
2. 每个步骤应该是一个明确的行动，不是问题
3. 不要列出功能特性、设计描述或技术细节
4. 不要输出问题（如"你想实现哪种？"、"需要什么？"）
5. 步骤之间应该有逻辑顺序

**正确示例**：
# 执行计划
1. 创建项目目录结构
2. 实现核心算法类
3. 编写单元测试
4. 创建配置文件
5. 编写使用文档

**错误示例**（绝对不要这样）：
# 执行计划
- ✅ 支持流式输入  ← 功能描述，不是步骤
- ⬜ 高性能设计     ← 设计描述，不是步骤
- ⬜ 你想实现哪种？  ← 问题，不是步骤
- ⬜ 需要返回什么？  ← 问题，不是步骤

请直接输出计划，不要执行任何操作，不要问问题。
`;
      systemPrompt = planInstruction + systemPrompt;
    }
    
    // 多轮工具调用循环
    const taskTracker: TaskTracker = {
      toolsUsed: new Set(),
      steps: [],
      startTime: Date.now(),
    };
    
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
      taskTracker,
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
  /** 任务追踪器 */
  taskTracker: TaskTracker;
  /** 执行状态 */
  executionState?: ExecutionState;
}

async function runToolCallLoop(ctx: ToolCallLoopContext): Promise<void> {
  const { state, agent, session, message, systemPrompt, availableTools, sessionStorage } = ctx;
  let { currentPlan, lastPlanRender, shouldExecutePlan, complexity } = ctx;
  
  // 创建可中断的 question 函数
  const interruptibleQuestion = async (prompt: string): Promise<string> => {
    // 如果已经被打断，直接返回空
    if (state.interrupted) {
      return '';
    }
    
    // 创建 AbortController 用于打断 rl.question
    const questionAbort = new AbortController();
    const abortHandler = () => {
      questionAbort.abort();
    };
    
    // 监听打断信号 - 使用 once: true 自动清理
    if (state.abortController) {
      state.abortController.signal.addEventListener('abort', abortHandler, { once: true });
    }
    
    try {
      const answer = await ctx.rl.question(prompt, { signal: questionAbort.signal });
      return answer;
    } catch (error) {
      // 如果是被打断的或 readline 被关闭，返回空
      if (
        state.interrupted ||
        (error instanceof Error && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'ERR_USE_AFTER_CLOSE') ||
        (error instanceof Error && error.message.includes('readline was closed'))
      ) {
        return '';
      }
      throw error;
    } finally {
      if (state.abortController) {
        state.abortController.signal.removeEventListener('abort', abortHandler);
      }
    }
  };
  
  let round = 0;
  let planAttempts = 0;
  let noToolCallRounds = 0;
  let consecutiveNoProgress = 0;  // 连续无进展轮数
  const MAX_PLAN_ATTEMPTS = 3;
  const MAX_NO_PROGRESS = 5;  // 连续 5 轮无进展则提示用户
  
  // 跟踪是否有已完成的计划（用于判断新阶段）
  let previousPlanCompleted = false;
  if (session.plan && session.plan.steps.every(s => s.status === 'completed' || s.status === 'skipped')) {
    previousPlanCompleted = true;
  }
  
  while (round < MAX_TOOL_ROUNDS) {
    if (state.interrupted) {
      console.log(chalk.yellow('\n[操作已打断]'));
      return;
    }
    
    // 检查是否长时间无进展
    if (consecutiveNoProgress >= MAX_NO_PROGRESS) {
      console.log(chalk.yellow('\n⚠️ 检测到连续多轮无实质进展'));
      console.log(chalk.gray('模型可能在循环中，建议：'));
      console.log(chalk.gray('  1. 按 Ctrl+C 打断当前操作'));
      console.log(chalk.gray('  2. 使用 /reset 清除会话历史'));
      console.log(chalk.gray('  3. 重新描述任务'));
      
      // 询问用户是否继续
      const answer = await interruptibleQuestion(chalk.cyan('\n是否继续尝试？ [y/N]: '));
      if (state.interrupted) {
        console.log(chalk.gray('\n[已取消]'));
        return;
      }
      if (answer.toLowerCase() !== 'y') {
        console.log(chalk.gray('已停止'));
        return;
      }
      consecutiveNoProgress = 0;  // 重置
    }
    
    round++;
    
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...session.history,
    ];
    
    // 创建进度动画
    const thinkingMessage = round === 1 ? '思考中' : `继续思考 (轮次 ${round})`;
    const progressAnimation = new ProgressAnimation(thinkingMessage, ctx.abortController.signal);
    progressAnimation.start();
    
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
          // 流式输出开始，停止动画
          progressAnimation.stop();
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
        progressAnimation.stop();
        return;
      }
      
      // 如果没有流式输出，停止动画
      if (!streamStarted) {
        progressAnimation.stop();
      }
      
      if (!result.content) {
        process.stdout.write('\r' + ' '.repeat(30) + '\r');
      }
    } catch (error) {
      progressAnimation.stop();
      // 检查是否是用户主动打断
      const isAbortError = 
        state.interrupted ||
        (error instanceof Error && error.name === 'AbortError') ||
        (error instanceof Error && error.message.toLowerCase().includes('abort')) ||
        (typeof error === 'string' && error.toLowerCase().includes('abort'));
      
      if (isAbortError) {
        console.log(chalk.gray('\n[已取消]'));
        return;
      }
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
        
        // 初始化执行状态
        if (!ctx.executionState) {
          ctx.executionState = createExecutionState(currentPlan, 'guided');
          // 注意：不自动标记第一个步骤为 in_progress
          // 等用户确认后才标记
        }
        
        const newRender = renderTaskProgress(currentPlan);
        if (newRender !== lastPlanRender) {
          console.log();
          console.log(chalk.cyan('📋 任务计划已生成:'));
          console.log(newRender);
          
          // 显示进度条
          if (ctx.executionState) {
            console.log(showTaskProgress(currentPlan, ctx.executionState));
          }
          
          lastPlanRender = newRender;
        }
      }
    }
    
    // 没有工具调用
    if (!result.toolCalls || result.toolCalls.length === 0) {
      const completionSignals = [
        '任务完成', '开发完成', '实现完成', '已完成', 
        '开发完毕', '实现完毕', '总结', '总结一下',
        '项目完成', '功能完成', '全部完成', '完整实现',
        '已完成所有', 'done', 'complete', 'finished',
      ];
      const isTaskCompleted = completionSignals.some(signal => 
        result.content?.toLowerCase().includes(signal.toLowerCase())
      );
      
      // 检查是否有实质性内容输出
      const hasSubstantialContent = result.content && result.content.trim().length > 100;
      
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
          
          // 记录任务成功
          await recordTaskExecution(
            {
              agent,
              session,
              taskDescription: message,
              approach: '完成任务',
              toolsUsed: Array.from(ctx.taskTracker.toolsUsed),
              steps: ctx.taskTracker.steps,
            },
            {
              success: true,
              summary: result.content?.slice(0, 200),
            }
          );
          
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
          consecutiveNoProgress = 0;
          
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
          
          // 检查是否是新阶段的计划
          if (previousPlanCompleted) {
            // 之前有已完成的计划，这是新阶段
            console.log();
            console.log(chalk.green('✓ 上一阶段计划已完成'));
            console.log(chalk.cyan('📋 下一阶段计划已生成:'));
            console.log(renderTaskProgress(currentPlan));
            console.log();
            console.log(chalk.cyan('是否继续执行下一阶段？'));
            console.log(chalk.gray('确认执行请输入: "继续"、"执行"、"开始"'));
            console.log(chalk.gray('修改计划请输入: 您的修改意见'));
            console.log(chalk.gray('取消请输入: "取消" 或开始新话题'));
            console.log();
            
            // 保存会话状态
            if (sessionStorage) {
              await sessionStorage.saveSession(session);
            }
            return;
          }
          
          // 当前计划还未完成，继续执行
          console.log(chalk.green('\n✓ 计划已生成，开始执行...'));
          addUserMessage(session, 
            '计划已确认。现在请开始执行第一步：\n' +
            `"${currentPlan.steps[0]?.description}"\n\n` +
            '使用可用工具完成这个步骤。'
          );
          continue;
        }
        
        // 复杂任务但没完成，也没有工具调用
        // 可能是模型在"思考"，需要引导
        addAssistantMessage(session, result.content);
        
        // ★ 关键修复：检测是否在问用户问题
        // 如果是，停止循环等待用户回复
        if (isAskingUserQuestion(result.content)) {
          console.log();  // 换行
          if (sessionStorage) {
            await sessionStorage.saveSession(session);
          }
          // 停止循环，等待用户回复
          return;
        }
        
        // 如果有当前计划，引导模型执行下一步
        if (currentPlan) {
          const nextStep = getNextPendingStep(currentPlan);
          if (nextStep) {
            console.log(chalk.yellow('\n💡 模型似乎在思考，但没有执行操作'));
            console.log(chalk.cyan(`下一步: ${nextStep.description}`));
            console.log(chalk.gray('请使用工具执行这一步。'));
            
            // 添加引导消息
            addUserMessage(session,
              `请继续执行计划。当前步骤: ${nextStep.description}\n\n使用可用工具完成这一步。`
            );
          }
          noToolCallRounds = 0;
          consecutiveNoProgress = 0;
        } else {
          // 没有计划，检查内容是否包含计划关键词
          if (result.content?.includes('步骤') || result.content?.includes('计划') || result.content?.includes('执行')) {
            noToolCallRounds = 0;
            consecutiveNoProgress = 0;
          } else {
            consecutiveNoProgress++;
          }
        }
        continue;
      }
      
      // 非复杂任务：检查是否有实质性内容
      if (hasSubstantialContent) {
        // 有实质性内容输出，重置计数器
        noToolCallRounds = 0;
        consecutiveNoProgress = 0;  // 有实质内容，重置
        
        // ★ 关键修复：检测是否在问用户问题
        // 如果是，停止循环等待用户回复
        if (isAskingUserQuestion(result.content)) {
          addAssistantMessage(session, result.content);
          console.log();  // 换行
          if (sessionStorage) {
            await sessionStorage.saveSession(session);
          }
          // 停止循环，等待用户回复
          return;
        }
      } else {
        // 无实质性内容，计数
        noToolCallRounds++;
        consecutiveNoProgress++;  // 无实质内容，增加
      }
      
      // 检查任务是否真的完成了
      if (isTaskCompleted) {
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
        
        // 记录任务成功
        await recordTaskExecution(
          {
            agent,
            session,
            taskDescription: message,
            approach: '完成任务',
            toolsUsed: Array.from(ctx.taskTracker.toolsUsed),
            steps: ctx.taskTracker.steps,
          },
          {
            success: true,
            summary: result.content?.slice(0, 200),
          }
        );
        
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
      
      // 有内容输出但没有任务完成信号，继续等待下一轮
      addAssistantMessage(session, result.content);
      continue;
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
        
        const answer = await interruptibleQuestion(chalk.cyan('\n请选择 [y/s/N]: '));
        
        if (state.interrupted) {
          console.log(chalk.gray('\n[已取消]'));
          return;
        }
        
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
    consecutiveNoProgress = 0;  // 有工具调用，重置无进展计数
    
    for (const toolCall of result.toolCalls) {
      const toolResult = await executeToolCall({
        toolCall,
        agent,
        session,
        state,
        currentPlan,
        sessionStorage,
      });
      
      // 追踪工具使用
      ctx.taskTracker.toolsUsed.add(toolCall.name);
      ctx.taskTracker.steps.push({
        id: toolCall.id,
        description: `调用 ${toolCall.name}`,
        success: toolResult?.success ?? false,
      });
      
      // 如果有计划，在工具执行成功后推进步骤
      if (currentPlan && toolResult?.success && ctx.executionState) {
        const advanceResult = advanceToNextStep(currentPlan, session);
        
        if (advanceResult.advanced && advanceResult.nextStep) {
          // 显示进度
          console.log();
          console.log(showTaskProgress(currentPlan, ctx.executionState));
          updateExecutionState(ctx.executionState, 'step_complete');
          
          // 显示下一步（不提示用户，让模型自动继续）
          console.log(chalk.cyan('\n📍 下一步: ') + advanceResult.nextStep.description);
        }
      }
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

async function executeToolCall(ctx: ToolCallExecuteContext): Promise<{ success: boolean; content?: string; error?: string }> {
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
        return { success: false, error: '用户取消' };
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
      
      // 步骤推进在外层循环中处理（advanceToNextStep）
      // 这里不再重复更新步骤状态
    } else {
      const errorMsg = toolResult.error || '未知错误';
      const durationInfo = toolDuration !== '0.0' ? chalk.gray(` (${toolDuration}s)`) : '';
      console.log(chalk.red(`✗ 失败${durationInfo}`));
      console.log(chalk.yellow(`  原因: ${errorMsg}`));
      
      // 标记当前步骤为失败
      if (currentPlan) {
        const currentStep = currentPlan.steps.find(s => s.status === 'in_progress');
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
  
  return toolResult;
}