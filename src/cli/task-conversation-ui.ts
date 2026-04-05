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

const MAX_MESSAGES = 500;
const MIN_RENDER_INTERVAL = 300;  // 最小渲染间隔（毫秒）

export class TaskConversationUI {
  private messages: Message[] = [];
  private taskInfo: TaskInfo;
  private context: string[] = [];
  private workspaceFiles: string[] = [];
  private isRunning: boolean = false;
  private inputBuffer: string = '';
  private messageCallback?: (message: string) => void;
  private scrollOffset: number = 0;
  private stdinHandler?: (key: string) => void;
  private renderTimer?: ReturnType<typeof setTimeout>;
  private selectedParticipant: 'delegator' | 'delegatee' | null = null;
  private currentUserId: string;
  private messageAreaHeight: number = 0;
  private lastRenderTime: number = 0;  // 上次渲染时间
  private pendingMessages: Message[] = [];  // 待渲染消息队列

  constructor(taskInfo: TaskInfo, currentUserId?: string) {
    this.taskInfo = taskInfo;
    this.currentUserId = currentUserId || taskInfo.delegator;
  }

  async start(): Promise<void> {
    this.isRunning = true;
    
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
    
    // 滚动到最新消息
    this.scrollToBottom();
    
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    process.stdout.write('\u001b[?25l');

    this.render();
    await this.inputLoop();
  }

  stop(): void {
    this.isRunning = false;
    
    process.stdout.write('\u001b[?25h');
    
    if (this.stdinHandler) {
      process.stdin.removeListener('data', this.stdinHandler);
      this.stdinHandler = undefined;
    }
    
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    
    process.stdin.resume();
  }

  onMessage(callback: (message: string) => void): void {
    this.messageCallback = callback;
  }

  addMessage(message: Message): void {
    this.messages.push(message);
    this.pendingMessages.push(message);
    
    if (this.messages.length > MAX_MESSAGES) {
      this.messages = this.messages.slice(-MAX_MESSAGES);
    }
    
    this.scrollToBottom();
    this.scheduleRender();
  }

  setTodos(_todos: string[]): void {
    // 保留接口兼容性
  }

  setContext(context: string[]): void {
    this.context = context;
    const statusLine = context.find(c => c.startsWith('状态:'));
    if (statusLine) {
      this.taskInfo.status = statusLine.replace('状态:', '').trim();
    }
    // context 变化不立即渲染，等待下次消息更新
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
  }

  private scrollToBottom(): void {
    this.scrollOffset = Math.max(0, this.messages.length - this.messageAreaHeight);
  }

  private scrollUp(lines: number = 3): void {
    this.scrollOffset = Math.max(0, this.scrollOffset - lines);
  }

  private scrollDown(lines: number = 3): void {
    const maxOffset = Math.max(0, this.messages.length - this.messageAreaHeight);
    this.scrollOffset = Math.min(maxOffset, this.scrollOffset + lines);
  }

  private scheduleRender(): void {
    if (!this.isRunning) return;
    
    const now = Date.now();
    const timeSinceLastRender = now - this.lastRenderTime;
    
    // 如果距离上次渲染时间太短，延迟渲染
    if (timeSinceLastRender < MIN_RENDER_INTERVAL) {
      if (this.renderTimer) {
        clearTimeout(this.renderTimer);
      }
      
      this.renderTimer = setTimeout(() => {
        if (this.isRunning) {
          this.render();
          this.pendingMessages = [];
        }
      }, MIN_RENDER_INTERVAL - timeSinceLastRender);
    } else {
      // 立即渲染
      if (this.renderTimer) {
        clearTimeout(this.renderTimer);
      }
      this.render();
      this.pendingMessages = [];
    }
  }

