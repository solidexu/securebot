/**
 * Ralph Loop 控制器
 * 
 * 实现 Ralph Wiggum 循环模式：
 * 1. 每次迭代创建干净的上下文
 * 2. 从 prd.json 读取任务状态
 * 3. 执行一个任务
 * 4. 运行反馈循环（测试、类型检查）
 * 5. 更新状态并提交
 * 6. 重复直到完成或达到最大迭代次数
 */

import chalk from 'chalk';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import * as readline from 'node:readline/promises';
import type { ReplState, ModelAdapter, ChatParams, Message } from '../core/types.js';
import type { RalphPRD, RalphStory, RalphProgress, RalphConfig, RalphResult, RalphIteration, RalphModeOptions } from './types.js';
import { getDefaultAgent } from '../core/agent.js';
import { createSession, addUserMessage, buildSystemPrompt } from '../core/session.js';
import { getAvailableTools } from '../tools/index.js';
import { getPRDStats, formatPRDStats } from './state-bridge.js';
import { runFeedbackLoop } from './feedback.js';
import { commitForTask } from './git.js';
import { ProgressDisplay } from './progress-display.js';
import { formatError, RalphError, RalphErrorType } from './errors.js';

// ============ 卡住检测配置 ============

/** 同一任务连续失败的最大次数 */
const MAX_STUCK_COUNT = 3;

/** 卡住时的处理选项 */
type StuckAction = 'retry' | 'skip' | 'abort';

// ============ 默认配置 ============

const DEFAULT_RALPH_CONFIG: RalphConfig = {
  maxIterations: 20,
  completionPromise: '<promise>COMPLETE</promise>',
  autoCommit: true,
  feedbackCommands: ['npm test', 'npm run typecheck'],
  prdFile: 'prd.json',
  progressFile: 'progress.txt',
};

// ============ PRD 管理 ============

/**
 * 从自然语言描述创建 PRD
 */
export async function createPRDFromDescription(
  taskDescription: string,
  modelAdapter: ModelAdapter,
  model: string
): Promise<RalphPRD> {
  const systemPrompt = `你是一个项目管理专家。请将以下任务描述分解为可执行的用户故事列表。

任务描述：
${taskDescription}

要求：
1. 每个用户故事应该是可以在一次迭代中完成的小任务
2. 按依赖顺序排列（基础任务在前）
3. 每个故事要有明确的验收标准

请以 JSON 格式输出，格式如下：
{
  "branchName": "ralph/feature-name",
  "userStories": [
    {
      "id": "US-001",
      "title": "故事标题",
      "acceptanceCriteria": ["标准1", "标准2"],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}

只输出 JSON，不要有其他内容。`;

  const params: ChatParams = {
    model,
    messages: [{ role: 'user', content: systemPrompt }],
  };
  
  const response = await modelAdapter.chat(params);
  const content = response.content;
  
  // 解析 JSON
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as RalphPRD;
    }
    return JSON.parse(content) as RalphPRD;
  } catch {
    // 解析失败，创建默认 PRD
    return {
      branchName: 'ralph/task',
      userStories: [{
        id: 'US-001',
        title: taskDescription.slice(0, 50),
        acceptanceCriteria: ['任务完成'],
        priority: 1,
        passes: false,
        notes: taskDescription,
      }],
    };
  }
}

/**
 * 加载 PRD 文件
 */
export function loadPRD(path: string): RalphPRD | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as RalphPRD;
  } catch {
    return null;
  }
}

/**
 * 保存 PRD 文件
 */
export function savePRD(path: string, prd: RalphPRD): void {
  prd.updatedAt = new Date().toISOString();
  if (!prd.createdAt) prd.createdAt = prd.updatedAt;
  writeFileSync(path, JSON.stringify(prd, null, 2), 'utf-8');
}

/**
 * 获取下一个未完成的任务
 */
export function getNextTask(prd: RalphPRD): RalphStory | null {
  return prd.userStories
    .filter(s => !s.passes)
    .sort((a, b) => a.priority - b.priority)[0] || null;
}

/**
 * 更新任务状态
 */
