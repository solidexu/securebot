/**
 * REPL 工具函数
 * 
 * 从 repl.ts 提取的工具函数
 */

import chalk from 'chalk';
import type { Session, SessionPlan } from '../core/types.js';
import type { TaskPlan } from '../core/smart-task.js';

// ============ 规划辅助函数 ============

/** 生成规划 ID */
export function generatePlanId(): string {
  return `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 保存规划到会话
 */
export function savePlanToSession(
  session: Session,
  plan: TaskPlan | null,
  originalTask?: string
): void {
  if (!plan) {
    delete session.plan;
    return;
  }

  session.plan = {
    id: session.plan?.id ?? generatePlanId(),
    title: plan.title,
    level: session.plan?.level ?? 0,
    steps: plan.steps.map(s => ({
      id: s.id,
      description: s.description,
      status: s.status,
    })),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    originalTask,
  };
}

/**
 * 清除会话中的规划
 */
export function clearPlanFromSession(session: Session): void {
  delete session.plan;
  // 如果有规划栈，弹出下一个
  if (session.planStack && session.planStack.length > 0) {
    session.plan = session.planStack.pop();
  }
}

/**
 * 推入子规划（创建嵌套规划）
 */
export function pushSubPlan(
  session: Session,
  parentStepId: string,
  subPlan: TaskPlan,
  context?: SessionPlan['context']
): void {
  if (!session.plan) return;

  // 初始化规划栈
  if (!session.planStack) {
    session.planStack = [];
  }

  // 保存父规划到栈
  session.planStack.push(session.plan);

  // 标记父步骤有子规划
  const parentStep = session.plan.steps.find(s => s.id === parentStepId);
  if (parentStep) {
    parentStep.hasSubPlan = true;
    parentStep.subPlanId = generatePlanId();
  }

  // 创建子规划
  session.plan = {
    id: parentStep?.subPlanId ?? generatePlanId(),
    title: subPlan.title,
    level: (session.plan.level ?? 0) + 1,
    parentPlanId: session.planStack[session.planStack.length - 1]?.id,
    parentStepId,
    steps: subPlan.steps.map(s => ({
      id: s.id,
      description: s.description,
      status: s.status,
    })),
    createdAt: subPlan.createdAt.toISOString(),
    updatedAt: subPlan.updatedAt.toISOString(),
    context,
  };
}

/**
 * 弹出子规划（子规划完成后返回父规划）
 */
export function popSubPlan(session: Session, completed: boolean = true): SessionPlan | null {
  if (!session.planStack || session.planStack.length === 0) return null;

  const currentPlan = session.plan;

  // 弹出父规划
  const parentPlan = session.planStack.pop()!;

  if (completed && currentPlan) {
    // 标记父步骤为已完成
    const parentStep = parentPlan.steps.find(s => s.id === currentPlan.parentStepId);
    if (parentStep) {
      parentStep.status = 'completed';
    }
  }

  session.plan = parentPlan;
  return parentPlan;
}

/**
 * 渲染层次化规划
 */
export function renderHierarchicalPlan(session: Session): string {
  const lines: string[] = [];

  // 渲染规划栈（父规划）
  if (session.planStack && session.planStack.length > 0) {
    lines.push(chalk.gray('┌─ 父级规划'));
    for (let i = 0; i < session.planStack.length; i++) {
      const p = session.planStack[i];
      if (!p) continue;
      const indent = '│  '.repeat(i);
      lines.push(chalk.gray(`${indent}│ ${p.title}`));

      for (const step of p.steps) {
        const icon = step.status === 'completed' ? '✅' :
          step.status === 'in_progress' ? '🔄' :
            step.status === 'failed' ? '❌' : '⬜';
        const isCurrentStep = step.id === session.plan?.parentStepId;
        const prefix = isCurrentStep ? chalk.yellow('→ ') : '  ';
        lines.push(chalk.gray(`${indent}│   ${prefix}${icon} ${step.description}`));
      }
    }
    lines.push(chalk.gray('└─'));
  }

  // 渲染当前规划
  if (session.plan) {
    const levelIndicator = session.plan.level && session.plan.level > 0 ?
      ` [Level ${session.plan.level}]` : '';
    lines.push(chalk.cyan.bold(`📋 ${session.plan.title}${levelIndicator}`));

    for (const step of session.plan.steps) {
      const icon = step.status === 'completed' ? '✅' :
        step.status === 'in_progress' ? '🔄' :
          step.status === 'failed' ? '❌' : '⬜';
      const color = step.status === 'completed' ? chalk.green :
        step.status === 'in_progress' ? chalk.yellow :
          step.status === 'failed' ? chalk.red : chalk.gray;
      lines.push(`  ${icon} ${color(step.description)}`);
    }
  }

  return lines.join('\n');
}

// ============ 其他工具函数 ============

/**
 * 格式化响应
 */
export function formatResponse(content: string): string {
  return content;
}

/**
 * 欢迎消息
 */
export function printWelcome(agentName: string): void {
  console.log();
  console.log(chalk.cyan.bold('╔══════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║         SecureBot v1.0.0                 ║'));
  console.log(chalk.cyan.bold('║     安全的多Agent AI助手                 ║'));
  console.log(chalk.cyan.bold('╚══════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.gray(`当前 Agent: ${chalk.white(agentName)}`));
  console.log(chalk.gray('输入 /help 查看帮助'));
  console.log();
}