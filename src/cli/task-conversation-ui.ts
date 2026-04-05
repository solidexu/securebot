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
  private _todos: string[] = [];  // 暂不显示，保留以备后用
  private context: string[] = [];
  private workspaceFiles: string[] = [];
  private isRunning: boolean = false;
  private inputBuffer: string = '';
  private messageCallback?: (message: string) => void;
  private scrollOffset: number = 0;
  private stdinHandler?: (key: string) => void;
  private renderTimer?: ReturnType<typeof setTimeout>;

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
    
    // 重要：不要 pause，让 readline 可以继续工作
    // 只需要移除监听器和恢复 raw mode
    process.stdin.resume();
  }

  onMessage(callback: (message: string) => void): void {
    this.messageCallback = callback;
  }

  addMessage(message: Message): void {
    this.messages.push(message);
    this.scheduleRender();
  }

  setTodos(todos: string[]): void {
    this._todos = todos;
  }

  setContext(context: string[]): void {
    this.context = context;
    this.scheduleRender();
  }

  updateWorkspace(): void {
    if (!this.taskInfo.workspace || !existsSync(this.taskInfo.workspace)) {
      this.workspaceFiles = [];
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

  private scheduleRender(): void {
    if (!this.isRunning) return;
    
    // 清除之前的渲染定时器
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
    }
    
    // 延迟 50ms 渲染，避免频繁重绘
    this.renderTimer = setTimeout(() => {
      if (this.isRunning) {
        this.render();
      }
    }, 50);
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
    const separator = '│';
    
    for (let row = 0; row < height; row++) {
      const leftContent = this.renderLeftContent(row, leftWidth, height);
      const rightContent = this.renderRightContent(row, rightWidth, height);
      
      // 确保左列和右列都是精确的宽度（不含 ANSI 码）
      const leftLine = leftContent.padEnd(leftWidth).slice(0, leftWidth);
      const rightLine = rightContent.padEnd(rightWidth).slice(0, rightWidth);
      
      lines.push(`${leftLine}${chalk.gray(separator)}${rightLine}`);
    }
    
    console.log(lines.join('\n'));
  }

  private renderLeftContent(row: number, width: number, totalHeight: number): string {
    const messageAreaHeight = totalHeight - 2;
    
    if (row === 0) {
      const title = ' 💬 对话 ';
      const dashes = '─'.repeat(Math.max(0, width - title.length - 2));
      return chalk.gray('─') + chalk.bold.white(title) + chalk.gray(dashes);
    }
    
    if (row < messageAreaHeight + 1) {
      const messageIndex = row - 1 + this.scrollOffset;
      if (messageIndex >= 0 && messageIndex < this.messages.length) {
        const msg = this.messages[messageIndex];
        if (msg) {
          return this.formatMessage(msg, width);
        }
      }
      return ' '.repeat(width);
    }
    
    return chalk.gray('─'.repeat(width));
  }

  private renderRightContent(row: number, width: number, _totalHeight: number): string {
    // 暂时不显示 TODO，因为验收标准太长
    const sections = [
      { title: '📝 Context', items: this.context },
      { title: '📁 工作目录', items: this.workspaceFiles },
    ];
    
    let currentRow = 0;
    
    for (const section of sections) {
      if (row === currentRow) {
        const title = ` ${section.title} `;
        const dashes = '─'.repeat(Math.max(0, width - title.length - 2));
        return chalk.gray('─') + chalk.bold.white(title) + chalk.gray(dashes);
      }
      currentRow++;
      
      const itemCount = section.items.length;
      for (let i = 0; i < Math.min(itemCount, 5); i++) {
        if (row === currentRow) {
          const rawItem = section.items[i] || '';
          // 截断到合适长度
          const maxLen = width - 4;
          const displayItem = rawItem.length > maxLen 
            ? rawItem.slice(0, maxLen - 3) + '...' 
            : rawItem;
          return `  ${displayItem}`;
        }
        currentRow++;
      }
      
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
    
    let prefixText: string;
    let prefixColored: string;
    let contentColor: (text: string) => string;
    
    if (msg.type === 'system') {
      prefixText = `[系统] ${time}`;
      prefixColored = chalk.gray(prefixText);
      contentColor = chalk.gray;
    } else if (msg.type === 'tool') {
      prefixText = `[工具] ${time}`;
      prefixColored = chalk.blue(prefixText);
      contentColor = chalk.blue;
    } else {
      prefixText = msg.sender === this.taskInfo.delegator ? 
               `[委托者] ${time}` : `[受托者] ${time}`;
      prefixColored = msg.sender === this.taskInfo.delegator ? 
               chalk.green(prefixText) : chalk.cyan(prefixText);
      contentColor = chalk.white;
    }
    
    // 使用纯文本长度计算剩余空间
    const maxContentLen = width - prefixText.length - 2;
    const content = msg.content.length > maxContentLen 
      ? msg.content.slice(0, maxContentLen - 3) + '...' 
      : msg.content;
    
    return `${prefixColored} ${contentColor(content)}`;
  }

  private renderInputArea(width: number): void {
    console.log(chalk.cyan('─'.repeat(width)));
    
    // 根据状态显示不同提示
    let hint = '输入消息（Enter发送，Esc/Ctrl+C退出）';
    if (this.taskInfo.status === 'failed') {
      hint = '输入消息 | /retry 重试（Esc/Ctrl+C退出）';
    } else if (this.taskInfo.status === 'pending') {
      hint = '输入消息 | @受托者 自动接受（Esc/Ctrl+C退出）';
    }
    
    console.log(chalk.yellow(`  ${hint}:`));
    
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

        // 处理普通字符（包括中文多字节）
        if (key.charCodeAt(0) >= 32 || key.length > 1) {
          this.inputBuffer += key;
          
          if (this.renderTimer) {
            clearTimeout(this.renderTimer);
          }
          
          this.renderTimer = setTimeout(() => {
            if (this.isRunning) {
              this.render();
            }
          }, 30);
        }
      };

      process.stdin.on('data', this.stdinHandler);
    });
  }
}