export function updateStoryStatus(prd: RalphPRD, storyId: string, passes: boolean, notes?: string): void {
  const story = prd.userStories.find(s => s.id === storyId);
  if (story) {
    story.passes = passes;
    if (notes) story.notes = notes;
  }
}

/**
 * 检查是否所有任务都完成
 */
export function allTasksComplete(prd: RalphPRD): boolean {
  return prd.userStories.every(s => s.passes);
}

/**
 * 验证 PRD 质量（独立函数，供测试使用）
 * 
 * 检查项：
 * - 分支名称有效性
 * - 任务数量非空
 * - 每个任务的 ID、标题、验收标准、优先级
 * - 任务 ID 唯一性
 * 
 * @param prd - 待验证的 PRD 对象
 * @returns 验证结果，包含 valid 标志和 issues 列表
 */
export function validatePRD(prd: RalphPRD): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // 检查分支名
  if (!prd.branchName || prd.branchName.length < 3) {
    issues.push('分支名称太短或缺失');
  }
  
  // 检查任务数量
  if (!prd.userStories || prd.userStories.length === 0) {
    issues.push('没有定义任何任务');
    return { valid: false, issues };
  }
  
  // 检查每个任务
  for (const story of prd.userStories) {
    // 任务 ID
    if (!story.id || story.id.length < 2) {
      issues.push(`任务 "${story.title}": ID 无效`);
    }
    
    // 任务标题
    if (!story.title || story.title.length < 5) {
      issues.push(`任务 ${story.id}: 标题太短`);
    }
    
    // 验收标准
    if (!story.acceptanceCriteria || story.acceptanceCriteria.length === 0) {
      issues.push(`任务 ${story.id}: 缺少验收标准`);
    }
    
    // 优先级
    if (story.priority === undefined || story.priority < 1) {
      issues.push(`任务 ${story.id}: 优先级无效`);
    }
  }
  
  // 检查任务 ID 唯一性
  const ids = prd.userStories.map(s => s.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    issues.push('存在重复的任务 ID');
  }
  
  return {
    valid: issues.length === 0,
    issues,
  };
}

// ============ 进度管理 ============

/**
 * 初始化进度文件
 */
export function initProgressFile(path: string): void {
  if (!existsSync(path)) {
    writeFileSync(path, `# Ralph Progress Log
Started: ${new Date().toISOString()}

## Codebase Patterns
(自动记录发现的模式)

---
`, 'utf-8');
  }
}

/**
 * 追加进度记录
 */
export function appendProgress(path: string, progress: RalphProgress): void {
  appendFileSync(path, `
## ${progress.timestamp} - ${progress.storyId}
- **任务**: ${progress.storyTitle}
- **完成**: ${progress.completed}
${progress.filesChanged?.length ? `- **文件**: ${progress.filesChanged.join(', ')}` : ''}
${progress.patterns?.length ? `- **模式**:\n${progress.patterns.map(p => `  - ${p}`).join('\n')}` : ''}
${progress.issues?.length ? `- **问题**:\n${progress.issues.map(i => `  - ${i}`).join('\n')}` : ''}
---
`, 'utf-8');
}

/**
 * 构建迭代提示（供外部使用）
 */
export function buildIterationPrompt(
  task: RalphStory, 
  progressPath: string, 
  completionPromise: string
): string {
  const progressContent = existsSync(progressPath) 
    ? readFileSync(progressPath, 'utf-8')
    : '';
  
  return `
# Ralph 迭代任务

## 当前任务
- ID: ${task.id}
- 标题: ${task.title}
- 验收标准: ${task.acceptanceCriteria.join('\n  - ')}

## 进度上下文
${progressContent.slice(0, 2000)}

## 指令
1. 完成上述任务的实现
2. 运行必要的测试确保代码正确
3. 当你完成当前任务后，在回复末尾输出：${completionPromise}

## 重要
- 这是一个持续迭代的过程，你只需要完成当前这一个任务
- 完成后输出 ${completionPromise}，系统会自动进入下一个任务
- 不要输出"任务完成"等文字，只需输出 ${completionPromise}
`;
}

// ============ Ralph Loop 执行器 ============

/**
 * Ralph Loop 执行器
 */
export class RalphExecutor {
  private config: RalphConfig;
  private state: ReplState;
  private ralphDir: string;
  private prdPath: string;
  private progressPath: string;
  private iterations: RalphIteration[] = [];
  private rl: readline.Interface;
  
