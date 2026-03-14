/**
 * 智能任务管理器
 * 
 * 自动判断任务复杂度，简单任务直接执行，复杂任务先规划再执行
 */

import chalk from 'chalk';

// ============ 类型定义 ============

export interface TaskStep {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: string;
}

export interface TaskPlan {
  title: string;
  steps: TaskStep[];
  createdAt: Date;
  updatedAt: Date;
}

export type TaskComplexity = 'simple' | 'complex';

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
];

/** 复杂任务关键词 */
const COMPLEX_TASK_KEYWORDS = [
  // 开发类
  '开发', '实现', '创建', '构建', '编写', '设计',
  '添加', '修改', '重构', '优化', '完善',
  // 多步骤
  '然后', '之后', '接着', '同时', '并且',
  // 完整流程
  '项目', '应用', '系统', '模块', '功能',
  '测试', '部署', '配置环境', '初始化',
  // 算法相关
  '算法', '实现算法', '编写算法', '优化算法',
];

/**
 * 判断任务复杂度
 */
export function assessComplexity(userInput: string): TaskComplexity {
  const input = userInput.toLowerCase();
  
  // 检查是否包含复杂任务关键词
  const hasComplexKeywords = COMPLEX_TASK_KEYWORDS.some(kw => input.includes(kw));
  
  // 检查是否包含简单任务关键词
  const hasSimpleKeywords = SIMPLE_TASK_KEYWORDS.some(kw => input.includes(kw));
  
  // 检查是否有多个动作（暗示多步骤）
  const actionCount = (input.match(/创建|实现|开发|编写|添加|修改|删除|配置|测试/g) || []).length;
  
  // 检查是否涉及多个文件
  const hasMultipleFiles = /多个|所有|全部|批量/.test(input) || 
    (input.match(/\//g) || []).length > 2;
  
  // 判断逻辑
  if (hasComplexKeywords || actionCount >= 2 || hasMultipleFiles) {
    return 'complex';
  }
  
  if (hasSimpleKeywords && !hasComplexKeywords) {
    return 'simple';
  }
  
  // 默认：如果有多个句子或字数较多，视为复杂任务
  const sentences = input.split(/[。！？\n]/).filter(s => s.trim().length > 0);
  if (sentences.length >= 2 || input.length > 50) {
    return 'complex';
  }
  
  return 'simple';
}

/**
 * 从模型输出解析任务计划
 */
export function parseTaskPlan(content: string): TaskPlan | null {
  const lines = content.split('\n');
  const steps: TaskStep[] = [];
  let title = '任务计划';
  
  // 匹配 TODO 格式
  const todoRegex = /^[-*]\s*\[([ x→!])\]\s*(.+)/i;
  // 匹配数字列表格式
  const numberedRegex = /^\d+[\.\)、]\s*(.+)/;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // 跳过空行
    if (!trimmed) continue;
    
    // 提取标题
    if (trimmed.startsWith('#') && !steps.length) {
      title = trimmed.replace(/^#+\s*/, '');
      continue;
    }
    
    // 匹配 TODO 格式
    const todoMatch = trimmed.match(todoRegex);
    if (todoMatch) {
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
    if (numberedMatch && steps.length < 10) {
      steps.push({
        id: `step-${steps.length + 1}`,
        description: numberedMatch[1].trim(),
        status: 'pending',
      });
    }
  }
  
  if (steps.length === 0) {
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
    let color: chalk.Chalk;
    
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