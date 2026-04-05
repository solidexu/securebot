import chalk from 'chalk';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  type: 'user' | 'system' | 'tool';
}

export interface TaskInfo {
  id: string;
  task: string;
  status: string;
  delegator: string;
  delegatee: string;
  workspace?: string;
}

export class TaskConversationUI {
  private messages: Message[] = [];
  private taskInfo: TaskInfo;
  private todos: string[] = [];
  private context: string[] = [];
  private workspaceFiles: string[] = [];
  private isRunning: boolean = false;
  private inputBuffer: string = '';
  private messageCallback?: (message: string) => void;
  private scrollOffset: number = 0;
  private stdinHandler?: (key: string) => void;

  constructor(taskInfo: TaskInfo) {
    this.taskInfo = taskInfo;
  }

  async start(): Promise<void> {
    this.isRunning = true;
    
    // 初始化工作目录（如果设置了 workspace）
    if (this.taskInfo.workspace && existsSync(this.taskInfo.workspace)) {
      try {
        const items = readdirSync(this.taskInfo.workspace);
        this.workspaceFiles = items.filter(item => {
          return !item.startsWith('.') && !item.startsWith('__pycache__');
        }).map(item => {
          const itemPath = join(this.taskInfo.workspace!, item);
          const stat = statSync(itemPath);
          const icon = stat.isDirectory() ? '📁' : '📄';
          return `${icon} ${item}`;
        });
      } catch {
        this.workspaceFiles = [];
      }
    }
    
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    // 隐藏终端光标
    process.stdout.write('\u001b[?25l');

    this.render();
    await this.inputLoop();
  }

  stop(): void {
    this.isRunning = false;
    
    // 显示终端光标
    process.stdout.write('\u001b[?25h');
    
    if (this.stdinHandler) {
      process.stdin.removeListener('data', this.stdinHandler);
      this.stdinHandler = undefined;
    }
    
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  }

  onMessage(callback: (message: string) => void): void {
    this.messageCallback = callback;
  }

  addMessage(message: Message): void {
    this.messages.push(message);
    if (this.isRunning) {
      this.render();
    }
  }

  setTodos(todos: string[]): void {
    this.todos = todos;
    if (this.isRunning) {
      this.render();
    }
  }

  setContext(context: string[]): void {
    this.context = context;
    if (this.isRunning) {
      this.render();
    }
  }

  updateWorkspace(): void {
    if (!this.taskInfo.workspace || !existsSync(this.taskInfo.workspace)) {
      this.workspaceFiles = [];
      if (this.isRunning) {
        this.render();
      }
      return;
    }

    try {
      const items = readdirSync(this.taskInfo.workspace);
      this.workspaceFiles = items.filter(item => {
        return !item.startsWith('.') && !item.startsWith('__pycache__');
      }).map(item => {
        const itemPath = join(this.taskInfo.workspace!, item);
        const stat = statSync(itemPath);
        const icon = stat.isDirectory() ? '📁' : '📄';
        return `${icon} ${item}`;
      });
    } catch {
      this.workspaceFiles = [];
    }
    
    if (this.isRunning) {
      this.render();
    }
  }

  private render(): void {
    // 清屏
    console.clear();
    
    // 计算终端尺寸
    const terminalWidth = process.stdout.columns || 120;
    const terminalHeight = process.stdout.rows || 40;
    
    // 左右分屏宽度
    const leftWidth = Math.floor(terminalWidth * 0.6);
    const rightWidth = terminalWidth - leftWidth - 3; // -3 for separators
    
    // 标题栏
    this.renderTitleBar(terminalWidth);
    
    // 主内容区域
    this.renderMainContent(leftWidth, rightWidth, terminalHeight - 4);
    
    // 输入区域
    this.renderInputArea(terminalWidth);
  }

  private renderTitleBar(width: number): void {
    console.log(chalk.cyan('═'.repeat(width)));
    console.log(chalk.bold.cyan(`  任务对话: ${this.taskInfo.task.slice(0, 50)}...`));
    console.log(chalk.cyan('═'.repeat(width)));
  }

  private renderMainContent(leftWidth: number, rightWidth: number, height: number): void {
    const lines: string[] = [];
    
    // 渲染每一行
    for (let row = 0; row < height; row++) {
      const leftContent = this.renderLeftContent(row, leftWidth, height);
      const rightContent = this.renderRightContent(row, rightWidth, height);
      const separator = chalk.gray('│');
      
      lines.push(`${leftContent}${separator}${rightContent}`);
    }
    
    console.log(lines.join('\n'));
  }