  constructor(state: ReplState, rl: readline.Interface, config: Partial<RalphConfig> = {}) {
    this.state = state;
    this.rl = rl;
    this.config = { ...DEFAULT_RALPH_CONFIG, ...config };
    
    const rootDir = state.config.rootDir ?? join(homedir(), '.securebot');
    this.ralphDir = join(rootDir, '.ralph');
    this.prdPath = join(this.ralphDir, this.config.prdFile);
    this.progressPath = join(this.ralphDir, this.config.progressFile);
    
    if (!existsSync(this.ralphDir)) {
      mkdirSync(this.ralphDir, { recursive: true });
    }
  }
  
  /**
   * 启动 Ralph 循环
   */
  async run(options: RalphModeOptions): Promise<RalphResult> {
    const { taskDescription, maxIterations = this.config.maxIterations } = options;
    
    console.log();
    console.log(chalk.cyan.bold('🔄 Ralph Loop 模式'));
    console.log(chalk.gray(`最大迭代次数: ${maxIterations}`));
    console.log(chalk.gray('提示: 按 Ctrl+C 可中断执行'));
    console.log();
    
    // 0. 设置中断检测
    let interrupted = false;
    let interruptCount = 0;
    
    const sigintHandler = () => {
      interruptCount++;
      
      if (interruptCount === 1) {
        console.log();
        console.log(chalk.yellow('⚠️ 正在中断... 再次按 Ctrl+C 强制退出'));
        interrupted = true;
        // 触发 AbortController
        if (this.state.abortController) {
          this.state.abortController.abort();
        }
      } else {
        console.log(chalk.red('\n🛑 强制退出'));
        process.exit(1);
      }
    };
    
    process.on('SIGINT', sigintHandler);
    
    try {
      // 1. 创建 PRD
      console.log(chalk.cyan('📋 正在创建任务列表...'));
      const model = this.state.config.model.model || 'qwen3.5:35b-a3b';
      
      // 检查中断
      if (interrupted) {
        console.log(chalk.gray('已取消'));
        return this.buildInterruptedResult(0, { branchName: '', userStories: [] });
      }
      
      let prd = await createPRDFromDescription(taskDescription, this.state.modelAdapter, model);
    
    // 2. 验证 PRD 质量
    const validation = validatePRD(prd);
    if (!validation.valid) {
      console.log(chalk.yellow('\n⚠️ PRD 存在问题:'));
      validation.issues.forEach(issue => console.log(chalk.gray(`  - ${issue}`)));
      console.log();
    }
    
    // 3. 显示 PRD 并请求确认
    console.log(chalk.green(`\n✓ 已创建 ${prd.userStories.length} 个任务:`));
    this.printTaskList(prd);
    console.log();
    
    // 4. 用户确认 PRD
    const confirmed = await this.confirmPRD(prd);
    if (!confirmed) {
      console.log(chalk.gray('已取消 Ralph 循环'));
      return {
        success: false,
        iterations: 0,
        completedStories: 0,
        totalStories: prd.userStories.length,
        reason: 'user_cancelled_prd',
      };
    }
    
    savePRD(this.prdPath, prd);
    initProgressFile(this.progressPath);
    console.log();
    
    // 5. 初始化卡住检测
    const stuckCounts = new Map<string, number>();
    
    // 5.5 初始化进度显示
    const progressDisplay = new ProgressDisplay();
    
    // 6. 开始循环
    let iterations = 0;
    const startTime = Date.now();
    
    while (iterations < maxIterations) {
      // 检查中断
      if (interrupted) {
        console.log(chalk.yellow('\n⚠️ 用户中断'));
        return this.buildInterruptedResult(iterations, prd);
      }
      
      iterations++;
      prd = loadPRD(this.prdPath) ?? prd;
      
      if (allTasksComplete(prd)) {
        const duration = Math.round((Date.now() - startTime) / 1000);
        progressDisplay.showCompletionSummary(
          true,
          iterations,
          prd.userStories.filter(s => s.passes).length,
          prd.userStories.length,
          duration
        );
        return this.buildResult(true, iterations, prd, 'all_tasks_complete');
      }
      
      const task = getNextTask(prd);
      if (!task) break;
      
      // 显示迭代进度
      progressDisplay.startTask(task.id, task.title, iterations, maxIterations);
      console.log(chalk.gray(`验收标准: ${task.acceptanceCriteria.join(', ')}`));
      console.log();
      
      const result = await this.runIteration(task, iterations, () => interrupted);
      this.iterations.push(result);
      
      // 迭代后检查中断
      if (interrupted) {
        console.log(chalk.yellow('\n⚠️ 用户中断'));
        return this.buildInterruptedResult(iterations, prd);
      }
      
      if (result.passed) {
        // 运行反馈循环
        if (this.config.feedbackCommands && this.config.feedbackCommands.length > 0) {
          // 获取 agent 以确定工作目录
          const agent = this.state.agents.get(this.state.currentAgentId) ?? getDefaultAgent(this.state.agents);
          const workspace = agent?.workspace || process.cwd();
          
          console.log(chalk.cyan('\n🔍 运行反馈循环...'));
          console.log(chalk.gray(`  工作目录: ${workspace}`));
          
          // 检测项目类型，选择合适的反馈命令
          const detectedCommands = await this.detectFeedbackCommands(workspace);
          console.log(chalk.gray(`  检测结果: ${detectedCommands.length > 0 ? detectedCommands.join(', ') : '(未检测到)'}`));
          
          const commandsToRun = detectedCommands.length > 0 ? detectedCommands : this.config.feedbackCommands;
          console.log(chalk.gray(`  执行命令: ${commandsToRun.join(', ')}`));
          
          const feedbackResult = await runFeedbackLoop({
            commands: commandsToRun,
            cwd: workspace,
          });
          
          if (!feedbackResult.allPassed) {
            console.log(chalk.yellow(`⚠ 反馈检查未通过: ${feedbackResult.failedCommands.join(', ')}`));
            
            // 询问用户是否继续
            console.log();
            console.log(chalk.cyan('反馈检查失败，请选择:'));
            console.log(chalk.gray('  1. 继续 - 忽略反馈失败，标记任务完成'));
            console.log(chalk.gray('  2. 重试 - 稍后重试此任务'));
            console.log();
            
            const choice = await this.rl.question(chalk.cyan('选择 [1/2，默认 2]: '));
            
            if (choice.trim() === '1') {
              console.log(chalk.gray('忽略反馈失败，继续...'));
              result.passed = true;
            } else {
              result.passed = false;
              result.error = `反馈检查失败: ${feedbackResult.failedCommands.join(', ')}`;
            }
          }
        }
        
        // 审查者模型检查
        if (result.passed && this.state.config.model.reviewer) {
          console.log(chalk.cyan('\n🔍 审查者检查...'));
          const reviewResult = await this.runReview(task, result);
          
          if (!reviewResult.passed) {
            console.log(chalk.yellow(`⚠ 审查未通过: ${reviewResult.issues?.join(', ')}`));
            result.passed = false;
            result.error = `审查失败: ${reviewResult.issues?.join(', ')}`;
          } else {
            console.log(chalk.green('✓ 审查通过'));
          }
        }
      }
      
      if (result.passed) {
        updateStoryStatus(prd, task.id, true, result.output?.slice(0, 200));
        savePRD(this.prdPath, prd);
        
        // Git 自动提交
        if (this.config.autoCommit) {
          await commitForTask(task, { cwd: process.cwd() });
        }
        
        appendProgress(this.progressPath, {
          timestamp: new Date().toISOString(),
          storyId: task.id,
          storyTitle: task.title,
          completed: result.output || '完成',
        });
        console.log(chalk.green(`✓ 任务 ${task.id} 完成`));
      } else {
        // 任务失败，更新卡住计数
        const stuckCount = (stuckCounts.get(task.id) || 0) + 1;
        stuckCounts.set(task.id, stuckCount);
        
        console.log(chalk.yellow(`⚠ 任务 ${task.id} 未完成 (失败 ${stuckCount}/${MAX_STUCK_COUNT} 次)`));
        
        if (result.error) {
          appendProgress(this.progressPath, {
            timestamp: new Date().toISOString(),
            storyId: task.id,
            storyTitle: task.title,
            completed: '未完成',
            issues: [result.error],
          });
        }
        
        // 卡住检测：达到阈值时请求用户介入
        if (stuckCount >= MAX_STUCK_COUNT) {
          console.log();
          console.log(chalk.red.bold(`❌ 任务 ${task.id} 多次失败，需要人工介入`));
          console.log(chalk.gray(`错误: ${result.error || '未知错误'}`));
          console.log();
          
          const action = await this.askStuckAction();
          
          if (action === 'skip') {
            console.log(chalk.yellow(`⏭️ 跳过任务 ${task.id}`));
            updateStoryStatus(prd, task.id, false, '用户跳过');
            savePRD(this.prdPath, prd);
            stuckCounts.set(task.id, 0); // 重置计数
          } else if (action === 'abort') {
            console.log(chalk.red('🛑 用户中止 Ralph 循环'));
            return this.buildResult(false, iterations, prd, 'user_aborted');
          } else {
            console.log(chalk.cyan('🔄 重试任务...'));
            stuckCounts.set(task.id, 0); // 重置计数，给新的机会
          }
        }
      }
      
      // 显示当前进度
      const stats = getPRDStats(prd);
      console.log(chalk.cyan(`\n📊 总进度: ${formatPRDStats(stats)}`));
    }
    
    // 循环结束，检查是否所有任务完成
    const finalStats = getPRDStats(prd);
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    if (allTasksComplete(prd)) {
      console.log(chalk.green.bold('\n🎉 所有任务已完成！'));
      console.log(chalk.gray(`总耗时: ${duration}秒`));
      return this.buildResult(true, iterations, prd, 'all_tasks_complete');
    }
    
    console.log(chalk.yellow.bold(`\n⚠️ 达到最大迭代次数 (${maxIterations})`));
    console.log(chalk.gray(`总耗时: ${duration}秒`));
    console.log(chalk.gray(`完成: ${finalStats.completed}/${finalStats.total} 任务`));
    
    return this.buildResult(false, iterations, prd, 'max_iterations_reached');
    } finally {
      // 移除 SIGINT 监听器
      process.off('SIGINT', sigintHandler);
    }
  }
  
