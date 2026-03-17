/**
 * 智能任务管理器
 * 
 * 自动判断任务复杂度，简单任务直接执行，复杂任务先规划再执行
 * 支持：多轮对话上下文感知、任务依赖分析、语义相似度匹配、用户行为学习
 */

import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ============ 类型定义 ============

export interface TaskStep {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: string;
  /** 依赖的步骤ID */
  dependencies?: string[];
  /** 估算时间（分钟） */
  estimatedMinutes?: number;
  /** 优先级 */
  priority?: 'low' | 'medium' | 'high';
}

export interface TaskPlan {
  title: string;
  steps: TaskStep[];
  createdAt: Date;
  updatedAt: Date;
  /** 任务类型 */
  taskType?: TaskType;
  /** 置信度 */
  confidence?: number;
}

export type TaskComplexity = 'simple' | 'complex' | 'moderate';

export type TaskType = 
  | 'query'        // 查询类
  | 'analysis'     // 分析类
  | 'creation'     // 创建类
  | 'modification' // 修改类
  | 'debugging'    // 调试类
  | 'deployment'   // 部署类
  | 'learning'     // 学习类
  | 'mixed';       // 混合类

/**
 * 对话上下文
 */
export interface ConversationContext {
  /** 最近的消息 */
  recentMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  /** 当前话题 */
  currentTopic?: string;
  /** 提到的实体 */
  mentionedEntities: Set<string>;
  /** 当前任务 */
  currentTask?: TaskPlan;
  /** 任务历史 */
  taskHistory: TaskPlan[];
}

/**
 * 用户行为档案
 */
export interface UserBehaviorProfile {
  /** 用户ID */
  userId: string;
  /** 偏好任务类型 */
  preferredTaskTypes: Map<TaskType, number>;
  /** 平均任务复杂度 */
  averageComplexity: number;
  /** 常用关键词 */
  frequentKeywords: Map<string, number>;
  /** 任务完成率 */
  taskCompletionRate: number;
  /** 学习到的模式 */
  learnedPatterns: LearnedPattern[];
  /** 更新时间 */
  updatedAt: number;
}

/**
 * 学习到的模式
 */
export interface LearnedPattern {
  /** 模式ID */
  id: string;
  /** 触发条件 */
  trigger: {
    keywords: string[];
    taskType?: TaskType;
  };
  /** 预测结果 */
  prediction: {
    complexity: TaskComplexity;
    estimatedSteps: number;
  };
  /** 置信度 */
  confidence: number;
  /** 出现次数 */
  occurrences: number;
}

/**
 * 任务依赖图节点
 */
export interface DependencyNode {
  stepId: string;
  description: string;
  dependencies: string[];
  dependents: string[];
  level: number;
}

/**
 * 复杂度评估结果
 */
export interface ComplexityAssessment {
  complexity: TaskComplexity;
  taskType: TaskType;
  confidence: number;
  reasons: string[];
  suggestedSteps?: string[];
  dependencies?: Map<string, string[]>;
}

// ============ 复杂度判断规则 ============

/** 简单任务关键词 */
const SIMPLE_TASK_KEYWORDS = [
  // 查询类
  '查看', '读取', '显示', '列出', '查找', '搜索', '获取',
  '看一下', '帮我看看', '是什么', '有多少',
  // 单文件操作
  '读取文件', '查看文件', '文件内容',
  // 简单问答
  '是什么', '怎么', '如何', '为什么', '解释', '说明',
  // 状态查询
  '状态', '信息', '详情', '概览',
  // 记忆操作
  '记住', '记得', '记录', '记住我', '记得我', '我的',
];