  private render(): void {
    this.lastRenderTime = Date.now();
    
    const output: string[] = [];
    const width = process.stdout.columns || 120;
    const height = process.stdout.rows || 40;
    
    const leftWidth = Math.floor(width * 0.70);
    const rightWidth = width - leftWidth - 1;
    
    output.push(this.renderHeader(leftWidth));
    
    const contentHeight = height - 5;
    this.messageAreaHeight = contentHeight - 2;
    
    for (let row = 0; row < contentHeight; row++) {
      const leftLine = this.renderConversationLine(row, leftWidth, contentHeight);
      const rightLine = this.renderSidebarLine(row, rightWidth);
      output.push(leftLine + chalk.gray('│') + rightLine);
    }
    
    output.push(this.renderInputSection(leftWidth));
    
    process.stdout.write('\u001b[2J\u001b[H');
    process.stdout.write(output.join('\n'));
  }

  private renderHeader(_width: number): string {
    const taskText = this.taskInfo.task.length > 50 
      ? this.taskInfo.task.slice(0, 47) + '...' 
      : this.taskInfo.task;
    
    const line1 = chalk.bold.cyan(`  💬 ${taskText}`);
    const line2 = chalk.gray('─').repeat(_width);
    
    return line1 + '\n' + line2;
  }

  private getStatusEmoji(): string {
    switch (this.taskInfo.status) {
      case 'pending': return '⏳';
      case 'accepted': return '✅';
      case 'in_progress': return '🔄';
      case 'pending_review': return '🔍';
      case 'completed': return '✅';
      case 'failed': return '❌';
      default: return '📋';
    }
  }

  private renderConversationLine(row: number, width: number, totalHeight: number): string {
    const headerHeight = 1;
    const footerHeight = 1;
    const messageHeight = totalHeight - headerHeight - footerHeight;
    
    if (row === 0) {
      return chalk.gray('─').repeat(width);
    }
    
    if (row < headerHeight + messageHeight) {
      const messageIndex = row - headerHeight + this.scrollOffset;
      if (messageIndex >= 0 && messageIndex < this.messages.length) {
        const msg = this.messages[messageIndex];
        if (msg) {
          return this.formatMessageLine(msg, width);
        }
      }
      return ' '.repeat(width);
    }
    
    return chalk.gray('─').repeat(width);
  }

  private formatMessageLine(msg: Message, width: number): string {
    const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    const isDelegator = msg.sender === this.taskInfo.delegator;
    const isSpeaking = msg.type === 'user' && (
      (this.selectedParticipant === 'delegator' && isDelegator) ||
      (this.selectedParticipant === 'delegatee' && !isDelegator)
    );
    
    let line: string;
    
    if (msg.type === 'system') {
      const prefix = `  ⚡ ${chalk.gray(time)}`;
      const maxLen = width - prefix.length - 2;
      const content = msg.content.length > maxLen 
        ? msg.content.slice(0, maxLen - 2) + '…' 
        : msg.content;
      line = `${prefix} ${chalk.gray(content)}`;
    } else if (msg.type === 'tool') {
      const prefix = `  🔧 ${chalk.gray(time)}`;
      const maxLen = width - prefix.length - 2;
      const content = msg.content.length > maxLen 
        ? msg.content.slice(0, maxLen - 2) + '…' 
        : msg.content;
      line = `${prefix} ${chalk.blue(content)}`;
    } else {
      const roleIcon = isDelegator ? '👤' : '🤖';
      const senderName = msg.sender === this.taskInfo.delegator 
        ? this.taskInfo.delegator 
        : this.taskInfo.delegatee;
      const roleColor = isDelegator ? chalk.green : chalk.cyan;
      
      const prefix = `  ${roleIcon} ${roleColor(senderName)} ${chalk.gray(time)}`;
      const maxLen = width - prefix.length - 2;
      const content = msg.content.length > maxLen 
        ? msg.content.slice(0, maxLen - 2) + '…' 
        : msg.content;
      
      const contentColored = (isDelegator ? chalk.green : chalk.cyan)(content);
      
      if (isSpeaking) {
        line = chalk.bgRgb(40, 44, 52)(`  ${prefix} ${contentColored}`);
      } else {
        line = `${prefix} ${contentColored}`;
      }
    }
    
    const displayLen = line.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = ' '.repeat(Math.max(0, width - displayLen));
    
    return line + padding;
  }

