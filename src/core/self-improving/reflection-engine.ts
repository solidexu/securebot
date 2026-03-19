/**
 * 自我反思引擎
 * 
 * 分析 Agent 的执行记录，提取经验教训
 */

import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import type { 
  ReflectionResult,
  ReflectionEngineConfig,
  SuggestedAction,
  SuccessPattern,
  ErrorPattern,
  UserFeedback,
} from './types.js';
import { getSuccessPatternStore } from './success-pattern-store.js';
import { getErrorPatternStore } from './error-pattern-store.js';
import { getFeedbackCollector } from './feedback-collector.js';
import { getImprovementLogManager } from './improvement-log.js';
import { writeJsonAtomic } from './atomic-write.js';

// ============ 默认配置 ============

const DEFAULT_CONFIG: ReflectionEngineConfig = {
  model: 'default',
  defaultTimeWindow: 24 * 60 * 60 * 1000, // 24 小时
  maxTasksToAnalyze: 50,
  storageDir: join(homedir(), '.securebot', 'self-improving', 'reflections'),
};

// ============ 自我反思引擎 ============

/**
 * 自我反思引擎
 */
export class SelfReflectionEngine {
  private config: ReflectionEngineConfig;
  private initialized: boolean = false;
  private llm: {
    chat: (params: { model: string; messages: Array<{ role: string; content: string }> }) => Promise<{ content: string }>;
  } | null = null;
  
  constructor(config: Partial<ReflectionEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * 设置 LLM 客户端
   */
  setLLM(llm: {
    chat: (params: { model: string; messages: Array<{ role: string; content: string }> }) => Promise<{ content: string }>;
  }): void {
    this.llm = llm;
  }
  
  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    if (!existsSync(this.config.storageDir)) {
      mkdirSync(this.config.storageDir, { recursive: true });
    }
    
    this.initialized = true;
  }
  
  /**
   * 定期反思（分析最近的任务）
   */
  async reflect(
    agentId: string,
    timeWindow?: number
  ): Promise<ReflectionResult> {
    await this.initialize();
    
    const window = timeWindow ?? this.config.defaultTimeWindow;
    const endTime = Date.now();
    const startTime = endTime - window;
    
    // 收集数据
    const [successPatterns, errorPatterns, feedbacks] = await Promise.all([
      this.collectSuccessPatterns(agentId, startTime, endTime),
      this.collectErrorPatterns(agentId, startTime, endTime),
      this.collectFeedbacks(agentId, startTime, endTime),
    ]);
    
    // 执行反思分析
    const result = await this.performReflection(
      agentId,
      successPatterns,
      errorPatterns,
      feedbacks,
      startTime,
      endTime
    );
    
    // 持久化
    await this.persistReflection(result);
    
    // 记录改进日志
    await this.recordReflectionToLog(agentId, result);
    
    return result;
  }
  
  /**
   * 任务后反思
   */
  async reflectOnTask(
    agentId: string,
    task: {
      description: string;
      success: boolean;
      approach: string;
      toolsUsed: string[];
      error?: string;
      userFeedback?: string;
      userRating?: number;
    }
  ): Promise<ReflectionResult> {
    await this.initialize();
    
    const now = Date.now();
    const startTime = now - 60 * 60 * 1000; // 最近 1 小时
    
    // 构建简单的反思
    const whatWentWell: string[] = [];
    const whatCouldBeImproved: string[] = [];
    const lessonsLearned: string[] = [];
    
    if (task.success) {
      whatWentWell.push(`成功完成任务: ${task.description.slice(0, 50)}`);
      if (task.approach) {
        whatWentWell.push(`使用的方法有效: ${task.approach.slice(0, 50)}`);
      }
      if (task.userRating && task.userRating >= 4) {
        whatWentWell.push(`用户满意度高: ${task.userRating}/5`);
      }
    } else {
      whatCouldBeImproved.push(`任务执行失败: ${task.description.slice(0, 50)}`);
      if (task.error) {
        lessonsLearned.push(`错误原因: ${task.error.slice(0, 100)}`);
        whatCouldBeImproved.push(`需要解决: ${task.error.slice(0, 50)}`);
      }
    }
    
    if (task.userFeedback) {
      if (task.userFeedback.includes('好') || task.userFeedback.includes('满意')) {
        whatWentWell.push(`用户反馈积极: ${task.userFeedback.slice(0, 50)}`);
      } else if (task.userFeedback.includes('慢') || task.userFeedback.includes('问题')) {
        whatCouldBeImproved.push(`用户指出问题: ${task.userFeedback.slice(0, 50)}`);
      }
    }
    
    // 生成建议
    const suggestedActions = this.generateSuggestionsFromTask(task);
    
    // 自我评估
    const selfAssessment = {
      overallPerformance: task.success ? (task.userRating ? task.userRating * 20 : 70) : 40,
      confidenceLevel: task.success ? 80 : 50,
      areasToFocus: task.success ? [] : ['错误处理', '任务规划'],
    };
    
    const result: ReflectionResult = {
      id: uuidv4(),
      agentId,
      reflectedAt: new Date().toISOString(),
      timeRange: {
        start: new Date(startTime).toISOString(),
        end: new Date(now).toISOString(),
      },
      tasksAnalyzed: 1,
      whatWentWell,
      whatCouldBeImproved,
      lessonsLearned,
      suggestedActions,
      selfAssessment,
    };
    
    await this.persistReflection(result);
    
    return result;
  }
  
