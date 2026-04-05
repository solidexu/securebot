import chalk from 'chalk';
import * as readline from 'node:readline';
import { EventEmitter } from 'node:events';

export interface TaskEvent {
  type: 'start' | 'tool_call' | 'tool_result' | 'message' | 'error' | 'complete' | 'status_change';
  timestamp: number;
  data: any;
}

export interface TaskMonitorOptions {
  taskId: string;
  delegator: string;
  delegatee: string;
  task: string;
}

export class TaskMonitor extends EventEmitter {
  private events: TaskEvent[] = [];
  private rl?: readline.Interface;
  private isPaused: boolean = false;
  private isRunning: boolean = false;
  private userIntervention: string | null = null;
  private shouldCancel: boolean = false;
  private keyboardHandler?: (key: string) => void;
  
  constructor(private options: TaskMonitorOptions) {
    super();
  }
  
  start(): void {
    this.isRunning = true;
    this.isPaused = false;
    this.shouldCancel = false;
    this.events = [];
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    this.setupKeyboardHandler();
    this.render();
    
    this.addEvent('start', {
      delegator: this.options.delegator,
      delegatee: this.options.delegatee,
      task: this.options.task
    });
  }
  
  stop(): void {
    this.isRunning = false;
    
    // 先移除键盘事件监听器
    if (this.keyboardHandler) {
      process.stdin.removeListener('data', this.keyboardHandler);
      this.keyboardHandler = undefined;
    }
    
    // 关闭 readline 接口
    if (this.rl) {
      this.rl.close();
      this.rl = undefined;
    }
    
    // 恢复 stdin 设置
    try {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      // 清空输入缓冲区
      process.stdin.pause();
      process.stdin.resume();
    } catch (error) {
      // 忽略错误
    }
  }
  
  addEvent(type: TaskEvent['type'], data: any): void {
    const event: TaskEvent = {
      type,
      timestamp: Date.now(),
      data
    };
    this.events.push(event);
    this.render();
  }
  
  private setupKeyboardHandler(): void {
    if (!this.rl) return;
    
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    this.keyboardHandler = (key: string) => {
      if (!this.isRunning) {
        process.stdin.removeListener('data', this.keyboardHandler!);
        return;
      }
      
      if (key === 'p' || key === 'P') {
        this.isPaused = !this.isPaused;
        this.render();
        
        if (this.isPaused) {
          this.emit('pause');
          this.handleIntervention();
        } else {
          this.emit('resume');
        }
      } else if (key === 'c' || key === 'C') {
        if (this.isPaused) {
          this.shouldCancel = true;
          this.emit('cancel');
          this.render();
        }
      } else if (key === '\u0003') {
        this.shouldCancel = true;
        this.emit('cancel');
        process.exit();
      }
    };
    
    process.stdin.on('data', this.keyboardHandler);
  }
  
  private async handleIntervention(): Promise<void> {
    if (!this.rl) return;
    
    this.render();
    console.log();
    console.log(chalk.yellow('━'.repeat(60)));
    console.log(chalk.yellow.bold('  任务已暂停 - 人工介入模式'));
    console.log(chalk.yellow('━'.repeat(60)));
    console.log();
    console.log(chalk.gray('  当前任务状态:'));
    
    const recentEvents = this.events.slice(-5);
    for (const event of recentEvents) {
      console.log(chalk.gray(`    ${this.formatEventBrief(event)}`));
    }
    
    console.log();
    console.log(chalk.cyan('  选项:'));
    console.log(chalk.gray('    1. 输入指导意见（回车提交，空回车继续执行）'));
    console.log(chalk.gray('    2. 输入 "cancel" 取消任务'));
    console.log(chalk.gray('    3. 按 "P" 继续执行'));
    console.log();
    
    try {
      process.stdin.setRawMode(false);
      process.stdin.resume();
      
      const answer = await this.question(chalk.yellow('  请输入指导意见: '));
      
      if (answer.toLowerCase() === 'cancel') {
        this.shouldCancel = true;
        this.emit('cancel');
        console.log(chalk.red('\n  任务已取消'));
      } else if (answer.trim()) {
        this.userIntervention = answer;
        this.emit('intervention', answer);
        console.log(chalk.green('\n  指导意见已记录，将继续执行'));
        this.isPaused = false;
      } else {
        console.log(chalk.gray('\n  继续执行任务'));
        this.isPaused = false;
      }
      
      process.stdin.setRawMode(true);
      process.stdin.resume();
      this.render();
    } catch (error) {
      // 忽略错误，确保恢复状态
      this.isPaused = false;
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }
  }
  
