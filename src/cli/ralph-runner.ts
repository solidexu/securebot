/**
 * Ralph Loop 独立运行器
 * 
 * 用于后台执行 Ralph 任务，可独立运行
 * 
 * 用法: node dist/cli/ralph-runner.js --task "任务描述" --iterations 20
 */

import chalk from 'chalk';
import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const program = new Command();

program
  .name('ralph-runner')
  .description('Ralph Loop 后台运行器')
  .requiredOption('--task <task>', '任务描述')
  .option('--iterations <n>', '最大迭代次数', '20')
  .option('--agent <id>', 'Agent ID', 'dev')
  .option('--notify', '完成后发送通知', false)
  .option('--session <key>', '会话密钥（用于通知）')
  .parse(process.argv);

const options = program.opts();

// ============ 目录配置 ============

const SECUREBOT_DIR = join(homedir(), '.securebot');
const DAEMON_DIR = join(SECUREBOT_DIR, '.daemon');
const LOG_FILE = join(DAEMON_DIR, `ralph-${Date.now()}.log`);

// 确保目录存在
if (!existsSync(DAEMON_DIR)) {
  mkdirSync(DAEMON_DIR, { recursive: true });
}

// ============ 日志函数 ============

function log(message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  appendFileSync(LOG_FILE, line);
  console.log(message);
}

// ============ 主函数 ============

async function main(): Promise<void> {
  const taskId = `ralph-${Date.now()}`;
  
  log(chalk.cyan.bold('🔄 Ralph Loop 后台运行器'));
  log(chalk.gray(`任务 ID: ${taskId}`));
  log(chalk.gray(`任务描述: ${options.task}`));
  log(chalk.gray(`最大迭代: ${options.iterations}`));
  log(chalk.gray(`Agent: ${options.agent}`));
  log('');
  
  try {
    // 动态导入模块
    const { loadConfig } = await import('../core/config.js');
    const { createAgents } = await import('../core/agent.js');
    const { createOllamaAdapter } = await import('../model/ollama.js');
    const { RalphExecutor } = await import('../ralph/index.js');
    
    // 加载配置
    const config = loadConfig();
    const agents = createAgents(config);
    const modelAdapter = createOllamaAdapter({
      baseUrl: config.model.baseUrl || 'http://localhost:11434',
    });
    
    // 创建状态
    const state = {
      config,
      agents,
      modelAdapter,
      tools: new Map(),
      currentAgentId: options.agent,
      running: true,
      interrupted: false,
      executing: false,
      abortController: new AbortController(),
    };
    
    // 创建 readline 接口
    const rl = readline.createInterface({ input, output });
    
    // 创建执行器
    const executor = new RalphExecutor(state, rl);
    
    // 运行 Ralph Loop
    const result = await executor.run({
      taskDescription: options.task,
      maxIterations: parseInt(options.iterations, 10),
    });
    
    rl.close();
    
    // 保存结果
    const resultPath = join(DAEMON_DIR, `${taskId}-result.json`);
    writeFileSync(resultPath, JSON.stringify(result, null, 2));
    
    log('');
    log(chalk.green.bold('✓ Ralph Loop 完成'));
    log(chalk.gray(`结果: ${result.success ? '成功' : '失败'}`));
    log(chalk.gray(`迭代次数: ${result.iterations}`));
    log(chalk.gray(`完成任务: ${result.completedStories}/${result.totalStories}`));
    log(chalk.gray(`结果文件: ${resultPath}`));
    
    // 更新任务状态
    const taskInfo = {
      id: taskId,
      startTime: Date.now(),
      endTime: Date.now(),
      task: options.task,
      status: result.success ? 'completed' : 'failed',
      result,
      logFile: LOG_FILE,
    };
    
    const taskFile = join(DAEMON_DIR, `${taskId}.json`);
    writeFileSync(taskFile, JSON.stringify(taskInfo, null, 2));
    
    // 发送通知
    if (options.notify && options.session) {
      await sendNotification(options.session);
    }
    
    process.exit(result.success ? 0 : 1);
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(chalk.red(`错误: ${errorMsg}`));
    
    // 保存错误信息
    const taskInfo = {
      id: taskId,
      startTime: Date.now(),
      endTime: Date.now(),
      task: options.task,
      status: 'failed',
      error: errorMsg,
      logFile: LOG_FILE,
    };
    
    const taskFile = join(DAEMON_DIR, `${taskId}.json`);
    writeFileSync(taskFile, JSON.stringify(taskInfo, null, 2));
    
    process.exit(1);
  }
}

/**
 * 发送完成通知
 */
async function sendNotification(sessionKey: string): Promise<void> {
  try {
    // 使用 OpenClaw 的 message 工具发送通知
    const response = await fetch('http://localhost:3000/api/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionKey,
        message: '📊 Ralph 任务完成\n\n请查看结果: /ralph status',
      }),
    });
    
    if (response.ok) {
      log(chalk.gray(`通知已发送到会话: ${sessionKey}`));
    } else {
      log(chalk.yellow(`通知发送失败: HTTP ${response.status}`));
    }
  } catch (error) {
    // OpenClaw 服务可能未运行，忽略错误
    log(chalk.gray(`通知跳过: OpenClaw 服务未运行`));
  }
}

// 运行
main().catch(error => {
  console.error(chalk.red(`Fatal error: ${error}`));
  process.exit(1);
});