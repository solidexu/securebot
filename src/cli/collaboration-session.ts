import chalk from 'chalk';
import * as readline from 'node:readline';
import { EventEmitter } from 'node:events';

export interface CollaborationMessage {
  role: 'delegator' | 'delegatee' | 'system' | 'tool' | 'result';
  content: string;
  timestamp: number;
  metadata?: any;
}

export class CollaborationSession extends EventEmitter {
  private messages: CollaborationMessage[] = [];
  private rl?: readline.Interface;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private interventionQueue: string[] = [];
  
  constructor(
    private options: {
      taskId: string;
      delegator: string;
      delegatee: string;
      task: string;
      workspace?: string;
    }
  ) {
    super();
  }
  
  start(): void {
    this.isRunning = true;
    this.messages = [];
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    this.setupKeyboardHandler();
    this.render();
    
    this.addMessage('system', `协作会话已建立`);
    this.addMessage('system', `委托者: ${this.options.delegator} | 被委托者: ${this.options.delegatee}`);
    this.addMessage('system', `任务: ${this.options.task}`);
    if (this.options.workspace) {
      this.addMessage('system', `共享空间: ${this.options.workspace}`);
    }
  }
  
  stop(): void {
    this.isRunning = false;
    
    if (this.keyboardHandler) {
      process.stdin.removeListener('data', this.keyboardHandler);
      this.keyboardHandler = undefined;
    }
    
    if (this.rl) {
      this.rl.close();
      this.rl = undefined;
    }
    
    try {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.resume();
    } catch (error) {
      // 忽略错误
    }
  }
  
  private keyboardHandler?: (key: string) => void;
  
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
      
      // Ctrl+C: 结束会话
      if (key === '\u0003') {
        this.emit('abort');
        this.stop();
        return;
      }
      
      // P: 暂停/继续
      if (key === 'p' || key === 'P') {
        this.isPaused = !this.isPaused;
        this.render();
        if (this.isPaused) {
          this.emit('pause');
          this.handleIntervention();
        } else {
          this.emit('resume');
        }
        return;
      }
    };
    
    process.stdin.on('data', this.keyboardHandler);
  }
  
  private async handleIntervention(): Promise<void> {
    this.render();
    console.log(chalk.yellow('\n💡 会话已暂停，你可以输入指导意见:'));
    
    // 恢复正常输入模式
    try {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    } catch (error) {
      // 忽略
    }
    
    const intervention = await this.rl?.question(chalk.yellow('输入指导 (直接回车继续执行): '));
    
    if (intervention && intervention.trim()) {
      this.addMessage('delegator', intervention.trim());
      this.interventionQueue.push(intervention.trim());
      this.emit('intervention', intervention.trim());
    }
    
    this.isPaused = false;
    
    // 重新设置键盘监听
    this.setupKeyboardHandler();
    this.render();
  }
  
  addMessage(role: CollaborationMessage['role'], content: string, metadata?: any): void {
    const message: CollaborationMessage = {
      role,
      content,
      timestamp: Date.now(),
      metadata,
    };
    
    this.messages.push(message);
    this.emit('message', message);
    this.render();
  }
  
  getInterventions(): string[] {
    const interventions = [...this.interventionQueue];
    this.interventionQueue = [];
    return interventions;
  }
  
  hasIntervention(): boolean {
    return this.interventionQueue.length > 0;
  }
  
  isPausedState(): boolean {
    return this.isPaused;
  }
  
  private render(): void {
    if (!this.isRunning) return;
    
    console.clear();
    console.log(chalk.cyan.bold('\n🤝 协作会话'));
    console.log(chalk.cyan.bold('═'.repeat(70)));
    console.log(chalk.white(`  任务: ${this.options.task.slice(0, 50)}...`));
    console.log(chalk.gray(`  ID: ${this.options.taskId.slice(0, 8)} | 委托者: ${this.options.delegator} | 被委托者: ${this.options.delegatee}`));
    console.log(chalk.cyan.bold('═'.repeat(70)));
    
    // 显示最近的消息
    const recentMessages = this.messages.slice(-15);
    
    for (const msg of recentMessages) {
      const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN');
      const prefix = this.getMessagePrefix(msg.role);
      const color = this.getMessageColor(msg.role);
      
      const lines = msg.content.split('\n');
      for (const line of lines) {
        console.log(color(`${prefix} ${line}`));
      }
    }
    
    console.log(chalk.gray('─'.repeat(70)));
    console.log(chalk.gray('  P = 暂停并输入指导 | Ctrl+C = 结束会话'));
    if (this.isPaused) {
      console.log(chalk.yellow.bold('  ⏸ 已暂停'));
    }
    console.log();
  }
  
  private getMessagePrefix(role: CollaborationMessage['role']): string {
    switch (role) {
      case 'delegator':
        return '[委托者]';
      case 'delegatee':
        return '[被委托者]';
      case 'system':
        return '[系统]';
      case 'tool':
        return '[工具]';
      case 'result':
        return '[结果]';
      default:
        return '[未知]';
    }
  }
  
  private getMessageColor(role: CollaborationMessage['role']): chalk.Chalk {
    switch (role) {
      case 'delegator':
        return chalk.magenta;
      case 'delegatee':
        return chalk.cyan;
      case 'system':
        return chalk.gray;
      case 'tool':
        return chalk.yellow;
      case 'result':
        return chalk.green;
      default:
        return chalk.white;
    }
  }
}