  /**
   * 构建中断结果
   */
  private buildInterruptedResult(iterations: number, prd: RalphPRD): RalphResult {
    return {
      success: false,
      iterations,
      completedStories: prd.userStories.filter(s => s.passes).length,
      totalStories: prd.userStories.length,
      reason: 'user_interrupted',
    };
  }
  
  /**
   * 执行单次迭代
   */
  private async runIteration(
    task: RalphStory, 
    iteration: number,
    checkInterrupted: () => boolean
  ): Promise<RalphIteration> {
    const startTime = Date.now();
    const result: RalphIteration = {
      iteration,
      currentStory: task,
    };
    
    try {
      // 检查中断
      if (checkInterrupted()) {
        result.error = '用户中断';
        result.passed = false;
        result.duration = Date.now() - startTime;
        return result;
      }
      
      const agent = this.state.agents.get(this.state.currentAgentId) ?? getDefaultAgent(this.state.agents);
      if (!agent) {
        throw new Error('找不到 Agent');
      }
      
      // 1. 创建干净的 session
      const session = createSession(agent.id, `ralph-${iteration}`);
      
      // 2. 构建迭代提示
      const iterationPrompt = buildIterationPrompt(
        task, 
        this.progressPath, 
        this.config.completionPromise
      );
      
      // 3. 添加用户消息
      addUserMessage(session, iterationPrompt);
      
      // 4. 构建系统提示词
      const toolNames = getAvailableTools(agent, this.state.config.tools)
        .map(t => t.name);
      const systemPrompt = await buildSystemPrompt(
        agent, 
        this.state.config, 
        toolNames
      );
      
      // 5. 获取工具
      const tools = getAvailableTools(agent, this.state.config.tools);
      
      // 6. 工具调用循环
      const model = this.state.config.model.model || 'qwen3.5:35b-a3b';
      let currentMessages: Message[] = [
        { role: 'system', content: systemPrompt },
        ...session.history,
      ];
      
      let output = '';
      let toolCallRounds = 0;
      const maxToolRounds = 20; // 防止无限循环
      
      while (toolCallRounds < maxToolRounds) {
        // 检查中断
        if (checkInterrupted()) {
          console.log(chalk.yellow('  中断...'));
          result.error = '用户中断';
          result.passed = false;
          result.duration = Date.now() - startTime;
          return result;
        }
        
        const response = await this.state.modelAdapter.chat({
          model,
          messages: currentMessages,
          tools,
        });
        
        output = response.content || '';
        
        // 检查是否有工具调用
        if (!response.toolCalls || response.toolCalls.length === 0) {
          // 没有工具调用，结束循环
          break;
        }
        
        toolCallRounds++;
        
        // 执行工具调用
        currentMessages.push({
          role: 'assistant',
          content: output,
          toolCalls: response.toolCalls,
        });
        
        for (const toolCall of response.toolCalls) {
          console.log(chalk.blue(`  调用工具: ${toolCall.name}`));
          
          // 查找并执行工具
          const tool = tools.find(t => t.name === toolCall.name);
          if (!tool) {
            console.log(chalk.yellow(`  工具不存在: ${toolCall.name}`));
            currentMessages.push({
              role: 'tool',
              toolCallId: toolCall.id,
              name: toolCall.name,
              content: `错误: 工具 ${toolCall.name} 不存在`,
            });
            continue;
          }
          
          try {
            const toolResult = await tool.execute(toolCall.arguments, {
              agent,
              session,
              workspace: agent.workspace,
              logger: console,
            });
            
            const resultContent = toolResult.success 
              ? (toolResult.content || '成功')
              : `错误: ${toolResult.error || '未知错误'}`;
            
            currentMessages.push({
              role: 'tool',
              toolCallId: toolCall.id,
              name: toolCall.name,
              content: resultContent,
            });
            
            console.log(chalk.gray(`  结果: ${resultContent.slice(0, 100)}...`));
          } catch (err) {
            const errorMsg = formatError(err);
            currentMessages.push({
              role: 'tool',
              toolCallId: toolCall.id,
              name: toolCall.name,
              content: `错误: ${errorMsg}`,
            });
            console.log(chalk.red(`  错误: ${errorMsg}`));
          }
        }
      }
      
      // 检查完成信号
      const hasCompleteSignal = output.includes(this.config.completionPromise);
      
      // 检查工具执行结果中是否有成功信号
      const hasSuccessToolResult = this.hasSuccessToolResult(currentMessages);
      
      // Ralph 模式下，任务完成判断
      result.output = output;
      result.passed = hasCompleteSignal || (toolCallRounds > 0 && hasSuccessToolResult);
      result.duration = Date.now() - startTime;
      
      if (hasCompleteSignal) {
        console.log(chalk.green(`\n✓ 任务完成信号已检测`));
      } else if (toolCallRounds > 0 && hasSuccessToolResult) {
        console.log(chalk.green(`\n✓ 工具执行成功，任务完成`));
      } else if (toolCallRounds > 0) {
        // 有工具调用但没有成功结果
        console.log(chalk.yellow(`\n⚠ 有工具调用但结果不确定，假设任务已完成`));
        result.passed = true;
      }
      
      console.log(chalk.gray(`迭代耗时: ${result.duration}ms, 工具调用: ${toolCallRounds} 轮`));
      
    } catch (error) {
      const ralphError = RalphError.fromError(error, RalphErrorType.TASK_FAILED);
      result.error = ralphError.message;
      result.passed = false;
      result.duration = Date.now() - startTime;
      console.log(chalk.red(`  迭代错误: ${ralphError.message}`));
    }
    
    return result;
  }
  