  private question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      if (!this.rl) {
        resolve('');
        return;
      }
      this.rl.question(prompt, resolve);
    });
  }
  
  getUserIntervention(): string | null {
    const intervention = this.userIntervention;
    this.userIntervention = null;
    return intervention;
  }
  
  isCancelled(): boolean {
    return this.shouldCancel;
  }
  
  isTaskPaused(): boolean {
    return this.isPaused;
  }
  
  private render(): void {
    if (!this.isRunning) return;
    
    console.clear();
    
    const time = new Date().toLocaleTimeString('zh-CN');
    
    console.log(chalk.cyan('═'.repeat(70)));
    console.log(chalk.cyan.bold('  🔧 任务执行监控面板'));
    console.log(chalk.cyan('═'.repeat(70)));
    console.log();
    
    console.log(chalk.white(`  任务ID: ${chalk.blue(this.options.taskId.slice(0, 12))}`));
    console.log(chalk.white(`  委托者: ${chalk.magenta(this.options.delegator)} → 被委托者: ${chalk.green(this.options.delegatee)}`));
    console.log(chalk.white(`  时间: ${chalk.gray(time)}`));
    console.log();
    console.log(chalk.white(`  任务: ${chalk.yellow(this.options.task.slice(0, 80))}${this.options.task.length > 80 ? '...' : ''}`));
    console.log();
    
    if (this.isPaused) {
      console.log(chalk.yellow.bold('  ⏸  任务已暂停'));
      console.log();
    }
    
    console.log(chalk.cyan('─'.repeat(70)));
    console.log(chalk.cyan.bold('  执行过程'));
    console.log(chalk.cyan('─'.repeat(70)));
    
    const recentEvents = this.events.slice(-15);
    for (const event of recentEvents) {
      console.log(this.formatEvent(event));
    }
    
    if (this.events.length > 15) {
      console.log(chalk.gray(`  ... 省略了 ${this.events.length - 15} 条历史事件`));
    }
    
    console.log();
    console.log(chalk.cyan('─'.repeat(70)));
    console.log(chalk.gray('  按 "P" 暂停/继续  |  暂停后可输入指导意见或取消任务'));
    console.log(chalk.cyan('═'.repeat(70)));
  }
  
  private formatEvent(event: TaskEvent): string {
    const time = new Date(event.timestamp).toLocaleTimeString('zh-CN');
    const timeStr = chalk.gray(`[${time}]`);
    
    switch (event.type) {
      case 'start':
        return `  ${timeStr} ${chalk.green('▶')} 任务开始`;
      
      case 'tool_call':
        return `  ${timeStr} ${chalk.blue('🔧')} 调用工具: ${chalk.cyan(event.data.tool)}`;
      
      case 'tool_result':
        const success = event.data.success;
        const icon = success ? chalk.green('✓') : chalk.red('✗');
        const result = event.data.result || event.data.error || '';
        const preview = result.slice(0, 100);
        return `  ${timeStr} ${icon} 工具结果: ${chalk.gray(preview)}${result.length > 100 ? '...' : ''}`;
      
      case 'message':
        const role = event.data.role;
        const content = event.data.content?.slice(0, 100) || '';
        const roleIcon = role === 'user' ? chalk.yellow('👤') : 
                        role === 'assistant' ? chalk.blue('🤖') : 
                        role === 'system' ? chalk.gray('⚙️') : chalk.gray('💬');
        return `  ${timeStr} ${roleIcon} ${chalk.gray(content)}${event.data.content?.length > 100 ? '...' : ''}`;
      
      case 'status_change':
        return `  ${timeStr} ${chalk.yellow('🔄')} 状态: ${chalk.cyan(event.data.from)} → ${chalk.cyan(event.data.to)}`;
      
      case 'error':
        return `  ${timeStr} ${chalk.red('❌')} 错误: ${chalk.red(event.data.error)}`;
      
      case 'complete':
        return `  ${timeStr} ${chalk.green('✓')} 任务完成`;
      
      default:
        return `  ${timeStr} ${chalk.gray('•')} ${event.type}`;
    }
  }
  
  private formatEventBrief(event: TaskEvent): string {
    switch (event.type) {
      case 'start':
        return '任务开始';
      case 'tool_call':
        return `调用工具: ${event.data.tool}`;
      case 'tool_result':
        return event.data.success ? '工具成功' : '工具失败';
      case 'message':
        return `${event.data.role}: ${event.data.content?.slice(0, 30)}...`;
      case 'error':
        return `错误: ${event.data.error}`;
      case 'complete':
        return '任务完成';
      default:
        return event.type;
    }
  }
  
  getEvents(): TaskEvent[] {
    return this.events;
  }
}