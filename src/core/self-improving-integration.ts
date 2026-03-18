/**
 * Self-Improving 集成模块
 * 
 * 将 self-improving 功能集成到任务执行流程
 */

import type { Agent, Session } from './types.js';
import { getSuccessPatternStore, getErrorPatternStore, getPromptOptimizer, getSelfReflectionEngine, getImprovementLogManager } from './self-improving/index.js';
import type { TaskType } from './self-improving/types.js';

// ============ 任务执行记录 ============

/**
 * 任务执行上下文
 */
export interface TaskExecutionContext {
  agent: Agent;
  session: Session;
  taskDescription: string;
  approach: string;
  toolsUsed: string[];
  steps: { id: string; description: string; success: boolean }[];
}

/**
 * 任务执行结果
 */
export interface TaskExecutionResult {
  success: boolean;
  summary?: string;
  error?: string;
  userRating?: number;
  userFeedback?: string;
}

/**
 * 记录任务执行结果
 * 
 * 自动记录成功模式或错误模式
 */
export async function recordTaskExecution(
  context: TaskExecutionContext,
  result: TaskExecutionResult
): Promise<void> {
  const { agent, taskDescription, approach, toolsUsed, steps } = context;
  
  if (result.success) {
    // 记录成功模式
    const successStore = getSuccessPatternStore();
    
    // 分类任务类型
    const taskType = classifyTaskType(taskDescription);
    
    await successStore.recordSuccess(agent.id, {
      id: `task_${Date.now()}`,
      agentId: agent.id,
      description: taskDescription,
      taskType,
      approach,
      toolsUsed,
      steps,
      success: true,
      resultSummary: result.summary,
      userRating: result.userRating,
      userFeedback: result.userFeedback,
      timestamp: new Date().toISOString(),
    }, {
      summary: result.summary || '任务成功完成',
      userFeedback: result.userFeedback,
      userRating: result.userRating,
    });
    
    // 记录改进日志
    const logManager = getImprovementLogManager();
    await logManager.logFromSuccess(agent.id, taskDescription, approach, '任务成功');
    
  } else {
    // 记录错误模式
    const errorStore = getErrorPatternStore();
    
    await errorStore.recordError(agent.id, new Error(result.error || '任务执行失败'), {
      taskDescription,
      approach,
      toolsUsed,
    });
    
    // 记录改进日志
    const logManager = getImprovementLogManager();
    await logManager.logFromFailure(agent.id, taskDescription, approach, result.error || '未知错误');
  }
}

/**
 * 分类任务类型
 */
function classifyTaskType(description: string): TaskType {
  const text = description.toLowerCase();
  
  if (text.includes('写代码') || text.includes('实现') || text.includes('开发') || text.includes('编程')) {
    return 'coding';
  }
  if (text.includes('分析') || text.includes('研究') || text.includes('调查')) {
    return 'analysis';
  }
  if (text.includes('写') || text.includes('撰写') || text.includes('生成文档')) {
    return 'writing';
  }
  if (text.includes('计划') || text.includes('规划') || text.includes('设计')) {
    return 'planning';
  }
  if (text.includes('执行') || text.includes('运行') || text.includes('部署')) {
    return 'execution';
  }
  if (text.includes('调试') || text.includes('修复') || text.includes('bug')) {
    return 'debugging';
  }
  
  return 'general';
}

// ============ Prompt 增强 ============

/**
 * 构建增强的 System Prompt
 * 
 * 自动注入学习到的经验
 */
export async function buildEnhancedSystemPrompt(
  agent: Agent,
  basePrompt: string
): Promise<string> {
  const optimizer = getPromptOptimizer();
  
  // 使用默认的个性化设置
  // TODO: 未来可以从 agent 配置读取
  const personalization = undefined;
  
  return optimizer.optimizePrompt(agent.id, basePrompt, personalization);
}

// ============ 自动反思 ============

/**
 * 检查并执行自动反思
 */
export async function checkAndAutoReflect(
  agentId: string,
  intervalMs: number = 24 * 60 * 60 * 1000 // 默认 24 小时
): Promise<boolean> {
  const engine = getSelfReflectionEngine();
  
  const shouldReflect = await engine.shouldReflect(agentId, intervalMs);
  
  if (shouldReflect) {
    await engine.reflect(agentId);
    return true;
  }
  
  return false;
}

/**
 * 会话结束时触发反思（简化版）
 */
export async function onSessionEnd(
  agentId: string,
  taskCount: number
): Promise<void> {
  // 如果任务数超过阈值，触发反思
  if (taskCount >= 5) {
    const engine = getSelfReflectionEngine();
    await engine.reflect(agentId, 60 * 60 * 1000); // 反思最近 1 小时
  }
}

// ============ 相似经验检索 ============

/**
 * 获取相似任务的成功经验
 */
export async function getSimilarSuccessExperience(
  agentId: string,
  taskDescription: string
): Promise<string | null> {
  const store = getSuccessPatternStore();
  const patterns = await store.findSimilarSuccess(agentId, taskDescription, 3);
  
  if (patterns.length === 0) {
    return null;
  }
  
  const lines: string[] = ['参考之前成功的经验：'];
  
  for (const p of patterns) {
    lines.push(`- [${p.taskType}] ${p.approach.slice(0, 100)}`);
    if (p.toolsUsed.length > 0) {
      lines.push(`  工具: ${p.toolsUsed.slice(0, 3).join(', ')}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * 检查方法是否应该避免
 */
export async function checkMethodSafety(
  agentId: string,
  approach: string
): Promise<{ safe: boolean; reason?: string; alternative?: string }> {
  const store = getErrorPatternStore();
  const result = await store.shouldAvoid(agentId, approach);
  
  return {
    safe: !result.shouldAvoid,
    reason: result.reason,
    alternative: result.alternative,
  };
}