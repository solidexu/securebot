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
import { OllamaConnectionError } from '../model/ollama.js';
import { getContextManager } from '../core/context-manager.js';
import {
  assessComplexity,
  parseTaskPlan,
  renderTaskProgress,
  updateStepStatus,
  getNextPendingStep,
  getPlanSummary,
  type TaskPlan,
} from '../core/smart-task.js';
import { createStepManager, type StepManager } from '../core/step-manager.js';
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

// ============ RAG 上下文注入（P1优化） ============

/**
 * 构建来自 RAG 的上下文
 * 
 * 根据用户消息检索相关知识点，注入到系统提示词中
 */
async function buildRAGContext(message: string, agentId: string): Promise<string> {
  try {
    // 动态导入 RAG 模块
    const { ragManager } = await import('../rag/tools.js');
    const { getMemoryManager } = await import('../core/memory.js');
    
    // 1. 尝试从 RAG 管理器获取 store
    let ragStore = null;
    try {
      ragStore = await ragManager.getStore({ id: agentId });
    } catch {
      // RAG 管理器没有配置此 agent，尝试从 memory 获取
    }
    
    // 2. 尝试从 memory manager 获取
    if (!ragStore) {
      const memoryManager = getMemoryManager();
      ragStore = memoryManager.getRAGStore();
    }
    
    if (!ragStore) {
      return '';
    }
    
    // 3. 检索相关内容
    const results = await ragStore.search(message, 5);  // 检索 5 条最相关内容
    
    if (results.length === 0) {
      return '';
    }
    
    // 4. 格式化为上下文
    const contextParts: string[] = ['## 相关知识库内容'];
    let totalTokens = 0;
    const maxTokens = 5000;  // RAG 内容最多 5000 tokens
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      // 估算 tokens（粗略：每 4 字符 ≈ 1 token）
      const estimatedTokens = Math.ceil(result.content.length / 4);
      
      if (totalTokens + estimatedTokens > maxTokens) {
        break;  // 超出限制，停止添加
      }
      
      // 截取内容（最多 1000 字符）
      const content = result.content.length > 1000 
        ? result.content.slice(0, 1000) + '...'
        : result.content;
      
      contextParts.push(`\n[${i + 1}] ${content}`);
      totalTokens += estimatedTokens;
    }
    
    if (contextParts.length === 1) {
      return '';  // 没有添加任何内容
    }
    
    console.log(chalk.gray(`📚 RAG: 注入 ${contextParts.length - 1} 条相关知识 (~${totalTokens} tokens)`));
    
    return contextParts.join('\n');
  } catch (error) {
    // RAG 检索失败不影响主流程
    return '';
  }
}

// ============ 实质进展检测（P1优化） ============

/**
 * 模型响应结果（简化版）
 */
interface ModelResult {
  content?: string | null;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
}

/**
 * 检测模型响应是否有实质进展
 * 
 * P1优化：明确定义"实质进展"的判断标准
 */
