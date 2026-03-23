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
import type { ReplState, ModelAdapter, ChatParams } from '../core/types.js';
import type { RalphPRD, RalphStory, RalphProgress, RalphConfig, RalphResult, RalphIteration, RalphModeOptions } from './types.js';
import { getDefaultAgent } from '../core/agent.js';

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
2. 运行必要的测试和类型检查
3. 如果所有任务都已完成，输出 ${completionPromise}

注意：每次只完成一个任务，完成后停止等待下一轮迭代。
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
  
  constructor(state: ReplState, config: Partial<RalphConfig> = {}) {
    this.state = state;
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
    console.log();
    
    // 1. 创建 PRD
    console.log(chalk.cyan('📋 正在创建任务列表...'));
    const model = this.state.config.model.model || 'qwen3.5:35b-a3b';
    let prd = await createPRDFromDescription(taskDescription, this.state.modelAdapter, model);
    
    savePRD(this.prdPath, prd);
    initProgressFile(this.progressPath);
    
    console.log(chalk.green(`✓ 已创建 ${prd.userStories.length} 个任务`));
    this.printTaskList(prd);
    console.log();
    
    // 2. 开始循环
    let iterations = 0;
    const startTime = Date.now();
    
    while (iterations < maxIterations) {
      iterations++;
      prd = loadPRD(this.prdPath) ?? prd;
      
      if (allTasksComplete(prd)) {
        console.log(chalk.green.bold('\n🎉 所有任务已完成！'));
        return this.buildResult(true, iterations, prd, 'all_tasks_complete');
      }
      
      const task = getNextTask(prd);
      if (!task) break;
      
      console.log(chalk.cyan.bold(`\n═══ 迭代 ${iterations}/${maxIterations} ═══`));
      console.log(chalk.white(`📋 任务: ${task.id} - ${task.title}`));
      console.log(chalk.gray(`验收标准: ${task.acceptanceCriteria.join(', ')}`));
      console.log();
      
      const result = await this.runIteration(task, iterations);
      
      if (result.passed) {
        updateStoryStatus(prd, task.id, true, result.output?.slice(0, 200));
        savePRD(this.prdPath, prd);
        appendProgress(this.progressPath, {
          timestamp: new Date().toISOString(),
          storyId: task.id,
          storyTitle: task.title,
          completed: result.output || '完成',
        });
        console.log(chalk.green(`✓ 任务 ${task.id} 完成`));
      } else {
        console.log(chalk.yellow(`⚠ 任务 ${task.id} 未完成，将在下一轮重试`));
        if (result.error) {
          appendProgress(this.progressPath, {
            timestamp: new Date().toISOString(),
            storyId: task.id,
            storyTitle: task.title,
            completed: '未完成',
            issues: [result.error],
          });
        }
      }
      
      if (result.output?.includes(this.config.completionPromise)) {
        console.log(chalk.green.bold('\n🎉 检测到完成信号'));
        return this.buildResult(true, iterations, prd, 'completion_promise_detected');
      }
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(chalk.yellow.bold(`\n⚠️ 达到最大迭代次数 (${maxIterations})`));
    console.log(chalk.gray(`总耗时: ${duration}秒`));
    
    return this.buildResult(false, iterations, prd, 'max_iterations_reached');
  }
  
  /**
   * 执行单次迭代（占位实现）
   */
  private async runIteration(task: RalphStory, iteration: number): Promise<RalphIteration> {
    const startTime = Date.now();
    
    try {
      const agent = this.state.agents.get(this.state.currentAgentId) ?? getDefaultAgent(this.state.agents);
      if (!agent) throw new Error('找不到 Agent');
      
      // TODO: 集成 processMessage 执行实际任务
      return {
        iteration,
        currentStory: task,
        output: `执行任务: ${task.title}`,
        passed: true,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        iteration,
        currentStory: task,
        error: error instanceof Error ? error.message : String(error),
        passed: false,
        duration: Date.now() - startTime,
      };
    }
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
  
  cleanup(): void {
    if (existsSync(this.prdPath)) unlinkSync(this.prdPath);
    if (existsSync(this.progressPath)) unlinkSync(this.progressPath);
  }
}

export { DEFAULT_RALPH_CONFIG };