  /**
   * 执行反思分析（使用 LLM 深度分析）
   */
  private async performReflection(
    agentId: string,
    successPatterns: SuccessPattern[],
    errorPatterns: ErrorPattern[],
    feedbacks: UserFeedback[],
    startTime: number,
    endTime: number
  ): Promise<ReflectionResult> {
    // 尝试使用 LLM 进行深度分析
    if (this.llm) {
      try {
        const llmResult = await this.reflectWithLLM(agentId, successPatterns, errorPatterns, feedbacks);
        if (llmResult) {
          const result: ReflectionResult = {
            id: uuidv4(),
            agentId,
            reflectedAt: new Date().toISOString(),
            timeRange: {
              start: new Date(startTime).toISOString(),
              end: new Date(endTime).toISOString(),
            },
            tasksAnalyzed: successPatterns.length + errorPatterns.length,
            whatWentWell: llmResult.whatWentWell,
            whatCouldBeImproved: llmResult.whatCouldBeImproved,
            lessonsLearned: llmResult.lessonsLearned,
            suggestedActions: llmResult.suggestedActions,
            selfAssessment: {
              overallPerformance: llmResult.overallPerformance,
              confidenceLevel: llmResult.confidenceLevel,
              areasToFocus: llmResult.areasToFocus,
            },
          };
          
          await this.persistReflection(result);
          return result;
        }
      } catch (error) {
        console.error('LLM 反思失败，回退到规则分析:', error);
      }
    }
    
    // 回退到规则分析
    return this.performRuleBasedReflection(agentId, successPatterns, errorPatterns, feedbacks, startTime, endTime);
  }
  
