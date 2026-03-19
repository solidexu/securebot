/**
 * 反馈处理器
 * 
 * 收集用户反馈后立即分析并应用改进
 */

import type { Agent } from '../types.js';
import { getFeedbackCollector, getErrorPatternStore, getImprovementLogManager, getPromptOptimizer } from './index.js';
import type { UserFeedback, FeedbackType } from './types.js';

// ============ 反馈分析结果 ============

/**
 * 反馈分析结果
 */
export interface FeedbackAnalysis {
  /** 用户不满意的原因 */
  rootCause: string;
  /** Agent 应该如何改进 */
  suggestedFix: string;
  /** 应避免的行为模式 */
  avoidPattern: string;
  /** 改进优先级 */
  priority: 'high' | 'medium' | 'low';
  /** 具体的行动建议 */
  actionItems: string[];
}

// ============ 反馈处理器 ============

/**
 * 反馈处理器
 * 
 * 收集反馈后立即分析，负面反馈触发即时改进
 */
export class FeedbackProcessor {
  private llm: {
    chat: (params: { model: string; messages: Array<{ role: string; content: string }> }) => Promise<{ content: string }>;
  };
  private model: string;
  
  constructor(llm: FeedbackProcessor['llm'], model: string) {
    this.llm = llm;
    this.model = model;
  }
  
  /**
   * 处理用户反馈
   */
  async processFeedback(
    agent: Agent,
    feedback: Omit<UserFeedback, 'id' | 'createdAt' | 'processed'>
  ): Promise<{ feedbackId: string; analysis?: FeedbackAnalysis }> {
    // 1. 存储反馈
    const collector = getFeedbackCollector();
    const storedFeedback = await collector.add({
      ...feedback,
      id: `fb_${Date.now()}`,
      createdAt: new Date().toISOString(),
      processed: false,
    });
    
    // 2. 负面反馈立即分析
    let analysis: FeedbackAnalysis | undefined;
    if (feedback.rating !== undefined && feedback.rating < 3) {
      analysis = await this.analyzeWithLLM(agent, storedFeedback);
      await this.applyImprovement(agent, analysis);
    }
    
    // 3. 标记已处理
    await collector.markProcessed(storedFeedback.id, analysis ? '已分析并应用改进' : '已记录');
    
    return { feedbackId: storedFeedback.id, analysis };
  }
  
  /**
   * 使用 LLM 分析反馈
   */
  private async analyzeWithLLM(agent: Agent, feedback: UserFeedback): Promise<FeedbackAnalysis> {
    const prompt = `你是一个 AI Agent 改进顾问。分析以下用户反馈，提取改进建议。

## Agent 信息
- 名称：${agent.name}
- ID：${agent.id}

## 用户反馈
- 类型：${feedback.type}
- 评分：${feedback.rating ?? '未评分'}/5
- 内容：${feedback.content}

## 分析要求
请分析：
1. 用户不满意的根本原因是什么？
2. Agent 应该如何改进？
3. 有哪些行为应该避免？
4. 改进优先级是什么？

请以 JSON 格式输出分析结果：
{
  "rootCause": "用户不满意的原因",
  "suggestedFix": "Agent 应该如何改进",
  "avoidPattern": "应避免的行为模式",
  "priority": "high|medium|low",
  "actionItems": ["具体行动1", "具体行动2"]
}`;

    try {
      const response = await this.llm.chat({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
      });
      
      // 解析 JSON
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as FeedbackAnalysis;
      }
      
      // 解析失败，返回默认分析
      return this.getDefaultAnalysis(feedback);
    } catch (error) {
      console.error('LLM 分析反馈失败:', error);
      return this.getDefaultAnalysis(feedback);
    }
  }
  
  /**
   * 获取默认分析（当 LLM 不可用时）
   */
  private getDefaultAnalysis(feedback: UserFeedback): FeedbackAnalysis {
    return {
      rootCause: feedback.content.slice(0, 100),
      suggestedFix: '根据用户反馈调整行为',
      avoidPattern: '避免重复导致负面反馈的行为',
      priority: feedback.rating === 1 ? 'high' : 'medium',
      actionItems: ['收集更多反馈以改进'],
    };
  }
  
  /**
   * 应用改进
   */
  private async applyImprovement(agent: Agent, analysis: FeedbackAnalysis): Promise<void> {
    // 1. 记录错误模式
    const errorStore = getErrorPatternStore();
    if (analysis.avoidPattern) {
      await errorStore.recordError(agent.id, new Error(analysis.rootCause), {
        taskDescription: '用户反馈驱动的改进',
        approach: analysis.avoidPattern,
        toolsUsed: [],
      });
    }
    
    // 2. 更新 Prompt 优化器
    const promptOptimizer = getPromptOptimizer();
    if (analysis.avoidPattern) {
      await promptOptimizer.addAvoidRule(agent.id, analysis.avoidPattern, analysis.suggestedFix);
    }
    
    // 3. 记录改进日志
    const logManager = getImprovementLogManager();
    await logManager.log({
      id: `improve_${Date.now()}`,
      timestamp: new Date().toISOString(),
      trigger: 'user_feedback',
      type: 'behavior_change',
      before: analysis.avoidPattern,
      after: analysis.suggestedFix,
      reason: analysis.rootCause,
      effectiveness: null,
    });
  }
}

// ============ 单例管理 ============

let globalProcessor: FeedbackProcessor | null = null;

/**
 * 获取全局反馈处理器
 */
export function getFeedbackProcessor(): FeedbackProcessor | null {
  return globalProcessor;
}

/**
 * 初始化反馈处理器
 */
export function initFeedbackProcessor(
  llm: FeedbackProcessor['llm'],
  model: string
): FeedbackProcessor {
  globalProcessor = new FeedbackProcessor(llm, model);
  return globalProcessor;
}

/**
 * 重置反馈处理器
 */
export function resetFeedbackProcessor(): void {
  globalProcessor = null;
}