/** 复杂任务关键词 */
const COMPLEX_TASK_KEYWORDS = [
  // 开发类
  '开发', '实现', '创建', '构建', '编写', '设计', '写一个', '写个',
  '添加', '修改', '重构', '优化', '完善', '搭建', '封装',
  '帮我写', '帮我做', '帮我创建', '帮我实现', '帮我开发',
  
  // 多步骤
  '然后', '之后', '接着', '同时', '并且', '再', '以及',
  '首先', '其次', '最后', '第一步', '第二步',
  
  // 完整流程
  '项目', '应用', '系统', '模块', '功能', '服务', '组件',
  '测试', '部署', '配置环境', '初始化', '集成',
  
  // 算法相关
  '算法', '实现算法', '编写算法', '优化算法',
  '梯度下降', '神经网络', '机器学习', '深度学习',
  '排序算法', '搜索算法', '数据结构', '回归', '分类',
  '聚类', '推荐系统', '自然语言处理', 'NLP', 'CV', '计算机视觉',
  
  // 环境管理
  '环境管理', '虚拟环境', 'uv', 'pip', 'conda', 'venv',
  'requirements', 'package', '依赖管理',
  
  // 数据处理
  '数据分析', '数据处理', '数据清洗', '数据可视化',
  '爬虫', '抓取', 'etl', '导入导出',
  
  // 接口/API
  'api', '接口', 'restful', 'graphql', '微服务',
  '后端', '前端', '全栈', '客户端', '服务端',
  
  // 文档/报告
  '生成报告', '写文档', '生成文档', '自动生成',
  '批量处理', '批量生成',
  
  // 自动化
  '自动化', '脚本', '定时任务', '工作流', 'pipeline',
  'ci/cd', '持续集成', '自动化测试',
  
  // 迁移/转换
  '迁移', '转换', '导入', '导出', '同步',
  '重构代码', '升级', '兼容',
];

/** 任务类型关键词映射 */
const TASK_TYPE_KEYWORDS: Record<TaskType, string[]> = {
  query: ['查询', '查找', '搜索', '获取', '列出', '显示', '是什么', '有多少'],
  analysis: ['分析', '评估', '审查', '检查', '诊断', '比较', '对比'],
  creation: ['创建', '新建', '开发', '实现', '编写', '设计', '构建'],
  modification: ['修改', '更新', '编辑', '重构', '优化', '改进', '修复'],
  debugging: ['调试', '排查', '定位', '修复bug', '解决', '排错'],
  deployment: ['部署', '发布', '上线', '配置', '安装', '设置'],
  learning: ['学习', '教程', '指南', '文档', '说明', '了解'],
  mixed: [],
};

/** 任务依赖指示词 */
const DEPENDENCY_INDICATORS = [
  { pattern: /之后.*?(再做|执行|处理)/, type: 'sequential' },
  { pattern: /先.*?然后/, type: 'sequential' },
  { pattern: /同时.*?/, type: 'parallel' },
  { pattern: /依赖.*?/, type: 'dependency' },
  { pattern: /基于.*?/, type: 'dependency' },
  { pattern: /根据.*?/, type: 'dependency' },
];

// ============ 用户行为学习器 ============

class BehaviorLearner {
  private profile: UserBehaviorProfile;
  private dataDir: string;

  constructor(userId: string = 'default') {
    this.dataDir = join(homedir(), '.securebot', 'behavior');
    this.profile = this.loadProfile(userId);
  }

  private loadProfile(userId: string): UserBehaviorProfile {
    const filePath = join(this.dataDir, `${userId}.json`);
    if (existsSync(filePath)) {
      try {
        const data = JSON.parse(readFileSync(filePath, 'utf-8'));
        return {
          ...data,
          preferredTaskTypes: new Map(Object.entries(data.preferredTaskTypes || {})),
          frequentKeywords: new Map(Object.entries(data.frequentKeywords || {})),
        };
      } catch {
        // 返回默认
      }
    }
    return {
      userId,
      preferredTaskTypes: new Map(),
      averageComplexity: 0.5,
      frequentKeywords: new Map(),
      taskCompletionRate: 1,
      learnedPatterns: [],
      updatedAt: Date.now(),
    };
  }