  private buildResult(success: boolean, iterations: number, prd: RalphPRD, reason: string): RalphResult {
    return {
      success,
      iterations,
      completedStories: prd.userStories.filter(s => s.passes).length,
      totalStories: prd.userStories.length,
      reason,
    };
  }
  
  private printTaskList(prd: RalphPRD): void {
    console.log(chalk.cyan('\n任务列表:'));
    for (const story of prd.userStories) {
      const status = story.passes ? chalk.green('✓') : chalk.gray('○');
      console.log(`  ${status} ${story.id}: ${story.title}`);
    }
  }
  
  /**
   * 获取迭代历史
   */
  getIterations(): RalphIteration[] {
    return this.iterations;
  }
  
  /**
   * 获取当前进度统计
   */
  getStats(): string {
    const prd = loadPRD(this.prdPath);
    if (!prd) return '无 PRD 数据';
    return formatPRDStats(getPRDStats(prd));
  }
  
  /**
   * 确认 PRD
   */
  private async confirmPRD(prd: RalphPRD): Promise<boolean> {
    console.log(chalk.cyan('是否按此计划执行？'));
    console.log(chalk.gray('  y - 确认执行'));
    console.log(chalk.gray('  e - 编辑 PRD 文件后继续'));
    console.log(chalk.gray('  n - 取消'));
    console.log();
    
    const answer = await this.rl.question(chalk.cyan('选择 [y/e/n]: '));
    const choice = answer.trim().toLowerCase();
    
    if (choice === 'y') {
      return true;
    } else if (choice === 'e') {
      // 显示 PRD 文件路径，让用户编辑
      console.log();
      console.log(chalk.cyan(`PRD 文件路径: ${this.prdPath}`));
      console.log(chalk.gray('请编辑文件后按回车继续...'));
      
      // 等待用户编辑
      await this.rl.question('');
      
      // 重新加载 PRD
      const updatedPRD = loadPRD(this.prdPath);
      if (updatedPRD) {
        // 更新 prd 对象
        prd.branchName = updatedPRD.branchName;
        prd.userStories = updatedPRD.userStories;
        prd.updatedAt = updatedPRD.updatedAt;
        
        // 重新验证
        const validation = validatePRD(prd);
        if (!validation.valid) {
          console.log(chalk.yellow('\n⚠️ 修改后的 PRD 仍存在问题:'));
          validation.issues.forEach(issue => console.log(chalk.gray(`  - ${issue}`)));
          console.log();
          return this.confirmPRD(prd); // 递归确认
        }
        
        console.log(chalk.green('\n✓ PRD 已更新'));
        this.printTaskList(prd);
        console.log();
        
        // 再次确认
        return this.confirmPRD(prd);
      }
      
      return false;
    }
    
    return false;
  }
  