function hasSubstantialProgress(result: ModelResult): boolean {
  // 1. 有工具调用 = 实质进展
  if (result.toolCalls && result.toolCalls.length > 0) {
    return true;
  }
  
  const content = result.content?.trim() ?? '';
  
  // 2. 输出代码块 = 实质进展
  if (/```[\s\S]+```/.test(content)) {
    return true;
  }
  
  // 3. 输出文件内容标记 = 实质进展
  // 例如: "main.py:" 或 "**main.py**:"
  if (/^[a-zA-Z0-9_\-]+\.(ts|js|py|go|java|md|json|yaml|yml|sh)[：:\n]/m.test(content)) {
    return true;
  }
  if (/\*\*[a-zA-Z0-9_\-]+\.(ts|js|py|go|java|md|json)\*\*[：:\n]/m.test(content)) {
    return true;
  }
  
  // 4. 输出任务完成信号 = 实质进展
  const completionSignals = [
    '任务完成', '开发完成', '实现完成', '已完成',
    '开发完毕', '实现完毕', '全部完成', '完整实现',
    'done', 'complete', 'finished',
  ];
  if (completionSignals.some(signal => content.toLowerCase().includes(signal.toLowerCase()))) {
    return true;
  }
  
  // 5. 输出步骤完成标记 = 实质进展
  // 例如: "✓ 已完成" 或 "步骤1完成"
  // ★ 修复：不能只看关键词，必须有成功的工具调用
  // 以前：模型说"成功"就算完成（即使工具调用失败）
  // 现在：必须检查是否有工具调用，且工具调用成功
  if (/(✓|✅|✔|完成|成功)/.test(content)) {
    // 如果有工具调用，需要验证工具调用是否成功
    if (result.toolCalls && result.toolCalls.length > 0) {
      // 有工具调用，暂时不算完成，等下一轮验证结果
      return true;
    }
    // 没有工具调用，只说"完成"不算实质进展
    return false;
  }
  
  // 6. 内容长度显著增加 = 实质进展
  // 超过 500 字符的输出通常包含有用信息
  if (content.length > 500) {
    return true;
  }
  
  // 7. 输出创建/修改的内容 = 实质进展
  const actionPatterns = [
    /已(创建|生成|编写|实现|添加|修改|更新)/,
    /正在(创建|生成|编写|实现|添加|修改|更新)/,
    /成功(创建|生成|编写|实现|添加|修改|更新)/,
  ];
  if (actionPatterns.some(p => p.test(content))) {
    return true;
  }
  
  // 8. 输出执行计划 = 实质进展
  if (/^(#|##)\s*(执行计划|任务计划|开发计划|实施步骤)/m.test(content)) {
    return true;
  }
  
  return false;
}

/**
 * 检测是否是正常对话结束（不需要继续循环）
 * 
 * 用于区分：
 * - 简单问候/介绍 → 正常结束，不需要继续
 * - 任务进行中 → 需要继续
 * - 模型卡住 → 触发无进展警告
 */
function isNormalConversationEnd(result: ModelResult, complexity: 'simple' | 'moderate' | 'complex'): boolean {
  const content = result.content?.trim() ?? '';
  
  // 如果有工具调用，不是对话结束
  if (result.toolCalls && result.toolCalls.length > 0) {
    return false;
  }
  
  // 简单/中等复杂度任务：检测对话结束信号
  if (complexity !== 'complex') {
    // 1. 问候/自我介绍模式
    const greetingPatterns = [
      /^你好[！!。．]/,
      /^嗨[！!。．]/,
      /^您好[！!。．]/,
      /我是.*助手/,
      /我是.*AI/,
      /我可以帮助你/,
      /请问有什么/,
      /有什么我可以/,
      // 英文
      /^Hello[!.]/i,
      /^Hi[!.]/i,
      /I'm.*assistant/i,
      /I can help/i,
    ];
    if (greetingPatterns.some(p => p.test(content))) {
      return true;
    }
    
    // 2. 等待用户回复（问题结尾）
    if (/\?|？$/.test(content) || /请问|需要确认|是否/.test(content)) {
      return true;
    }
    
    // 3. 有实质内容的回复（长度足够）
    if (content.length > 100) {
      return true;
    }
  }
  
  return false;
}

/**
 * 分析无进展原因
 * 
 * 返回无进展的具体原因，用于提示用户
 */
function analyzeNoProgressReason(result: ModelResult): string {
  const content = result.content?.trim() ?? '';
  
  // 检查是否在等待用户输入
  if (/\?|？$/.test(content) || /请问|需要确认|是否/.test(content)) {
    return '模型在等待您的回复或确认';
  }
  
  // 检查是否在解释而非执行
  if (/^(我|这|以下|下面|首先|让我|我来)/.test(content)) {
    return '模型可能在解释而非执行操作';
  }
  
  // 检查是否输出过短
  if (content.length < 100) {
    return '模型输出过短，可能没有实质性操作';
  }
  
  // 检查是否在重复
  return '模型可能在循环中，建议打断或重新描述任务';
}

// ============ 监听器管理器 ============

/**
 * 监听器管理器
 * 
 * 统一管理事件监听器，避免内存泄漏
 */
class ListenerManager {
  private listeners: Array<{
    target: EventTarget;
    event: string;
    handler: EventListener;
  }> = [];
  
  /**
   * 添加监听器
   */
  add(target: EventTarget, event: string, handler: EventListener): void {
    target.addEventListener(event, handler);
    this.listeners.push({ target, event, handler });
  }
  
  /**
   * 清除所有监听器
   */
  clearAll(): void {
    for (const { target, event, handler } of this.listeners) {
      target.removeEventListener(event, handler);
    }
    this.listeners = [];
  }
  
  /**
   * 获取监听器数量
   */
  count(): number {
    return this.listeners.length;
  }
}

/** 任务追踪状态 */
interface TaskTracker {
  toolsUsed: Set<string>;
  steps: { id: string; description: string; success: boolean }[];
  startTime: number;
}

// ============ 问题检测（增强版） ============

/**
 * 问题检测上下文
 */
interface QuestionDetectionContext {
  /** 是否有工具调用 */
  hasToolCalls: boolean;
  /** 内容长度 */
  contentLength: number;
  /** 是否是第一轮 */
  isFirstRound: boolean;
  /** 之前的连续无工具调用轮数 */
  consecutiveNoToolCalls: number;
}

/**
 * 问题检测配置
 */
const QUESTION_DETECTION_CONFIG = {
  // 最小内容长度（太短的不检测）
  minContentLength: 5,
  // 最大内容长度（太长的通常是输出结果，不是问题）
  // 提高到 2000，因为有些问题确实比较长
  maxContentLengthForQuestion: 2000,
  // 问题关键词（必须出现这些才可能是问题）
  questionKeywords: [
    // 中文
    '请选择', '请确认', '请决定', '请提供', '请输入',
    '是否', '要不要', '想不想', '需不需要',
    '哪一个', '哪个', '什么', '怎么', '如何',
    '可以吗', '好吗', '行吗', '现在可以开始',
    // 英文
    'would you', 'do you', 'can you', 'could you',
    'please choose', 'please confirm', 'please provide',
  ],
  // 排除模式（这些不是问题）
  excludePatterns: [
    // 问候语
    /^有什么.{0,10}(可以|能|帮你|帮助)/,
    /^.{0,20}(欢迎|您好|你好|hi|hello)/,
    // 陈述句开头
    /^.{0,20}(我(是|叫|可以|会|将|已)|这是|这里是)/,
    // 自我介绍
    /^.{0,30}(助手|助理|专家|专员)/,
    // 能力描述
    /^.{0,20}(我可以|我能|我(会|将)帮你|能够)/,
    // 结束语
    /^.{0,20}(好的|收到|明白|了解|没问题)/,
    // ★ 新增排除模式（P0优化）
    // 输出引导语
    /^以下是/,
    /^下面是/,
    /^这是/,
    // 功能特性描述
    /^功能特性/,
    /^主要特点/,
    /^核心功能/,
    // Markdown 标题格式（通常是输出结构）
    /^\*\*.+\*\*[：:]/,
    /^\*\*.+\*\*\s*[-—]/,
    // 代码或文件内容标记
    /^```/,
    /^[a-zA-Z0-9_\-]+\.(ts|js|py|go|java|md|json)[：:]/,
    // 进度/状态报告
    /^(✅|✓|✔|⬜|🔄|❌)\s/,
    /^步骤\s*\d/,
    /^第\s*\d+\s*步/,
    // 总结性陈述
    /^(总结|概述|摘要|说明)[：:]/,
    /^已经(完成|实现|创建|编写)/,
    // 技术指标
    /时间复杂度/,
    /空间复杂度/,
    /^复杂度[：:]/,
  ],
  // 明确的问题模式（必须匹配）
  explicitQuestionPatterns: [
    // 中文（必须以问号结尾）
    /[吗？|？]$/,
    /\？$/,
    // 选择性问题
    /请选择.*[？?]?$/,
    /需要.*[吗？]$/,
    // 确认性问题
    /确认.*[吗？]$/,
    /是否.*[？?]?$/,
    // 开始确认
    /现在可以开始.*[？?]$/,
    // 英文
    /\?$/,
  ],
};

/**
 * 检测内容是否是在问用户问题
 * 
 * 增强版：结合上下文判断，避免误判
 */
function isAskingUserQuestion(
  content: string | null | undefined,
  context?: QuestionDetectionContext
): boolean {
  if (!content || content.trim().length === 0) {
    return false;
  }
  
  const trimmedContent = content.trim();
  
  // ★★ 优先检查：是否是任务流程中的确认（不应停止）
  const taskFlowPatterns = [
    /是否继续执行步骤/,
    /是否继续执行下一步/,
    /是否继续执行计划/,
    /是否继续.*步骤/,
    /继续执行.*吗[？?]?$/,
    /开始执行.*吗[？?]?$/,
    /执行下一步/,
    /进行下一步/,
  ];
  for (const pattern of taskFlowPatterns) {
    if (pattern.test(trimmedContent)) {
      return false;  // 这是任务流程中的确认，不应停止
    }
  }
  
  // 1. 内容长度检查
  if (trimmedContent.length < QUESTION_DETECTION_CONFIG.minContentLength) {
    return false;
  }
  
  // 2. ★ 检查是否包含明确的问题句式
  // 这些是绝对的问题标志，应该优先检测
  const definiteQuestionPatterns = [
    /^请问/,
    /请问.*[？?]$/,
    /我可以帮你.*[？?]$/,
    /有什么可以帮.*[？?]$/,
    /需要我.*[？?]$/,
    /是否需要.*[？?]$/,
    /你现在想/,
    /你想/,
    /你现在需要/,
  ];
  
  for (const pattern of definiteQuestionPatterns) {
    if (pattern.test(trimmedContent)) {
      return true;
    }
  }
  
  // 3. ★ 检查是否包含列表式问题（如 "- 继续开发新功能？"）
  const listQuestionPattern = /^[\-\*•]\s*.+[？?]$/m;
  if (listQuestionPattern.test(trimmedContent)) {
    return true;
  }
  
  // 4. 检查所有句子，是否有问句
  const sentences = trimmedContent.split(/[。.!！\n]/).filter(s => s.trim());
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    
    // 以问号结尾
    if (/\？|\?$/.test(trimmedSentence)) {
      // 包含问题词
      const questionWords = ['吗', '呢', '么', '哪', '什', '怎', '多', '几', '谁', '何', '想', '需要'];
      const hasQuestionWord = questionWords.some(w => trimmedSentence.includes(w));
      
      if (hasQuestionWord) {
        // ★ 再次检查是否是任务流程确认
        if (/是否继续|继续执行|执行步骤/.test(trimmedSentence)) {
          return false;
        }
        return true;
      }
    }
  }
  
  // 5. 排除模式检查（问候语、自我介绍等）
  for (const pattern of QUESTION_DETECTION_CONFIG.excludePatterns) {
    if (pattern.test(trimmedContent)) {
      return false;
    }
  }
  
  // 6. 上下文检查
  if (context) {
    if (context.hasToolCalls) {
      return false;
    }
    if (trimmedContent.length > QUESTION_DETECTION_CONFIG.maxContentLengthForQuestion) {
      return false;
    }
  }
  
  // 7. 检查是否包含问题关键词
  const lowerContent = trimmedContent.toLowerCase();
  const hasQuestionKeyword = QUESTION_DETECTION_CONFIG.questionKeywords.some(
    kw => lowerContent.includes(kw.toLowerCase())
  );
  
  // 8. 检查是否匹配明确的问题模式
  for (const pattern of QUESTION_DETECTION_CONFIG.explicitQuestionPatterns) {
    if (pattern.test(trimmedContent)) {
      if (hasQuestionKeyword || /[？?]$/.test(trimmedContent)) {
        return true;
      }
    }
  }
  
  return false;
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
    
    // ★ 新增：显示当前上下文 token 数量
    const contextManager = getContextManager();
    const toolsForStats = getAvailableTools(agent, state.config.tools);
    const preliminaryStats = contextManager.getContextStats(
      session.history,
      toolsForStats
    );
    console.log(chalk.gray(`📊 上下文: ${preliminaryStats.totalTokens.toLocaleString()} tokens (${preliminaryStats.usagePercent.toFixed(1)}%)`));
    
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
    let skillActivated = false;
    let activatedSkillName = '';
    
    if (skillMatch && skillMatch.score >= 0.5) {
      if (!activeSkills.includes(skillMatch.skill.id)) {
        activeSkills = [...activeSkills, skillMatch.skill.id];
        skillActivated = true;
        activatedSkillName = skillMatch.skill.name;
        console.log(chalk.cyan(`🎯 激活技能: ${skillMatch.skill.name} (${skillMatch.method})`));
      }
    }
    
    // 如果激活了技能，在回复开始时显示
    if (skillActivated) {
      process.stdout.write(chalk.cyan(`🎯 [技能: ${activatedSkillName}]\n\n`));
    }
    
    const skillsPrompt = await skillManager.buildSkillsPrompt(agent.id, activeSkills);
    
    // 构建基础系统提示
    let baseSystemPrompt = await buildSystemPrompt(
      agent,
      state.config,
      getAvailableToolNames(agent, state.config.tools),
      skillsPrompt
    );
    
    // ★ P1优化：RAG 检索相关内容注入上下文
    const ragContext = await buildRAGContext(message, agent.id);
    if (ragContext) {
      baseSystemPrompt += '\n\n' + ragContext;
    }
    
    // 使用增强的 Prompt（自动注入学习到的经验）
    let systemPrompt = await buildEnhancedSystemPrompt(agent, baseSystemPrompt);
    
    // P2优化：增强规划阶段系统提示词
    if (complexity === 'complex') {
      const planInstruction = `
## 🚫 绝对禁止：这是规划阶段，你没有任何工具可用！

你现在处于**规划模式**，系统已禁用所有工具。你的唯一任务是输出一个文本格式的执行计划。

### 🚫 绝对禁止的行为（违反将导致错误）：
- ❌ 不要调用任何工具（read、write、exec 等）
- ❌ 不要写代码
- ❌ 不要创建文件
- ❌ 不要输出代码块（\`\`\`）
- ❌ 不要输出功能特性或设计描述
- ❌ 不要问用户问题（"你想实现哪种？"）
- ❌ 不要输出 "好的，我来帮你..."

### ✅ 你唯一应该做的事：
输出一个简单的 Markdown 格式的执行计划，然后立即停止。

### 📝 输出格式（严格遵守）：

# 执行计划

1. 步骤一（动词开头）
2. 步骤二
3. 步骤三
...

---

### ✅ 正确示例：

# 执行计划

1. 创建项目目录结构
2. 实现核心算法类
3. 编写单元测试
4. 创建配置文件

---

现在请输出计划，然后等待用户确认后才能执行。
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
      activeSkills,  // ★ P1优化：传递激活的技能列表
    });
    
  } finally {
    state.executing = false;
    state.interrupted = false;
    state.abortController = undefined;
  }
}

// ============ 任务结束记录 ============

/** 任务结束原因 */
type TaskEndReason = 'completed' | 'cancelled' | 'failed' | 'max_rounds';

/**
 * 统一记录任务结束
 * 无论成功、失败、取消都会记录，确保数据完整
 */
async function recordTaskEnd(
  ctx: ToolCallLoopContext,
  reason: TaskEndReason,
  options?: {
    summary?: string;
    error?: string;
  }
): Promise<void> {
  const { agent, session, message, taskTracker, activeSkills } = ctx;
  
  try {
    await recordTaskExecution(
      {
        agent,
        session,
        taskDescription: message,
        approach: reason === 'completed' ? '完成任务' : reason,
        toolsUsed: Array.from(taskTracker.toolsUsed),
        steps: taskTracker.steps,
      },
      {
        success: reason === 'completed',
        summary: options?.summary,
        error: options?.error,
        cancelled: reason === 'cancelled',
      }
    );
    
    // ★ P1优化：记录技能使用统计
    if (activeSkills && activeSkills.length > 0) {
      const skillDetector = getSkillDetector();
      for (const skillId of activeSkills) {
        skillDetector.recordUsage(skillId, reason === 'completed');
      }
    }
  } catch (err) {
    // 记录失败不应阻塞主流程
    console.error('记录任务结束失败:', err);
  }
}

// ============ 技能优化检查 ============

/**
 * 自动检查并优化技能
 * 
 * 在任务成功完成后调用
 */
async function checkAndOptimizeSkills(agentId: string): Promise<void> {
  try {
    const { getSkillGenerator } = await import('../core/self-improving/index.js');
    const generator = getSkillGenerator();
    
    // 检查是否需要生成/合并/淘汰技能
    const result = await generator.checkAndGenerateSkills(agentId);
    
    // 如果有操作，显示结果
    if (result.generated.length > 0 || result.merged.length > 0 || result.retired.length > 0) {
      console.log(chalk.gray('\n📝 技能优化:'));
      
      if (result.generated.length > 0) {
        console.log(chalk.green(`  ✓ 生成 ${result.generated.length} 个新技能`));
      }
      if (result.merged.length > 0) {
        console.log(chalk.cyan(`  ↔ 合并 ${result.merged.length} 组相似技能`));
      }
      if (result.retired.length > 0) {
        console.log(chalk.yellow(`  ✗ 淘汰 ${result.retired.length} 个低效技能`));
      }
    }
  } catch (error) {
    // 技能优化失败不影响主流程
    // 静默处理
  }
}

// ============ 工具调用循环 ============

/** 自动重试的最大次数 */
const MAX_AUTO_RETRY = 3;

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
  /** 步骤管理器（修复：统一步骤管理） */
  stepManager?: StepManager;
  /** ★ P1优化：激活的技能列表 */
  activeSkills?: string[];
  /** ★ 新增：步骤失败次数追踪 */
  stepFailures?: Map<string, number>;
}

async function runToolCallLoop(ctx: ToolCallLoopContext): Promise<void> {
  const { state, agent, session, message, systemPrompt, availableTools, sessionStorage } = ctx;
  let { currentPlan, lastPlanRender, shouldExecutePlan, complexity } = ctx;
  
  // 初始化步骤失败追踪
  if (!ctx.stepFailures) {
    ctx.stepFailures = new Map<string, number>();
  }
  
  // 修复：恢复会话时初始化 executionState
  if (currentPlan && !ctx.executionState) {
    ctx.executionState = createExecutionState(currentPlan, 'guided');
    // 恢复已完成的步骤计数
    ctx.executionState.completedSteps = currentPlan.steps.filter(s => s.status === 'completed').length;
  }
  
  // 修复：初始化步骤管理器，统一管理步骤状态
  if (currentPlan && !ctx.stepManager) {
    ctx.stepManager = createStepManager(currentPlan, session);
  }
  
  // ★ 监听器管理器
  const listenerManager = new ListenerManager();
  
  // 创建可中断的 question 函数
  const interruptibleQuestion = async (prompt: string): Promise<string> => {
    // 如果已经被打断，直接返回空
    if (state.interrupted) {
      return '';
    }
    
    // 创建 AbortController 用于打断 rl.question
    const questionAbort = new AbortController();
    const abortHandler = () => {
      if (!questionAbort.signal.aborted) {
        questionAbort.abort();
      }
    };
    
    // 使用监听器管理器注册
    if (state.abortController) {
      listenerManager.add(state.abortController.signal, 'abort', abortHandler);
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
      listenerManager.clearAll();
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
      
      // P1优化：分析无进展原因
      // 使用上一轮的结果（如果有的话）来分析
      const lastResult = round > 0 ? { content: session.history[session.history.length - 1]?.content } : null;
      const reason = lastResult ? analyzeNoProgressReason(lastResult) : '模型可能在循环中';
      
      console.log(chalk.gray(`原因分析: ${reason}`));
      console.log(chalk.gray('建议操作:'));
      console.log(chalk.gray('  1. 按 Ctrl+C 打断当前操作'));
      console.log(chalk.gray('  2. 使用 /reset 清除会话历史'));
      console.log(chalk.gray('  3. 更详细地描述任务要求'));
      
      // 询问用户是否继续
      const answer = await interruptibleQuestion(chalk.cyan('\n是否继续尝试？ [y/N]: '));
      if (state.interrupted) {
        console.log(chalk.gray('\n[已取消]'));
        await recordTaskEnd(ctx, 'cancelled', { error: '用户中断（无进展）' });
        return;
      }
      if (answer.toLowerCase() !== 'y') {
        console.log(chalk.gray('已停止'));
        await recordTaskEnd(ctx, 'cancelled', { error: '用户停止（无进展）' });
        return;
      }
      consecutiveNoProgress = 0;  // 重置
    }
    
    round++;
    
    // 复杂任务：有计划之前不传工具
    let toolsForThisRound = availableTools;
    if (complexity === 'complex' && !currentPlan) {
      toolsForThisRound = [];
    }
    
    // ★ 多模型支持：根据任务类型选择模型
    let modelForThisRound = state.config.model.model;
    if (complexity === 'complex' && !currentPlan) {
      // 复杂任务规划阶段，使用规划模型
      if (state.config.model.planner) {
        modelForThisRound = state.config.model.planner;
      }
    } else if (complexity === 'complex' && currentPlan) {
      // 复杂任务执行阶段，使用编码模型
      if (state.config.model.coder) {
        modelForThisRound = state.config.model.coder;
      }
    }
    // 其他情况使用默认模型
    
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...session.history,
    ];
    
    // P2优化：上下文管理，提高阈值减少频繁压缩
    const contextManager = getContextManager();
    const stats = contextManager.getContextStats(messages, toolsForThisRound);
    
    let finalMessages = messages;
    
    // 提高阈值：只在 80% 以上才尝试压缩（原 60%）
    if (stats.usagePercent > 80) {
      const { getContextCompressor } = await import('../core/context-compressor.js');
      const compressor = getContextCompressor();
      
      // 设置 LLM（如果有）
      if (state.modelAdapter.chat) {
        compressor.setLLM(
          { chat: state.modelAdapter.chat.bind(state.modelAdapter) },
          state.config.model.model
        );
      }
      
      // 检查是否需要压缩
      if (compressor.needsCompression(messages, contextManager.getMaxTokens(), stats.totalTokens)) {
        console.log(chalk.cyan('\n📦 优化上下文...'));
        
        // P2优化：区分压缩策略
        let compressedMessages: Message[];
        
        if (stats.usagePercent > 90) {
          // 紧急情况：快速压缩，只保留最近消息
          console.log(chalk.yellow('  使用快速压缩模式'));
          compressedMessages = contextManager.trimMessages(messages, toolsForThisRound, {
            keepSystem: true,
            keepRecent: 3,  // 只保留最近 3 轮
          });
        } else {
          // 正常压缩
          compressedMessages = await compressor.compress(messages);
        }
        
        const compressedStats = contextManager.getContextStats(compressedMessages, toolsForThisRound);
        
        console.log(chalk.green(`✓ 完成: ${stats.totalTokens.toLocaleString()} → ${compressedStats.totalTokens.toLocaleString()} tokens`));
        
        finalMessages = compressedMessages;
      }
    }
    
    // 如果仍然超限，裁剪
    if (contextManager.isContextOverflow(finalMessages, toolsForThisRound)) {
      finalMessages = contextManager.trimMessages(finalMessages, toolsForThisRound);
      
      const finalStats = contextManager.getContextStats(finalMessages, toolsForThisRound);
      console.log(chalk.yellow(`\n⚠️ 已裁剪 ${messages.length - finalMessages.length} 条消息`));
      console.log(chalk.gray(`   当前: ${finalStats.totalTokens.toLocaleString()} tokens (${finalStats.usagePercent.toFixed(1)}%)`));
    }
    
    // 创建进度动画
    const thinkingMessage = round === 1 ? '思考中' : `继续思考 (轮次 ${round})`;
    const progressAnimation = new ProgressAnimation(thinkingMessage, ctx.abortController.signal);
    progressAnimation.start();
    
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
          messages: finalMessages,
          tools: toolsForThisRound.length > 0 ? toolsForThisRound : undefined,
          onStream,
          signal: ctx.abortController.signal,
        } as ChatParams & { onStream: StreamCallback; signal: AbortSignal });
      } else {
        result = await state.modelAdapter.chat({
          model: state.config.model.model,
          messages: finalMessages,
          tools: toolsForThisRound.length > 0 ? toolsForThisRound : undefined,
        } as ChatParams);
      }
      
      if (state.interrupted) {
        progressAnimation.stop();
        await recordTaskEnd(ctx, 'cancelled', { error: '用户中断' });
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
      // 注意：只有明确的 AbortError 才是用户取消，其他错误应该显示具体信息
      const isAbortError = 
        state.interrupted ||
        (error instanceof Error && error.name === 'AbortError' && state.interrupted);
      
      if (isAbortError) {
        console.log(chalk.gray('\n[已取消]'));
        await recordTaskEnd(ctx, 'cancelled', { error: '用户取消' });
        return;
      }
      
      // 检查是否是 Ollama 连接错误
      if (error instanceof OllamaConnectionError) {
        console.log();
        console.log(chalk.red(error.getUserFriendlyMessage()));
        console.log();
        await recordTaskEnd(ctx, 'failed', { error: error.message });
        return;
      }
      
      // 其他错误显示具体信息
      const errMsg = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`\n模型调用失败: ${errMsg}`));
      console.log(chalk.gray('请检查 Ollama 服务是否运行，或使用 /model 切换模型'));
      await recordTaskEnd(ctx, 'failed', { error: errMsg });
      return;
    }
    
    // 解析任务计划
    if (complexity === 'complex' && result.content) {
      // ★ 关键修复：检查是否已有未完成的计划
      const hasExistingPlan = currentPlan && currentPlan.steps.some(s => 
        s.status === 'pending' || s.status === 'in_progress'
      );
      
      // ★ 增强检查：如果已有计划，且步骤数量相同，忽略新计划
      // 防止模型重复输出相同计划
      if (hasExistingPlan) {
        const parsedPlan = parseTaskPlan(result.content);
        // 检查是否是重复计划
        if (parsedPlan && parsedPlan.steps.length > 0) {
          const sameStepCount = parsedPlan.steps.length === currentPlan?.steps.length;
          const similarContent = parsedPlan.steps.some((s, i) => 
            currentPlan?.steps[i]?.description.includes(s.description) ||
            s.description.includes(currentPlan?.steps[i]?.description || '')
          );
          
          if (sameStepCount && similarContent) {
            // 这是重复计划，引导模型执行当前步骤
            const currentStep = currentPlan?.steps.find(s => s.status === 'in_progress') || 
                               getNextPendingStep(currentPlan!);
            if (currentStep) {
              console.log(chalk.gray('（检测到重复计划，继续执行当前步骤）'));
              // 清除工具调用
              result.toolCalls = undefined;
              // 添加引导消息
              addAssistantMessage(session, result.content);
              addUserMessage(session, 
                `计划已在执行中。请继续执行当前步骤：${currentStep.description}\n\n` +
                `直接调用工具完成这一步，不要再输出计划。`
              );
              continue;
            }
          }
        }
      } else {
        // 只有在没有未完成的计划时才解析新计划
        const parsedPlan = parseTaskPlan(result.content);
        if (parsedPlan && parsedPlan.steps.length > 0) {
          currentPlan = parsedPlan;
          savePlanToSession(session, currentPlan, message);
          
          // 初始化执行状态
          if (!ctx.executionState) {
            ctx.executionState = createExecutionState(currentPlan, 'guided');
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
            
            // ★ 等待用户确认计划
            console.log();
            console.log(chalk.yellow('是否按此计划执行？'));
            const answer = await interruptibleQuestion(chalk.cyan('[y/N]: '));
            
            if (state.interrupted) {
              console.log(chalk.gray('\n[已取消]'));
              await recordTaskEnd(ctx, 'cancelled', { error: '用户取消规划' });
              return;
            }
            
            if (answer.toLowerCase() !== 'y') {
              console.log(chalk.gray('已取消任务'));
              await recordTaskEnd(ctx, 'cancelled', { error: '用户取消规划' });
              return;
            }
            
            // 用户确认后，开始执行
            console.log();
            console.log(chalk.green('✓ 计划已确认，开始执行：'));
            console.log();
            
            // 标记第一个步骤为 in_progress
            if (currentPlan && currentPlan.steps.length > 0 && currentPlan.steps[0]) {
              currentPlan.steps[0].status = 'in_progress';
              savePlanToSession(session, currentPlan, message);
            }
            
            // 显示带进度条的计划
            console.log(renderTaskProgress(currentPlan));
            if (ctx.executionState) {
              console.log(showTaskProgress(currentPlan, ctx.executionState));
            }
            console.log();
            
            // ★ 关键：添加引导消息让模型执行第一步
            const firstStep = currentPlan?.steps[0];
            if (firstStep) {
              addAssistantMessage(session, result.content);
              addUserMessage(session, 
                `计划已确认。现在开始执行第1步：${firstStep.description}\n\n` +
                `直接调用工具（如 write, exec 等）完成这一步。不要再输出计划格式。`
              );
              // 清除工具调用，让模型重新开始
              result.toolCalls = undefined;
              // 继续循环，让模型执行第一步
              continue;
            }
          }
          
          // ★ 关键：计划解析成功后，清除模型返回的工具调用，等待用户确认
          // 如果模型同时返回了工具调用，忽略它们，等用户确认后再执行
          if (result.toolCalls && result.toolCalls.length > 0) {
            console.log(chalk.gray('（模型尝试调用工具，已暂存等待计划确认后执行）'));
            result.toolCalls = undefined;
          }
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
      
      // ★ 新增：检测是否是正常对话结束（简单问候/介绍等）
      // 如果是，直接结束，不触发无进展警告
      if (isNormalConversationEnd(result, complexity)) {
        addAssistantMessage(session, result.content);
        console.log();  // 换行
        if (sessionStorage) {
          await sessionStorage.saveSession(session);
        }
        return;  // 正常结束对话
      }
      
      // P1优化：使用统一的实质进展检测函数
      const hasSubstantialContent = hasSubstantialProgress(result);
      
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
          await recordTaskEnd(ctx, 'completed', { summary: result.content?.slice(0, 200) });
          
          // ★ 自动触发技能优化检查
          await checkAndOptimizeSkills(agent.id);
          
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
        if (isAskingUserQuestion(result.content, {
          hasToolCalls: false,
          contentLength: result.content?.length || 0,
          isFirstRound: round === 1,
          consecutiveNoToolCalls: noToolCallRounds,
        })) {
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
        if (isAskingUserQuestion(result.content, {
          hasToolCalls: false,
          contentLength: result.content?.length || 0,
          isFirstRound: round === 1,
          consecutiveNoToolCalls: noToolCallRounds,
        })) {
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
        await recordTaskEnd(ctx, 'completed', { summary: result.content?.slice(0, 200) });
        
        // ★ 自动触发技能优化检查
        await checkAndOptimizeSkills(agent.id);
        
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
          await recordTaskEnd(ctx, 'cancelled', { error: '用户中断' });
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
          await recordTaskEnd(ctx, 'cancelled', { error: '用户取消规划' });
          return;
        }
      }
      
      addAssistantMessage(session, result.content);
      // 修复：增强规划引导，给出明确的正确示例
      addUserMessage(session, 
        '【错误】你刚才尝试执行了工具，但规划阶段禁止执行任何操作！\n\n' +
        '你的任务是：只输出一个文本格式的执行计划，不要做任何其他事情。\n\n' +
        '✅ 正确做法：\n' +
        '```markdown\n' +
        '# 执行计划\n\n' +
        '1. 创建项目目录结构\n' +
        '2. 实现核心功能模块\n' +
        '3. 编写测试用例\n' +
        '4. 创建配置文件\n\n' +
        '---\n' +
        '```\n\n' +
        '❌ 错误做法：\n' +
        '- 调用 read/write/exec 等工具\n' +
        '- 输出代码块\n' +
        '- 问用户问题\n\n' +
        '现在请重新输出计划，等待用户确认后才能执行。'
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
      
      // ★ P0优化：处理步骤失败，提供用户选择
      // ★ P0优化：步骤失败时自动重试，不立即问用户
      if (toolResult?.failedStep) {
        const failedStep = toolResult.failedStep;
        
        // 追踪失败次数
        const failureCount = (ctx.stepFailures?.get(failedStep.id) || 0) + 1;
        ctx.stepFailures?.set(failedStep.id, failureCount);
        
        // 使用 stepManager 标记失败
        if (ctx.stepManager) {
          ctx.stepManager.failStep(failedStep.id, failedStep.error);
        } else if (currentPlan) {
          updateStepStatus(currentPlan, failedStep.id, 'failed', failedStep.error);
          savePlanToSession(session, currentPlan);
        }
        
        console.log();
        console.log(chalk.red(`❌ 步骤执行失败 (第 ${failureCount} 次)`));
        console.log(chalk.cyan(`步骤: ${failedStep.description}`));
        
        // 截取错误信息，避免太长
        const errorMsg = failedStep.error.length > 500 
          ? failedStep.error.slice(0, 500) + '...'
          : failedStep.error;
        console.log(chalk.yellow(`原因: ${errorMsg}`));
        
        // ★ 判断是否应该自动重试
        if (failureCount < MAX_AUTO_RETRY) {
          console.log(chalk.cyan('\n🔄 尝试自动修复...'));
          
          // 重置步骤状态为 pending，让模型可以重试
          if (ctx.stepManager) {
            ctx.stepManager.retryStep(failedStep.id);
          } else if (currentPlan) {
            updateStepStatus(currentPlan, failedStep.id, 'pending');
            savePlanToSession(session, currentPlan);
          }
          
          // ★ 添加引导消息，让模型自己分析错误并尝试修复
          const autoRetryPrompt = `## ⚠️ 步骤执行失败，请自动分析并修复

**失败的步骤**: ${failedStep.description}

**错误信息**:
\`\`\`
${errorMsg}
\`\`\`

**你需要做的**:
1. 分析错误原因（仔细阅读错误信息）
2. 找出问题所在（是代码错误？配置问题？还是其他？）
3. 尝试修复问题（修改代码、调整配置等）
4. 重新执行该步骤

**注意**: 这是第 ${failureCount} 次失败，你还有 ${MAX_AUTO_RETRY - failureCount} 次自动重试机会。

请立即分析错误并尝试修复，不要问用户。`;
          
          addUserMessage(session, autoRetryPrompt);
          
          // 继续循环让模型自动修复
          continue;
        }
        
        // ★ 连续失败次数过多，停下来问用户
        console.log(chalk.red(`\n⚠️ 该步骤已连续失败 ${failureCount} 次`));
        console.log();
        if (ctx.stepManager) {
          console.log(ctx.stepManager.renderStepList());
        } else {
          console.log(renderTaskProgress(currentPlan!));
        }
        console.log();
        
        // 提供用户选择
        console.log(chalk.cyan('自动修复失败，请选择:'));
        console.log(chalk.gray('  1. 重试当前步骤 (输入 r)'));
        console.log(chalk.gray('  2. 跳过并继续下一步 (输入 s)'));
        console.log(chalk.gray('  3. 停止任务并保存进度 (输入 q)'));
        
        const answer = await interruptibleQuestion(chalk.cyan('\n请选择 [r/s/q]: '));
        
        if (state.interrupted) {
          console.log(chalk.gray('\n[已取消]'));
          await recordTaskEnd(ctx, 'cancelled', { error: '用户中断' });
          return;
        }
        
        const choice = answer.toLowerCase().trim();
        
        if (choice === 'r') {
          // 重试：重置失败计数，让模型重新尝试
          console.log(chalk.green('\n✓ 将重试当前步骤...'));
          ctx.stepFailures?.delete(failedStep.id);  // 重置失败计数
          
          if (ctx.stepManager) {
            ctx.stepManager.retryStep(failedStep.id);
          } else if (currentPlan) {
            updateStepStatus(currentPlan, failedStep.id, 'pending');
            savePlanToSession(session, currentPlan);
          }
          
          // 添加引导消息让模型重试
          addUserMessage(session,
            `用户选择重试。请重新尝试执行步骤: ${failedStep.description}\n\n` +
            `之前的错误: ${errorMsg}\n\n` +
            `请仔细分析错误原因并尝试不同的方法。`
          );
          // 继续循环让模型重试
          continue;
        } else if (choice === 's') {
          // 跳过：使用 stepManager 跳过并推进
          console.log(chalk.yellow('\n⏭️ 跳过当前步骤...'));
          ctx.stepFailures?.delete(failedStep.id);  // 清除失败计数
          
          if (ctx.stepManager) {
            const skipResult = ctx.stepManager.skipStep(failedStep.id, failedStep.error);
            if (skipResult.nextStep) {
              console.log(chalk.cyan(`📍 下一步: ${skipResult.nextStep.description}`));
              // 添加引导消息
              addUserMessage(session,
                `上一步已跳过。继续执行下一步: ${skipResult.nextStep.description}`
              );
            } else {
              // 没有更多步骤
              console.log(chalk.green('\n✓ 所有步骤已处理完成'));
              await recordTaskEnd(ctx, 'completed', { summary: '任务完成（有步骤被跳过）' });
              return;
            }
          } else if (currentPlan) {
            // 兼容旧逻辑
            updateStepStatus(currentPlan, failedStep.id, 'skipped', failedStep.error);
            savePlanToSession(session, currentPlan);
            
            const nextStep = getNextPendingStep(currentPlan);
            if (nextStep) {
              console.log(chalk.cyan(`📍 下一步: ${nextStep.description}`));
              updateStepStatus(currentPlan, nextStep.id, 'in_progress');
              savePlanToSession(session, currentPlan);
              addUserMessage(session,
                `上一步已跳过。继续执行下一步: ${nextStep.description}`
              );
            } else {
              console.log(chalk.green('\n✓ 所有步骤已处理完成'));
              await recordTaskEnd(ctx, 'completed', { summary: '任务完成（有步骤被跳过）' });
              return;
            }
          }
        } else {
          // 停止任务
          console.log(chalk.gray('\n正在保存进度并停止任务...'));
          if (sessionStorage && currentPlan) {
            await sessionStorage.saveSession(session);
          }
          await recordTaskEnd(ctx, 'cancelled', { error: '用户选择停止' });
          console.log(chalk.green('✓ 进度已保存，可使用 /resume 恢复'));
          return;
        }
      }
      
      // 如果有计划，在工具执行成功后推进步骤
      if (currentPlan && toolResult?.success) {
        let advanceResult: { advanced: boolean; nextStep?: { id: string; description: string } };
        
        // 使用 stepManager 推进步骤
        if (ctx.stepManager) {
          const result = ctx.stepManager.advanceStep();
          advanceResult = {
            advanced: result.success && !result.allCompleted,
            nextStep: result.nextStep,
          };
        } else {
          const result = advanceToNextStep(currentPlan, session);
          advanceResult = {
            advanced: result.advanced,
            nextStep: result.nextStep,
          };
        }
        
        if (advanceResult.advanced && advanceResult.nextStep) {
          // 显示进度
          console.log();
          if (ctx.executionState) {
            console.log(showTaskProgress(currentPlan, ctx.executionState));
            updateExecutionState(ctx.executionState, 'step_complete');
          } else if (ctx.stepManager) {
            console.log(ctx.stepManager.renderStepList());
          }
          
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
  await recordTaskEnd(ctx, 'max_rounds', { error: '达到最大轮数限制' });
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

/** 工具执行结果（扩展版） */
interface ToolCallResult {
  success: boolean;
  content?: string;
  error?: string;
  /** 失败的步骤（如果有计划且步骤失败） */
  failedStep?: {
    id: string;
    description: string;
    error: string;
  };
}

async function executeToolCall(ctx: ToolCallExecuteContext): Promise<ToolCallResult> {
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
        
        // 修复：用户取消时也返回 failedStep，让复杂任务可以重试/跳过
        if (currentPlan) {
          const currentStep = currentPlan.steps.find(s => s.status === 'in_progress');
          if (currentStep) {
            return {
              success: false,
              error: '用户取消了操作',
              failedStep: {
                id: currentStep.id,
                description: currentStep.description,
                error: '用户取消了工具执行',
              },
            };
          }
        }
        
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
      
      // ★ P0优化：返回失败步骤信息，由调用者处理
      // 不再在这里标记步骤状态，而是返回失败信息
      if (currentPlan) {
        const currentStep = currentPlan.steps.find(s => s.status === 'in_progress');
        if (currentStep) {
          // 返回失败步骤信息，让调用者决定如何处理
          return {
            success: false,
            error: errorMsg,
            failedStep: {
              id: currentStep.id,
              description: currentStep.description,
              error: errorMsg,
            },
          };
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