  private renderLeftContent(row: number, width: number, totalHeight: number): string {
    // 计算消息显示区域
    const messageAreaHeight = totalHeight - 2;
    
    if (row === 0) {
      // 对话标题
      const title = chalk.bold.white(' 💬 对话 ');
      const padding = width - title.length - 2;
      return chalk.gray('─') + title + chalk.gray('─'.repeat(Math.max(0, padding)));
    }
    
    if (row < messageAreaHeight + 1) {
      // 消息内容
      const messageIndex = row - 1 + this.scrollOffset;
      if (messageIndex >= 0 && messageIndex < this.messages.length) {
        const msg = this.messages[messageIndex];
        if (msg) {
          return this.formatMessage(msg, width);
        }
      }
      return ' '.repeat(width);
    }
    
    // 底部分隔线
    return chalk.gray('─'.repeat(width));
  }

  private renderRightContent(row: number, width: number, _totalHeight: number): string {
    const sections = [
      { title: '📋 TODO', items: this.todos },
      { title: '📝 Context', items: this.context },
      { title: '📁 工作目录', items: this.workspaceFiles },
    ];
    
    let currentRow = 0;
    
    for (const section of sections) {
      // 标题行
      if (row === currentRow) {
        const title = chalk.bold.white(` ${section.title} `);
        const padding = width - title.length - 2;
        return chalk.gray('─') + title + chalk.gray('─'.repeat(Math.max(0, padding)));
      }
      currentRow++;
      
      // 内容行
      const itemCount = section.items.length;
      for (let i = 0; i < Math.min(itemCount, 5); i++) {
        if (row === currentRow) {
          const item = `  ${section.items[i]}`;
          return chalk.gray(item.slice(0, width - 1).padEnd(width));
        }
        currentRow++;
      }
      
      // 空行间隔
      if (row === currentRow) {
        return ' '.repeat(width);
      }
      currentRow++;
    }
    
    return ' '.repeat(width);
  }

  private formatMessage(msg: Message, width: number): string {
    const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    let prefix: string;
    let contentColor: (text: string) => string;
    
    if (msg.type === 'system') {
      prefix = chalk.gray(`[系统] ${time}`);
      contentColor = chalk.gray;
    } else if (msg.type === 'tool') {
      prefix = chalk.blue(`[工具] ${time}`);
      contentColor = chalk.blue;
    } else {
      prefix = msg.sender === this.taskInfo.delegator ? 
               chalk.green(`[委托者] ${time}`) :
               chalk.cyan(`[受托者] ${time}`);
      contentColor = chalk.white;
    }
    
    const content = msg.content.slice(0, width - prefix.length - 3);
    return `${prefix} ${contentColor(content)}`;
  }

  private renderInputArea(width: number): void {
    console.log(chalk.cyan('─'.repeat(width)));
    console.log(chalk.yellow('  输入消息（Enter发送，Esc/Ctrl+C退出）:'));
    
    const prompt = chalk.bold.green('> ');
    const inputLine = this.inputBuffer + '█';
    console.log(prompt + inputLine);
  }

  private async inputLoop(): Promise<void> {
    return new Promise((resolve) => {
      if (!process.stdin.isTTY) {
        resolve();
        return;
      }

      // SIGINT 信号处理（Ctrl+C）
      const sigintHandler = () => {
        this.stop();
        resolve();
      };
      process.once('SIGINT', sigintHandler);

      this.stdinHandler = (key: string) => {
        if (!this.isRunning) {
          process.stdin.removeListener('data', this.stdinHandler!);
          process.removeListener('SIGINT', sigintHandler);
          resolve();
          return;
        }

        // Ctrl+C (SIGINT 在 raw mode 下也会发送 \u0003)
        if (key === '\u0003' || key === '\u001b') {
          this.stop();
          process.removeListener('SIGINT', sigintHandler);
          resolve();
          return;
        }

        if (key === '\r' || key === '\n') {
          if (this.inputBuffer.trim() && this.messageCallback) {
            this.messageCallback(this.inputBuffer.trim());
            this.inputBuffer = '';
            this.render();
          }
          return;
        }

        if (key === '\u007f' || key === '\b') {
          this.inputBuffer = this.inputBuffer.slice(0, -1);
          this.render();
          return;
        }

        if (key.length === 1 && key.charCodeAt(0) >= 32) {
          this.inputBuffer += key;
          this.render();
        }
      };

      process.stdin.on('data', this.stdinHandler);
    });
  }
}