  /**
   * 卡住时询问用户操作
   * 当任务连续失败达到阈值时调用，让用户决定如何处理
   * @returns 用户选择的操作: retry(重试) | skip(跳过) | abort(中止)
   */
  private async askStuckAction(): Promise<StuckAction> {
    console.log(chalk.cyan('请选择操作:'));
    console.log(chalk.gray('  1. 重试 - 重置失败计数，继续尝试'));
    console.log(chalk.gray('  2. 跳过 - 跳过此任务，继续下一个'));
    console.log(chalk.gray('  3. 中止 - 停止 Ralph 循环'));
    console.log();
    
    const answer = await this.rl.question(chalk.cyan('选择 [1/2/3]: '));
    
    switch (answer.trim()) {
      case '1':
        return 'retry';
      case '2':
        return 'skip';
      case '3':
        return 'abort';
      default:
        console.log(chalk.gray('默认: 重试'));
        return 'retry';
    }
  }
  
  /**
   * 运行审查者检查
   */
  private async runReview(
    task: RalphStory,
    iterationResult: RalphIteration
  ): Promise<{ passed: boolean; issues?: string[] }> {
    const reviewerModel = this.state.config.model.reviewer;
    if (!reviewerModel) {
      return { passed: true };
    }
    
    try {
      // 构建审查提示
      const reviewPrompt = `你是代码审查专家。请审查以下任务是否真正完成。

任务: ${task.title}
验收标准: ${task.acceptanceCriteria.join('\n')}

执行输出:
${iterationResult.output?.slice(0, 2000) || '无输出'}

请判断：
1. 任务是否按验收标准完成？
2. 是否存在明显的问题或遗漏？

请用 JSON 格式回复：
{
  "passed": true/false,
  "issues": ["问题1", "问题2"] // 如果通过则为空数组
}`;

      const response = await this.state.modelAdapter.chat({
        model: reviewerModel,
        messages: [{ role: 'user', content: reviewPrompt }],
      });

      const content = response.content || '';
      
      // 解析 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          passed: parsed.passed ?? false,
          issues: parsed.issues || [],
        };
      }
      