  private saveProfile(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
    const filePath = join(this.dataDir, `${this.profile.userId}.json`);
    const data = {
      ...this.profile,
      preferredTaskTypes: Object.fromEntries(this.profile.preferredTaskTypes),
      frequentKeywords: Object.fromEntries(this.profile.frequentKeywords),
    };
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * 记录任务类型偏好
   */
  recordTaskType(type: TaskType): void {
    const current = this.profile.preferredTaskTypes.get(type) ?? 0;
    this.profile.preferredTaskTypes.set(type, current + 1);
    this.profile.updatedAt = Date.now();
    this.saveProfile();
  }

  /**
   * 记录关键词使用
   */
  recordKeywords(keywords: string[]): void {
    for (const kw of keywords) {
      const current = this.profile.frequentKeywords.get(kw) ?? 0;
      this.profile.frequentKeywords.set(kw, current + 1);
    }
    this.profile.updatedAt = Date.now();
    this.saveProfile();
  }

  /**
   * 学习模式
   */
  learnPattern(trigger: LearnedPattern['trigger'], prediction: LearnedPattern['prediction']): void {
    // 查找现有模式
    const existing = this.profile.learnedPatterns.find(
      p => JSON.stringify(p.trigger) === JSON.stringify(trigger)
    );

    if (existing) {
      existing.occurrences++;
      // 更新预测（加权平均）
      existing.confidence = Math.min(0.95, existing.confidence + 0.05);
    } else {
      this.profile.learnedPatterns.push({
        id: `pattern-${Date.now()}`,
        trigger,
        prediction,
        confidence: 0.5,
        occurrences: 1,
      });
    }

    // 保留最有效的 20 个模式
    this.profile.learnedPatterns.sort((a, b) => b.confidence - a.confidence);
    this.profile.learnedPatterns = this.profile.learnedPatterns.slice(0, 20);
    
    this.profile.updatedAt = Date.now();
    this.saveProfile();
  }

  /**
   * 匹配学习到的模式
   */
  matchPattern(keywords: string[], taskType?: TaskType): LearnedPattern | null {
    for (const pattern of this.profile.learnedPatterns) {
      const keywordMatch = pattern.trigger.keywords.some(kw => keywords.includes(kw));
      const typeMatch = !pattern.trigger.taskType || pattern.trigger.taskType === taskType;
      
      if (keywordMatch && typeMatch) {
        return pattern;
      }
    }
    return null;
  }

  getProfile(): UserBehaviorProfile {
    return this.profile;
  }
}

// ============ 全局学习器实例 ============

let globalLearner: BehaviorLearner | null = null;

function getLearner(): BehaviorLearner {
  if (!globalLearner) {
    globalLearner = new BehaviorLearner();
  }
  return globalLearner;
}

// ============ 复杂度评估增强 ============

/**
 * 判断任务复杂度（增强版）
 */
export function assessComplexity(userInput: string): TaskComplexity {
  const result = assessComplexityAdvanced(userInput);
  return result.complexity;
}

/**
 * 高级复杂度评估
 */
export function assessComplexityAdvanced(
  userInput: string,
  context?: ConversationContext
): ComplexityAssessment {
  const input = userInput.toLowerCase();
  const reasons: string[] = [];
  let complexity: TaskComplexity = 'simple';
  let confidence = 0.5;
  
  // 0. 特殊处理：记忆操作关键词直接返回简单
  // 这些操作不需要复杂规划
  // 注意：只包含明确的记忆操作词，"保存" 可能是文件操作，不包含
  const memoryKeywords = ['记住', '记得', '记录', '记住我', '记得我'];
  const isMemoryOperation = memoryKeywords.some(kw => input.includes(kw));
  
  if (isMemoryOperation) {
    return {
      complexity: 'simple',
      confidence: 0.9,
      reasons: ['记忆操作，直接执行'],
      taskType: 'query',
    };
  }
  
  // 1. 关键词分析
  const hasComplexKeywords = COMPLEX_TASK_KEYWORDS.some(kw => input.includes(kw));
  const hasSimpleKeywords = SIMPLE_TASK_KEYWORDS.some(kw => input.includes(kw));
  
  if (hasComplexKeywords) {
    complexity = 'complex';
    reasons.push('包含复杂任务关键词');
    confidence += 0.2;
  }
  
  if (hasSimpleKeywords && !hasComplexKeywords) {
    complexity = 'simple';
    reasons.push('包含简单任务关键词');
    confidence += 0.2;
  }
  
  // 2. 动作数量分析
  const actionMatches = input.match(/创建|实现|开发|编写|添加|修改|删除|配置|测试/g) ?? [];
  const actionCount = actionMatches.length;
  
  if (actionCount >= 3) {
    complexity = 'complex';
    reasons.push(`包含 ${actionCount} 个动作`);
    confidence += 0.15;
  } else if (actionCount === 2) {
    complexity = 'moderate';
    reasons.push('包含 2 个动作');
    confidence += 0.1;
  }
  
  // 3. 文件/范围分析
  const hasMultipleFiles = /多个|所有|全部|批量/.test(input) || 
    (input.match(/\//g) || []).length > 2;
  
  if (hasMultipleFiles) {
    complexity = 'complex';
    reasons.push('涉及多个文件/批量操作');
    confidence += 0.15;
  }
  
  // 4. 句子结构分析
  const sentences = input.split(/[。！？\n]/).filter(s => s.trim().length > 0);
  if (sentences.length >= 3) {
    complexity = 'complex';
    reasons.push(`包含 ${sentences.length} 个句子`);
    confidence += 0.1;
  } else if (sentences.length === 2) {
    if (complexity === 'simple') {
      complexity = 'moderate';
    }
    reasons.push('包含 2 个句子');
    confidence += 0.05;
  }
  
  // 5. 依赖关系分析
  const dependencies = detectDependencies(input);
  if (dependencies.size > 0) {
    complexity = 'complex';
    reasons.push('检测到任务依赖关系');
    confidence += 0.15;
  }
  
  // 6. 上下文分析
  if (context) {
    const contextInfluence = analyzeContext(context, input);
    if (contextInfluence.influenced) {
      if (contextInfluence.direction === 'more_complex') {
        complexity = complexity === 'simple' ? 'moderate' : 'complex';
        reasons.push('前序任务增加复杂度');
        confidence += 0.1;
      }
    }
  }
  
  // 7. 学习模式匹配
  const keywords = extractKeywords(input);
  const taskType = detectTaskType(input);
  const learner = getLearner();
  const matchedPattern = learner.matchPattern(keywords, taskType);
  
  if (matchedPattern && matchedPattern.confidence > 0.6) {
    complexity = matchedPattern.prediction.complexity;
    reasons.push(`匹配学习模式 (置信度: ${(matchedPattern.confidence * 100).toFixed(0)}%)`);
    confidence = Math.max(confidence, matchedPattern.confidence);
  }
  
  // 记录用户行为
  learner.recordKeywords(keywords);
  learner.recordTaskType(taskType);
  
  // 归一化置信度
  confidence = Math.min(1, confidence);
  
  return {
    complexity,
    taskType,
    confidence,
    reasons,
    dependencies: dependencies.size > 0 ? dependencies : undefined,
  };
}

/**
 * 检测任务类型
 */
export function detectTaskType(input: string): TaskType {
  const lowerInput = input.toLowerCase();
  const scores: Map<TaskType, number> = new Map();
  
  for (const [type, keywords] of Object.entries(TASK_TYPE_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lowerInput.includes(kw)) {
        score++;
      }
    }
    if (score > 0) {
      scores.set(type as TaskType, score);
    }
  }
  
  if (scores.size === 0) {
    return 'query';
  }
  
  // 返回得分最高的类型
  const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
  return sorted[0]![0];
}

/**
 * 提取关键词
 */
function extractKeywords(input: string): string[] {
  // 移除标点和常见虚词
  const stopWords = new Set(['的', '了', '是', '在', '我', '你', '他', '她', '它', '这', '那', '有', '和', '与', '或']);
  
  const words = input
    .toLowerCase()
    .replace(/[，。！？、；：""''（）【】]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w));
  
  return [...new Set(words)];
}

/**
 * 检测依赖关系
 */
function detectDependencies(input: string): Map<string, string[]> {
  const dependencies = new Map<string, string[]>();
  
  // 匹配依赖指示词
  for (const { pattern, type } of DEPENDENCY_INDICATORS) {
    const matches = input.matchAll(new RegExp(pattern.source, 'g'));
    for (const match of matches) {
      if (type === 'sequential' && match[0]) {
        // 提取前后任务
        const parts = match[0].split(/之后|然后|先/);
        if (parts.length >= 2) {
          const before = parts[0]?.trim();
          const after = parts[1]?.trim();
          if (before && after) {
            dependencies.set(after, [before]);
          }
        }
      }
    }
  }
  
  return dependencies;
}

/**
 * 分析上下文影响
 */
function analyzeContext(context: ConversationContext, currentInput: string): {
  influenced: boolean;
  direction: 'more_complex' | 'less_complex' | 'neutral';
} {
  // 检查最近是否有未完成的任务
  const currentTask = context.currentTask;
  if (currentTask && !isPlanCompleted(currentTask)) {
    // 当前有未完成任务，新请求可能是子任务
    return { influenced: true, direction: 'more_complex' };
  }
  
  // 检查话题连续性
  const recentTopics = context.recentMessages
    .slice(-3)
    .map(m => extractKeywords(m.content))
    .flat();
  
  const currentKeywords = extractKeywords(currentInput);
  const overlap = currentKeywords.filter(kw => recentTopics.includes(kw));
  
  if (overlap.length > 2) {
    // 话题相关，可能是延续任务
    return { influenced: true, direction: 'neutral' };
  }
  
  return { influenced: false, direction: 'neutral' };
}

/**
 * 构建依赖图
 */
export function buildDependencyGraph(steps: TaskStep[]): Map<string, DependencyNode> {
  const graph = new Map<string, DependencyNode>();
  
  // 创建节点
  for (const step of steps) {
    graph.set(step.id, {
      stepId: step.id,
      description: step.description,
      dependencies: step.dependencies ?? [],
      dependents: [],
      level: 0,
    });
  }
  
  // 建立依赖关系
  for (const step of steps) {
    for (const depId of step.dependencies ?? []) {
      const depNode = graph.get(depId);
      if (depNode) {
        depNode.dependents.push(step.id);
      }
    }
  }
  
  // 计算层级（拓扑排序）
  const visited = new Set<string>();
  const calculateLevel = (nodeId: string): number => {
    if (visited.has(nodeId)) {
      return graph.get(nodeId)!.level;
    }
    visited.add(nodeId);
    
    const node = graph.get(nodeId)!;
    if (node.dependencies.length === 0) {
      node.level = 0;
    } else {
      const maxDepLevel = Math.max(
        ...node.dependencies.map(depId => calculateLevel(depId))
      );
      node.level = maxDepLevel + 1;
    }
    
    return node.level;
  };
  
  for (const step of steps) {
    calculateLevel(step.id);
  }
  
  return graph;
}

/**
 * 获取执行顺序（考虑依赖）
 */
export function getExecutionOrder(steps: TaskStep[]): TaskStep[][] {
  const graph = buildDependencyGraph(steps);
  
  // 按层级分组
  const levels = new Map<number, TaskStep[]>();
  for (const step of steps) {
    const node = graph.get(step.id)!;
    const level = node.level;
    if (!levels.has(level)) {
      levels.set(level, []);
    }
    levels.get(level)!.push(step);
  }
  
  // 转换为数组（每层可并行执行）
  const maxLevel = Math.max(...Array.from(levels.keys()));
  const order: TaskStep[][] = [];
  
  for (let i = 0; i <= maxLevel; i++) {
    const levelSteps = levels.get(i) ?? [];
    order.push(levelSteps);
  }
  
  return order;
}

/**
 * 从模型输出解析任务计划
 */
export function parseTaskPlan(content: string): TaskPlan | null {
  const lines = content.split('\n');
  const steps: TaskStep[] = [];
  let title = '执行计划';
  
  // 匹配 TODO 格式
  const todoRegex = /^[-*]\s*\[([ x→!])\]\s*(.+)/i;
  // 匹配数字列表格式 (支持各种标点)
  const numberedRegex = /^[（(]?\d+[)）\.\、:\：]\s*(.+)/;
  // 匹配步骤关键词
  const stepKeywords = /^(步骤|step|STEP)[\s:：]*\d*[\s:：]*(.+)/i;
  // 匹配带破折号/星号的列表
  const listRegex = /^[-—·*]\s*(.+)/;
  // 匹配"首先/然后/最后"等序列词
  const sequenceRegex = /^(首先|其次|然后|接着|最后|第一|第二|第三|第四|第五|第六|第七|第八|第九|第十)[，,：:\s]+(.+)/;
  // 匹配中文数字
  const chineseNumberRegex = /^[（(]?([一二三四五六七八九十]+)[)）\.\、:\：]\s*(.+)/;
  
  let foundPlanSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    
    // 跳过空行
    if (!trimmed) continue;
    
    // 提取标题
    if (trimmed.startsWith('#') && !steps.length) {
      title = trimmed.replace(/^#+\s*/, '');
      foundPlanSection = true;
      continue;
    }
    
    // 检测是否进入计划区域
    if (!foundPlanSection && (
      trimmed.includes('执行计划') || 
      trimmed.includes('任务计划') ||
      trimmed.includes('开发计划') ||
      trimmed.includes('实施步骤')
    )) {
      foundPlanSection = true;
      if (trimmed.startsWith('#')) {
        title = trimmed.replace(/^#+\s*/, '');
      }
      continue;
    }
    
    // 匹配 TODO 格式
    const todoMatch = trimmed.match(todoRegex);
    if (todoMatch && todoMatch[1] && todoMatch[2]) {
      const statusChar = todoMatch[1].toLowerCase();
      let status: TaskStep['status'] = 'pending';
      if (statusChar === 'x') status = 'completed';
      else if (statusChar === '→') status = 'in_progress';
      else if (statusChar === '!') status = 'failed';
      
      steps.push({
        id: `step-${steps.length + 1}`,
        description: todoMatch[2].trim(),
        status,
      });
      continue;
    }
    
    // 匹配数字列表
    const numberedMatch = trimmed.match(numberedRegex);
    if (numberedMatch && numberedMatch[1]) {
      steps.push({
        id: `step-${steps.length + 1}`,
        description: numberedMatch[1].trim(),
        status: 'pending',
      });
      continue;
    }
    
    // 匹配中文数字
    const chineseMatch = trimmed.match(chineseNumberRegex);
    if (chineseMatch && chineseMatch[2]) {
      steps.push({
        id: `step-${steps.length + 1}`,
        description: chineseMatch[2].trim(),
        status: 'pending',
      });
      continue;
    }
    
    // 匹配步骤关键词
    const stepMatch = trimmed.match(stepKeywords);
    if (stepMatch && stepMatch[2]) {
      steps.push({
        id: `step-${steps.length + 1}`,
        description: stepMatch[2].trim(),
        status: 'pending',
      });
      continue;
    }
    
    // 匹配序列词（首先/然后等）
    const sequenceMatch = trimmed.match(sequenceRegex);
    if (sequenceMatch && sequenceMatch[2]) {
      steps.push({
        id: `step-${steps.length + 1}`,
        description: sequenceMatch[2].trim(),
        status: 'pending',
      });
      continue;
    }
    
    // 匹配破折号/星号列表
    const listMatch = trimmed.match(listRegex);
    if (listMatch && listMatch[1] && steps.length < 15) {
      const desc = listMatch[1].trim();
      // 检查是否看起来像步骤描述（更宽松的条件）
      if (desc.length > 3 && desc.length < 150) {
        // 排除一些明显不是步骤的内容
        if (!/^(是|否|注意|提示|警告|说明|参考|来源)/.test(desc)) {
          steps.push({
            id: `step-${steps.length + 1}`,
            description: desc,
            status: 'pending',
          });
        }
      }
    }
  }
  
  // 如果步骤太少，可能不是真正的计划
  if (steps.length < 2) {
    return null;
  }
  
  return {
    title,
    steps,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * 渲染任务进度
 */
export function renderTaskProgress(plan: TaskPlan): string {
  const lines: string[] = [];
  
  lines.push(chalk.cyan('┌─────────────────────────────────────┐'));
  lines.push(chalk.cyan('│') + chalk.white.bold(` 📋 ${plan.title}`).slice(0, 35).padEnd(36) + chalk.cyan('│'));
  lines.push(chalk.cyan('├─────────────────────────────────────┤'));
  
  for (const step of plan.steps) {
    let icon: string;
    let color: (text: string) => string;
    
    switch (step.status) {
      case 'completed':
        icon = '✅';
        color = chalk.green;
        break;
      case 'in_progress':
        icon = '🔄';
        color = chalk.yellow;
        break;
      case 'failed':
        icon = '❌';
        color = chalk.red;
        break;
      case 'skipped':
        icon = '⏭️';
        color = chalk.gray;
        break;
      default:
        icon = '⬜';
        color = chalk.gray;
    }
    
    const desc = step.description.length > 28 
      ? step.description.slice(0, 25) + '...' 
      : step.description;
    
    lines.push(chalk.cyan('│') + ` ${icon} ${color(desc)}`.padEnd(37) + chalk.cyan('│'));
  }
  
  // 统计
  const completed = plan.steps.filter(s => s.status === 'completed').length;
  const total = plan.steps.length;
  const progress = Math.round((completed / total) * 100);
  
  lines.push(chalk.cyan('├─────────────────────────────────────┤'));
  lines.push(chalk.cyan('│') + chalk.gray(` 进度: ${completed}/${total} (${progress}%)`).padEnd(37) + chalk.cyan('│'));
  lines.push(chalk.cyan('└─────────────────────────────────────┘'));
  
  return lines.join('\n');
}

/**
 * 更新任务步骤状态
 */
export function updateStepStatus(
  plan: TaskPlan, 
  stepId: string, 
  status: TaskStep['status'],
  result?: string
): void {
  const step = plan.steps.find(s => s.id === stepId);
  if (step) {
    step.status = status;
    if (result) step.result = result;
    plan.updatedAt = new Date();
  }
}

/**
 * 获取当前进行中的步骤
 */
export function getCurrentStep(plan: TaskPlan): TaskStep | null {
  return plan.steps.find(s => s.status === 'in_progress') || null;
}

/**
 * 获取下一个待执行的步骤
 */
export function getNextPendingStep(plan: TaskPlan): TaskStep | null {
  return plan.steps.find(s => s.status === 'pending') || null;
}

/**
 * 添加新步骤
 */
export function addStep(plan: TaskPlan, description: string, afterStepId?: string): TaskStep {
  const newStep: TaskStep = {
    id: `step-${Date.now()}`,
    description,
    status: 'pending',
  };
  
  if (afterStepId) {
    const index = plan.steps.findIndex(s => s.id === afterStepId);
    if (index >= 0) {
      plan.steps.splice(index + 1, 0, newStep);
    } else {
      plan.steps.push(newStep);
    }
  } else {
    plan.steps.push(newStep);
  }
  
  plan.updatedAt = new Date();
  return newStep;
}

/**
 * 移除步骤
 */
export function removeStep(plan: TaskPlan, stepId: string): boolean {
  const index = plan.steps.findIndex(s => s.id === stepId);
  if (index >= 0) {
    plan.steps.splice(index, 1);
    plan.updatedAt = new Date();
    return true;
  }
  return false;
}

/**
 * 检查计划是否完成
 */
export function isPlanCompleted(plan: TaskPlan): boolean {
  return plan.steps.every(s => 
    s.status === 'completed' || s.status === 'skipped' || s.status === 'failed'
  );
}

/**
 * 获取计划摘要
 */
export function getPlanSummary(plan: TaskPlan): string {
  const completed = plan.steps.filter(s => s.status === 'completed').length;
  const failed = plan.steps.filter(s => s.status === 'failed').length;
  const pending = plan.steps.filter(s => s.status === 'pending').length;
  const inProgress = plan.steps.filter(s => s.status === 'in_progress').length;
  
  return `任务进度: ✅${completed} 🔄${inProgress} ⬜${pending} ❌${failed}`;
}