  /**
   * 使用 LLM 进行深度反思
   */
  private async reflectWithLLM(
    agentId: string,
    successPatterns: SuccessPattern[],
    errorPatterns: ErrorPattern[],
    feedbacks: UserFeedback[]
  ): Promise<{
    whatWentWell: string[];
    whatCouldBeImproved: string[];
    lessonsLearned: string[];
    suggestedActions: SuggestedAction[];
    overallPerformance: number;
    confidenceLevel: number;
    areasToFocus: string[];
  } | null> {
    // 构建提示词
    const prompt = `你是一个 AI Agent 自我反思专家。分析以下 Agent 的工作表现并给出改进建议。

## Agent 信息
- ID: ${agentId}

## 近期成功案例 (${successPatterns.length} 个)
${successPatterns.length > 0 
  ? successPatterns.slice(0, 5).map(s => `- [${s.taskType}] ${s.description.slice(0, 80)}: 采用 ${s.approach.slice(0, 50)}`).join('\n')
  : '暂无成功案例'}

## 近期失败案例 (${errorPatterns.length} 个)
${errorPatterns.length > 0 
  ? errorPatterns.slice(0, 5).map(e => `- [${e.errorType}] ${e.taskContext?.slice(0, 50) || '未知任务'}: ${e.errorMessage?.slice(0, 50) || '未知错误'}`).join('\n')
  : '暂无失败案例'}

## 用户反馈 (${feedbacks.length} 条)
${feedbacks.length > 0 
  ? feedbacks.slice(0, 5).map(f => `- [${f.rating || '未评分'}/5] ${f.content.slice(0, 80)}`).join('\n')
  : '暂无用户反馈'}

## 分析要求
请深入分析并输出 JSON 格式：
{
  "whatWentWell": ["优势1", "优势2"],
  "whatCouldBeImproved": ["改进点1", "改进点2"],
  "lessonsLearned": ["教训1", "教训2"],
  "suggestedActions": [
    { "priority": "high|medium|low", "action": "具体行动", "expectedImpact": "预期效果" }
  ],
  "overallPerformance": 0-100,
  "confidenceLevel": 0-100,
  "areasToFocus": ["需要关注的领域1", "领域2"]
}`;

    try {
      const response = await this.llm!.chat({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
      });
      
      // 解析 JSON
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          whatWentWell: parsed.whatWentWell || [],
          whatCouldBeImproved: parsed.whatCouldBeImproved || [],
          lessonsLearned: parsed.lessonsLearned || [],
          suggestedActions: (parsed.suggestedActions || []).map((a: any) => ({
            priority: a.priority || 'medium',
            action: a.action || '',
            expectedImpact: a.expectedImpact,
          })),
          overallPerformance: parsed.overallPerformance || 50,
          confidenceLevel: parsed.confidenceLevel || 50,
          areasToFocus: parsed.areasToFocus || [],
        };
      }
    } catch (error) {
      console.error('解析 LLM 反思结果失败:', error);
    }
    
    return null;
  }
  
  /**
   * 基于规则的反思分析（回退方案）
   */
  private async performRuleBasedReflection(
    agentId: string,
    successPatterns: SuccessPattern[],
    errorPatterns: ErrorPattern[],
    feedbacks: UserFeedback[],
    startTime: number,
    endTime: number
  ): Promise<ReflectionResult> {
    const whatWentWell: string[] = [];
    const whatCouldBeImproved: string[] = [];
    const lessonsLearned: string[] = [];
    
    // 分析成功模式
    if (successPatterns.length > 0) {
      const avgEffectiveness = successPatterns.reduce((sum, p) => sum + p.effectiveness, 0) / successPatterns.length;
      whatWentWell.push(`成功完成 ${successPatterns.length} 个任务，平均效果 ${(avgEffectiveness * 100).toFixed(0)}%`);
      
      // 找出最常用的工具
      const toolCounts = new Map<string, number>();
      for (const p of successPatterns) {
        for (const tool of p.toolsUsed) {
          toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
        }
      }
      const topTools = Array.from(toolCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      if (topTools.length > 0) {
        whatWentWell.push(`熟练使用工具: ${topTools.map(t => t[0]).join(', ')}`);
      }
      
      // 找出擅长的任务类型
      const typeCounts = new Map<string, number>();
      for (const p of successPatterns) {
        typeCounts.set(p.taskType, (typeCounts.get(p.taskType) ?? 0) + 1);
      }
      const topTypes = Array.from(typeCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2);
      if (topTypes.length > 0) {
        whatWentWell.push(`擅长任务类型: ${topTypes.map(t => t[0]).join(', ')}`);
      }
    }
    
    // 分析错误模式
    if (errorPatterns.length > 0) {
      const unresolvedCount = errorPatterns.filter(p => !p.resolved).length;
      whatCouldBeImproved.push(`有 ${errorPatterns.length} 个错误模式，${unresolvedCount} 个未解决`);
      
      // 统计错误类型
      const errorTypeCounts = new Map<string, number>();
      for (const p of errorPatterns) {
        errorTypeCounts.set(p.errorType, (errorTypeCounts.get(p.errorType) ?? 0) + p.occurrenceCount);
      }
      const topErrors = Array.from(errorTypeCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      for (const [type, count] of topErrors) {
        whatCouldBeImproved.push(`错误类型 "${type}" 发生了 ${count} 次`);
        lessonsLearned.push(`需要改进 ${type} 类型的处理`);
      }
    }
    
    // 分析用户反馈
    if (feedbacks.length > 0) {
      const ratings = feedbacks.filter(f => f.rating !== undefined);
      if (ratings.length > 0) {
        const avgRating = ratings.reduce((sum, f) => sum + (f.rating ?? 0), 0) / ratings.length;
        if (avgRating >= 4) {
          whatWentWell.push(`用户平均评分: ${avgRating.toFixed(1)}/5`);
        } else if (avgRating < 3) {
          whatCouldBeImproved.push(`用户平均评分较低: ${avgRating.toFixed(1)}/5`);
        }
      }
      
      // 分析负面反馈
      const complaints = feedbacks.filter(f => f.type === 'complaint' || (f.rating !== undefined && f.rating < 3));
      if (complaints.length > 0) {
        whatCouldBeImproved.push(`收到 ${complaints.length} 条负面反馈`);
        for (const c of complaints.slice(0, 3)) {
          lessonsLearned.push(`用户反馈: ${c.content.slice(0, 50)}`);
        }
      }
    }
    
    // 确保至少有一些内容
    if (whatWentWell.length === 0) {
      whatWentWell.push('暂无明显优点，需要积累更多经验');
    }
    if (whatCouldBeImproved.length === 0) {
      whatCouldBeImproved.push('暂无明显问题，继续保持');
    }
    if (lessonsLearned.length === 0) {
      lessonsLearned.push('需要更多实践来积累经验');
    }
    
    // 生成建议
    const suggestedActions = this.generateSuggestions(successPatterns, errorPatterns, feedbacks);
    
    // 计算自我评估
    const selfAssessment = this.calculateSelfAssessment(successPatterns, errorPatterns, feedbacks);
    
    return {
      id: uuidv4(),
      agentId,
      reflectedAt: new Date().toISOString(),
      timeRange: {
        start: new Date(startTime).toISOString(),
        end: new Date(endTime).toISOString(),
      },
      tasksAnalyzed: successPatterns.length + errorPatterns.length,
      whatWentWell,
      whatCouldBeImproved,
      lessonsLearned,
      suggestedActions,
      selfAssessment,
    };
  }
  
  /**
   * 生成改进建议
   */
  private generateSuggestions(
    successPatterns: SuccessPattern[],
    errorPatterns: ErrorPattern[],
    feedbacks: UserFeedback[]
  ): SuggestedAction[] {
    const actions: SuggestedAction[] = [];
    
    // 基于错误模式生成建议
    for (const error of errorPatterns.filter(p => !p.resolved).slice(0, 3)) {
      actions.push({
        id: uuidv4(),
        priority: error.occurrenceCount > 3 ? 'high' : 'medium',
        type: 'behavior_change',
        description: `解决 ${error.errorType} 类型错误: ${error.errorMessage.slice(0, 50)}`,
        expectedOutcome: error.solution ?? '减少此类错误的发生',
        difficulty: 'medium',
        relatedErrorPattern: error.id,
      });
    }
    
    // 基于反馈生成建议
    const lowRatings = feedbacks.filter(f => f.rating !== undefined && f.rating < 3);
    if (lowRatings.length > feedbacks.length * 0.2) {
      actions.push({
        id: uuidv4(),
        priority: 'high',
        type: 'prompt_optimization',
        description: '提高回答质量，关注用户不满意的地方',
        expectedOutcome: '提升用户满意度',
        difficulty: 'medium',
      });
    }
    
    // 基于成功模式生成建议
    const highEffectivenessPatterns = successPatterns.filter(p => p.effectiveness > 0.8);
    if (highEffectivenessPatterns.length >= 3) {
      actions.push({
        id: uuidv4(),
        priority: 'low',
        type: 'skill_refinement',
        description: '将高频成功方法提炼为技能',
        expectedOutcome: '提高执行效率',
        difficulty: 'hard',
      });
    }
    
    // 限制数量
    return actions.slice(0, 5);
  }
  
  /**
   * 从单个任务生成建议
   */
  private generateSuggestionsFromTask(task: {
    description: string;
    success: boolean;
    approach: string;
    toolsUsed: string[];
    error?: string;
    userFeedback?: string;
    userRating?: number;
  }): SuggestedAction[] {
    const actions: SuggestedAction[] = [];
    
    if (!task.success && task.error) {
      actions.push({
        id: uuidv4(),
        priority: 'high',
        type: 'behavior_change',
        description: `修复错误: ${task.error.slice(0, 50)}`,
        expectedOutcome: '避免类似错误',
        difficulty: 'medium',
      });
    }
    
    if (task.userRating !== undefined && task.userRating < 3) {
      actions.push({
        id: uuidv4(),
        priority: 'medium',
        type: 'behavior_change',
        description: '关注用户反馈，改进执行方式',
        expectedOutcome: '提高用户满意度',
        difficulty: 'easy',
      });
    }
    
    return actions;
  }
  
  /**
   * 计算自我评估
   */
  private calculateSelfAssessment(
    successPatterns: SuccessPattern[],
    errorPatterns: ErrorPattern[],
    feedbacks: UserFeedback[]
  ): ReflectionResult['selfAssessment'] {
    // 计算整体表现
    let performance = 50; // 基础分
    
    if (successPatterns.length > 0) {
      const avgEffectiveness = successPatterns.reduce((sum, p) => sum + p.effectiveness, 0) / successPatterns.length;
      performance += avgEffectiveness * 25;
    }
    
    if (errorPatterns.length > 0) {
      const unresolvedRatio = errorPatterns.filter(p => !p.resolved).length / errorPatterns.length;
      performance -= unresolvedRatio * 20;
    }
    
    const ratings = feedbacks.filter(f => f.rating !== undefined);
    if (ratings.length > 0) {
      const avgRating = ratings.reduce((sum, f) => sum + (f.rating ?? 0), 0) / ratings.length;
      performance += (avgRating - 3) * 10;
    }
    
    performance = Math.max(0, Math.min(100, performance));
    
    // 计算信心水平
    let confidence = 50;
    if (successPatterns.length > 5) confidence += 20;
    if (errorPatterns.filter(p => p.resolved).length > 3) confidence += 15;
    confidence = Math.max(0, Math.min(100, confidence));
    
    // 确定关注领域
    const areasToFocus: string[] = [];
    
    const errorTypes = new Set(errorPatterns.map(p => p.errorType));
    if (errorTypes.has('tool_execution')) areasToFocus.push('工具使用');
    if (errorTypes.has('planning')) areasToFocus.push('任务规划');
    if (errorTypes.has('understanding')) areasToFocus.push('需求理解');
    
    if (feedbacks.some(f => f.type === 'complaint')) {
      areasToFocus.push('用户沟通');
    }
    
    return {
      overallPerformance: Math.round(performance),
      confidenceLevel: Math.round(confidence),
      areasToFocus: areasToFocus.length > 0 ? areasToFocus : ['继续积累经验'],
    };
  }
  
  /**
   * 收集成功模式
   */
  private async collectSuccessPatterns(
    agentId: string,
    startTime: number,
    endTime: number
  ): Promise<SuccessPattern[]> {
    const store = getSuccessPatternStore();
    return store.getByTimeRange(agentId, startTime, endTime);
  }
  
  /**
   * 收集错误模式
   */
  private async collectErrorPatterns(
    agentId: string,
    startTime: number,
    endTime: number
  ): Promise<ErrorPattern[]> {
    const store = getErrorPatternStore();
    return store.getByTimeRange(agentId, startTime, endTime);
  }
  
  /**
   * 收集用户反馈
   */
  private async collectFeedbacks(
    agentId: string,
    startTime: number,
    endTime: number
  ): Promise<UserFeedback[]> {
    const collector = getFeedbackCollector();
    const all = await collector.getFeedbackForAgent(agentId);
    return all.filter(f => {
      const time = new Date(f.createdAt).getTime();
      return time >= startTime && time <= endTime;
    });
  }
  
  /**
   * 持久化反思结果
   */
  private async persistReflection(result: ReflectionResult): Promise<void> {
    const date = result.reflectedAt.split('T')[0];
    const filePath = join(this.config.storageDir, `${result.agentId}_${date}.json`);
    writeJsonAtomic(filePath, result);
  }
  
  /**
   * 记录反思到改进日志
   */
  private async recordReflectionToLog(
    agentId: string,
    result: ReflectionResult
  ): Promise<void> {
    const logManager = getImprovementLogManager();
    
    await logManager.log({
      agentId,
      trigger: 'reflection',
      type: 'knowledge_addition',
      before: '反思前状态',
      after: `发现 ${result.whatCouldBeImproved.length} 个改进点`,
      reason: `定期反思: 分析了 ${result.tasksAnalyzed} 个任务`,
    });
  }
  
  /**
   * 获取最近的反思结果
   */
  async getRecentReflections(agentId: string, limit: number = 5): Promise<ReflectionResult[]> {
    await this.initialize();
    
    const results: ReflectionResult[] = [];
    const files = readdirSync(this.config.storageDir)
      .filter(f => f.startsWith(agentId) && f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);
    
    for (const file of files) {
      try {
        const content = readFileSync(join(this.config.storageDir, file), 'utf-8');
        results.push(JSON.parse(content) as ReflectionResult);
      } catch {
        // 忽略
      }
    }
    
    return results;
  }
  
  /**
   * 获取上次反思时间
   */
  async getLastReflectionTime(agentId: string): Promise<Date | null> {
    const recent = await this.getRecentReflections(agentId, 1);
    return recent.length > 0 ? new Date(recent[0]!.reflectedAt) : null;
  }
  
  /**
   * 检查是否需要反思
   */
  async shouldReflect(agentId: string, interval: number): Promise<boolean> {
    const lastTime = await this.getLastReflectionTime(agentId);
    if (!lastTime) return true;
    
    return Date.now() - lastTime.getTime() > interval;
  }
}

// ============ 全局实例 ============

let globalEngine: SelfReflectionEngine | null = null;

/**
 * 获取全局反思引擎
 */
export function getSelfReflectionEngine(config?: Partial<ReflectionEngineConfig>): SelfReflectionEngine {
  if (!globalEngine) {
    globalEngine = new SelfReflectionEngine(config);
  }
  return globalEngine;
}

/**
 * 重置全局实例
 */
export function resetSelfReflectionEngine(): void {
  globalEngine = null;
}