  private renderSidebarLine(row: number, width: number): string {
    const sections = [
      { title: '👥 参与者', render: () => this.renderParticipants() },
      { title: '📋 状态', render: () => this.renderStatus() },
      { title: '📜 消息', render: () => this.renderMessageScrollbar() },
      { title: '📁 工作目录', render: () => this.renderWorkspace() },
    ];
    
    let currentRow = 0;
    
    for (const section of sections) {
      const lines = section.render();
      
      if (row === currentRow) {
        return chalk.bold.white(` ${section.title} `).padEnd(width);
      }
      currentRow++;
      
      for (const line of lines) {
        if (row === currentRow) {
          return line.padEnd(width).slice(0, width);
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

  private renderParticipants(): string[] {
    const lines: string[] = [];
    const isDelegatorCurrent = this.currentUserId === this.taskInfo.delegator;
    
    // 委托者
    const delegatorSelected = this.selectedParticipant === 'delegator';
    const delegatorIcon = delegatorSelected ? chalk.bgGreen('▶') : ' ';
    const delegatorLabel = isDelegatorCurrent 
      ? chalk.green.bold(`👤 ${this.taskInfo.delegator} (委托者·我)`)
      : chalk.green(`👤 ${this.taskInfo.delegator} (委托者)`);
    lines.push(delegatorIcon + ' ' + delegatorLabel);
    
    // 受托者
    const delegateeSelected = this.selectedParticipant === 'delegatee';
    const delegateeIcon = delegateeSelected ? chalk.bgCyan('▶') : ' ';
    const delegateeLabel = !isDelegatorCurrent 
      ? chalk.cyan.bold(`🤖 ${this.taskInfo.delegatee} (受托者·我)`)
      : chalk.cyan(`🤖 ${this.taskInfo.delegatee} (受托者)`);
    lines.push(delegateeIcon + ' ' + delegateeLabel);
    
    lines.push(chalk.gray(' Tab 切换 | Enter 发送'));
    
    return lines;
  }

  private renderStatus(): string[] {
    const lines: string[] = [];
    
    const statusEmoji = this.getStatusEmoji();
    lines.push(`  状态: ${statusEmoji} ${this.taskInfo.status}`);
    
    const roundInfo = this.context.find(c => c.includes('轮次')) || '轮次: 0/5';
    lines.push(`  ${roundInfo}`);
    
    return lines;
  }

  private renderMessageScrollbar(): string[] {
    const lines: string[] = [];
    const total = this.messages.length;
    const visible = this.messageAreaHeight;
    
    if (total === 0) {
      lines.push(chalk.gray('  (无消息)'));
      return lines;
    }
    
    // 显示消息统计
    const start = this.scrollOffset + 1;
    const end = Math.min(this.scrollOffset + visible, total);
    
    lines.push(`  ${start}-${end} / ${total} 条`);
    
    // 渲染滚动条
    if (total > visible) {
      const scrollbarHeight = Math.max(1, Math.floor(visible * visible / total));
      const maxScrollPos = total - visible;
      const scrollPos = maxScrollPos > 0 ? Math.floor(this.scrollOffset * (visible - scrollbarHeight) / maxScrollPos) : 0;
      
      let scrollbar = '';
      for (let i = 0; i < visible; i++) {
        if (i >= scrollPos && i < scrollPos + scrollbarHeight) {
          scrollbar += chalk.bgWhite(' ');
        } else {
          scrollbar += chalk.gray('│');
        }
      }
      lines.push('  ' + scrollbar);
    }
    
    // 提示
    lines.push(chalk.gray('  ↑↓ 滚动消息'));
    
    return lines;
  }

  private renderWorkspace(): string[] {
    const lines: string[] = [];
    const maxFiles = 3;
    
    for (let i = 0; i < Math.min(this.workspaceFiles.length, maxFiles); i++) {
      const file = this.workspaceFiles[i];
      if (file) {
        const display = file.length > 22 ? file.slice(0, 19) + '…' : file;
        lines.push(`  ${display}`);
      }
    }
    
    if (this.workspaceFiles.length === 0) {
      lines.push(chalk.gray('  (空)'));
    } else if (this.workspaceFiles.length > maxFiles) {
      lines.push(chalk.gray(`  +${this.workspaceFiles.length - maxFiles} 文件`));
    }
    
    return lines;
  }

  private renderInputSection(width: number): string {
    const lines: string[] = [];
    
    lines.push(chalk.gray('─').repeat(width));
    
    let hint = '输入消息';
    if (this.selectedParticipant) {
      const target = this.selectedParticipant === 'delegator' ? '委托者' : '受托者';
      hint = `发给 ${target}`;
    }
    
    const statusHints = this.getStatusHints();
    if (statusHints) {
      hint += ` | ${statusHints}`;
    }
    
    lines.push(chalk.yellow(`  ${hint} (Esc退出):`));
    
    const prompt = this.selectedParticipant 
      ? chalk.bold.cyan('> ')
      : chalk.bold.green('> ');
    const inputLine = this.inputBuffer + '█';
    lines.push(prompt + inputLine);
    
    return lines.join('\n');
  }

  private getStatusHints(): string {
    switch (this.taskInfo.status) {
      case 'failed':
        return '/retry 重试';
      case 'pending':
        return '@受托者 自动接受';
      case 'pending_review':
        return '/accept 通过 | /reject <反馈>';
      default:
        return '';
    }
  }

  private async inputLoop(): Promise<void> {
    return new Promise((resolve) => {
      if (!process.stdin.isTTY) {
        resolve();
        return;
      }

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

        // Ctrl+C or ESC
        if (key === '\u0003' || key === '\u001b') {
          this.stop();
          process.removeListener('SIGINT', sigintHandler);
          resolve();
          return;
        }

        // Tab 切换参与者
        if (key === '\t') {
          this.cycleParticipant();
          this.render();
          return;
        }

        // 上箭头 - 向上滚动
        if (key === '\u001b[A') {
          this.scrollUp(1);
          this.render();
          return;
        }

        // 下箭头 - 向下滚动
        if (key === '\u001b[B') {
          this.scrollDown(1);
          this.render();
          return;
        }

        // Page Up - 向上翻页
        if (key === '\u001b[5~') {
          this.scrollUp(this.messageAreaHeight);
          this.render();
          return;
        }

        // Page Down - 向下翻页
        if (key === '\u001b[6~') {
          this.scrollDown(this.messageAreaHeight);
          this.render();
          return;
        }

        // Enter 发送
        if (key === '\r' || key === '\n') {
          if (this.inputBuffer.trim() && this.messageCallback) {
            let message = this.inputBuffer.trim();
            
            if (this.selectedParticipant && !message.includes('@')) {
              const target = this.selectedParticipant === 'delegator' 
                ? this.taskInfo.delegator 
                : this.taskInfo.delegatee;
              message = `@${target} ${message}`;
            }
            
            this.messageCallback(message);
            this.inputBuffer = '';
            this.scrollToBottom();
            this.render();
          }
          return;
        }

        // Backspace
        if (key === '\u007f' || key === '\b') {
          this.inputBuffer = this.inputBuffer.slice(0, -1);
          this.render();
          return;
        }

        // 普通字符
        if (key.charCodeAt(0) >= 32 || key.length > 1) {
          this.inputBuffer += key;
          this.scheduleRender();
        }
      };

      process.stdin.on('data', this.stdinHandler);
    });
  }

  private cycleParticipant(): void {
    const isDelegatorCurrent = this.currentUserId === this.taskInfo.delegator;
    
    if (this.selectedParticipant === null) {
      this.selectedParticipant = isDelegatorCurrent ? 'delegatee' : 'delegator';
    } else if (this.selectedParticipant === 'delegator') {
      this.selectedParticipant = 'delegatee';
    } else {
      this.selectedParticipant = 'delegator';
    }
  }
}
