/**
 * 终端输出美化工具
 * 
 * 使用 boxen 和 ora 美化终端输出
 */

import chalk from 'chalk';
import boxen from 'boxen';
import ora, { type Ora } from 'ora';

// ============ 进度指示器 ============

let currentSpinner: Ora | null = null;

/**
 * 显示加载中
 */
export function showLoading(text: string): void {
  if (currentSpinner) {
    currentSpinner.text = text;
    return;
  }
  currentSpinner = ora(text).start();
}

/**
 * 显示成功
 */
export function showSuccess(text: string): void {
  if (currentSpinner) {
    currentSpinner.succeed(text);
    currentSpinner = null;
  } else {
    console.log(chalk.green('✓'), text);
  }
}

/**
 * 显示失败
 */
export function showFailure(text: string): void {
  if (currentSpinner) {
    currentSpinner.fail(text);
    currentSpinner = null;
  } else {
    console.log(chalk.red('✗'), text);
  }
}

/**
 * 显示警告
 */
export function showWarning(text: string): void {
  if (currentSpinner) {
    currentSpinner.warn(text);
    currentSpinner = null;
  } else {
    console.log(chalk.yellow('⚠'), text);
  }
}

/**
 * 显示信息
 */
export function showInfo(text: string): void {
  if (currentSpinner) {
    currentSpinner.info(text);
    currentSpinner = null;
  } else {
    console.log(chalk.blue('ℹ'), text);
  }
}

/**
 * 停止加载中
 */
export function stopLoading(): void {
  if (currentSpinner) {
    currentSpinner.stop();
    currentSpinner = null;
  }
}

// ============ Box 输出 ============

/**
 * 显示成功框
 */
export function showSuccessBox(title: string, message?: string): void {
  const content = message ? `${title}\n\n${message}` : title;
  console.log(boxen(content, {
    padding: 1,
    borderStyle: 'round',
    borderColor: 'green',
    title: '✓ 成功',
    titleAlignment: 'left',
  }));
}

/**
 * 显示错误框
 */
export function showErrorBox(title: string, message?: string): void {
  const content = message ? `${title}\n\n${message}` : title;
  console.log(boxen(content, {
    padding: 1,
    borderStyle: 'round',
    borderColor: 'red',
    title: '✗ 错误',
    titleAlignment: 'left',
  }));
}

/**
 * 显示信息框
 */
export function showInfoBox(title: string, message?: string): void {
  const content = message ? `${title}\n\n${message}` : title;
  console.log(boxen(content, {
    padding: 1,
    borderStyle: 'round',
    borderColor: 'cyan',
    title: 'ℹ 信息',
    titleAlignment: 'left',
  }));
}

/**
 * 显示任务完成框
 */
export function showTaskCompleteBox(taskName: string, details: {
  stepsCompleted: number;
  stepsTotal: number;
  duration?: string;
}): void {
  const content = [
    chalk.white.bold(taskName),
    '',
    chalk.gray(`步骤: ${details.stepsCompleted}/${details.stepsTotal}`),
    details.duration ? chalk.gray(`耗时: ${details.duration}`) : '',
  ].filter(Boolean).join('\n');
  
  console.log(boxen(content, {
    padding: 1,
    borderStyle: 'round',
    borderColor: 'green',
    title: '✓ 任务完成',
    titleAlignment: 'left',
  }));
}

/**
 * 显示任务规划框
 */
export function showPlanBox(title: string, steps: Array<{
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}>): void {
  const statusIcons = {
    pending: '⬜',
    in_progress: '🔄',
    completed: '✅',
    failed: '❌',
  };
  
  const lines = steps.map((step, index) => {
    const icon = statusIcons[step.status];
    const num = chalk.gray(`${index + 1}.`.padStart(4));
    return `${num} ${icon} ${step.description}`;
  });
  
  console.log(boxen(lines.join('\n'), {
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    borderStyle: 'round',
    borderColor: 'cyan',
    title: `📋 ${title}`,
    titleAlignment: 'left',
  }));
}

// ============ 进度条 ============

/**
 * 简单文本进度条
 */
export function showProgressBar(current: number, total: number, label?: string): void {
  const percent = Math.round((current / total) * 100);
  const filled = Math.round(percent / 5);
  const empty = 20 - filled;
  
  const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  const text = `${bar} ${percent}%`;
  
  if (label) {
    console.log(`${label}: ${text}`);
  } else {
    console.log(text);
  }
}

// ============ 表格 ============

/**
 * 显示简单表格
 */
export function showTable(headers: string[], rows: string[][]): void {
  const colWidths = headers.map((h, i) => 
    Math.max(h.length, ...rows.map(r => r[i]?.length || 0))
  );
  
  // 头部
  const headerLine = headers.map((h, i) => 
    chalk.cyan.bold(h.padEnd(colWidths[i]!))
  ).join(' │ ');
  console.log('  ' + headerLine);
  console.log('  ' + colWidths.map(w => '─'.repeat(w)).join('─┼─'));
  
  // 行
  for (const row of rows) {
    const rowLine = row.map((cell, i) => 
      (cell || '').padEnd(colWidths[i]!)
    ).join(' │ ');
    console.log('  ' + rowLine);
  }
}

// ============ 分隔线 ============

/**
 * 显示分隔线
 */
export function showDivider(title?: string): void {
  if (title) {
    const line = '─'.repeat(50 - title.length - 3);
    console.log(chalk.gray(`── ${title} ${line}`));
  } else {
    console.log(chalk.gray('─'.repeat(50)));
  }
}

/**
 * 显示区块标题
 */
export function showSection(title: string): void {
  console.log();
  console.log(chalk.cyan.bold(`▶ ${title}`));
  console.log(chalk.gray('─'.repeat(40)));
}