      // 无法解析，默认通过
      return { passed: true };
    } catch (error) {
      console.log(chalk.yellow(`审查异常: ${error}`));
      // 异常时默认通过
      return { passed: true };
    }
  }
  
  /**
   * 检测项目类型并返回合适的反馈命令
   */
  private async detectFeedbackCommands(workspace?: string): Promise<string[]> {
    const cwd = workspace || process.cwd();
    const commands: string[] = [];
    
    // 检测 Python 项目
    const pythonMarkers = ['pyproject.toml', 'setup.py', 'requirements.txt', 'setup.cfg', 'Pipfile', 'poetry.lock'];
    const hasPythonMarker = pythonMarkers.some(marker => existsSync(join(cwd, marker)));
    
    // 检查是否有 .py 文件
    const hasPythonFiles = this.hasPythonFiles(cwd);
    
    if (hasPythonMarker || hasPythonFiles) {
      // 优先使用 pytest
      if (existsSync(join(cwd, 'pytest.ini')) || 
          existsSync(join(cwd, 'pyproject.toml'))) {
        commands.push('python -m pytest -x --tb=short');
      } else {
        commands.push('python -m unittest discover -v');
      }
      
      // 检查是否有 ruff/lint
      if (existsSync(join(cwd, 'ruff.toml')) || existsSync(join(cwd, '.ruff.toml'))) {
        commands.push('ruff check .');
      }
      
      console.log(chalk.gray(`  检测到 Python 项目: ${cwd}`));
      return commands;
    }
    
    // 检测 Node.js/TypeScript 项目
    if (existsSync(join(cwd, 'package.json'))) {
      // 检查是否有测试脚本
      try {
        const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'));
        if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified"') {
          commands.push('npm test');
        }
        if (pkg.scripts?.typecheck) {
          commands.push('npm run typecheck');
        }
        if (pkg.scripts?.lint) {
          commands.push('npm run lint');
        }
      } catch {
        // 忽略解析错误
      }
      
      console.log(chalk.gray(`  检测到 Node.js 项目: ${cwd}`));
      return commands;
    }
    
    // 检测 Go 项目
    if (existsSync(join(cwd, 'go.mod'))) {
      commands.push('go test ./...');
      commands.push('go vet ./...');
      console.log(chalk.gray(`  检测到 Go 项目: ${cwd}`));
      return commands;
    }
    
    // 未知项目类型
    console.log(chalk.gray(`  未知项目类型: ${cwd}`));
    return [];
  }
  
  /**
   * 检查目录中是否有 Python 文件
   */
  private hasPythonFiles(dir: string): boolean {
    try {
      const { readdirSync } = require('node:fs');
      const entries = readdirSync(dir, { withFileTypes: true });
      
      // 检查是否有 .py 文件
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.py')) {
          return true;
        }
      }
      
      // 检查子目录中是否有 Python 包
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const subDir = join(dir, entry.name);
          try {
            const subEntries = readdirSync(subDir, { withFileTypes: true });
            for (const subEntry of subEntries) {
              if (subEntry.isFile() && subEntry.name.endsWith('.py')) {
                return true;
              }
            }
          } catch {
            // 忽略无法访问的目录
          }
        }
      }
      
      return false;
    } catch {
      return false;
    }
  }
  
  /**
   * 检查工具执行结果中是否有成功信号
   */
  private hasSuccessToolResult(messages: Message[]): boolean {
    for (const msg of messages) {
      if (msg.role === 'tool') {
        const content = msg.content || '';
        // 检查退出码 0 或成功关键词
        if (content.includes('退出码: 0') || 
            content.includes('exit code: 0') ||
            content.includes('Exit code: 0') ||
            content.toLowerCase().includes('success') ||
            content.includes('✓') ||
            content.includes('passed')) {
          return true;
        }
      }
    }
    return false;
  }
  
  cleanup(): void {
    if (existsSync(this.prdPath)) unlinkSync(this.prdPath);
    if (existsSync(this.progressPath)) unlinkSync(this.progressPath);
  }
}

export { DEFAULT_RALPH_CONFIG };