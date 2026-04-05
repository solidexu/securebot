import chalk from 'chalk';

export interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  type: 'user' | 'agent' | 'system' | 'tool' | 'review';
}

export interface TaskInfo {
  id: string;
  task: string;
  status: string;
  delegator: string;
  delegatee: string;
  workspace?: string;
}

export interface AgentStatus {
  id: string;
  name: string;
  status: 'idle' | 'working' | 'completed';
  currentTask?: string;
}

const MAX_MESSAGES = 500;
const RENDER_INTERVAL = 300;

export class TaskConversationUI {
  private messages: Message[] = [];
  private taskInfo: TaskInfo;
  private agents: AgentStatus[] = [];
  private isRunning: boolean = false;
  private inputBuffer: string = '';
  private messageCallback?: (message: string) => void;
  private scrollOffset: number = 0;
  private stdinHandler?: (key: string) => void;
  private renderTimer?: ReturnType<typeof setTimeout>;
  private currentUserId: string;
  private lastRenderTime: number = 0;
  private recentLogs: string[] = [];
  
  private terminalWidth: number = 120;
  private terminalHeight: number = 40;
  private mainContentWidth: number = 0;
  private sidebarWidth: number = 0;
  private mainContentHeight: number = 0;
  private inputHeight: number = 0;

  constructor(taskInfo: TaskInfo, currentUserId?: string) {
    this.taskInfo = taskInfo;
    this.currentUserId = currentUserId || taskInfo.delegator;
    
    // 初始化 Agent 列表
    this.agents = [
      { id: taskInfo.delegator, name: taskInfo.delegator, status: 'idle' },
      { id: taskInfo.delegatee, name: taskInfo.delegatee, status: 'idle' }
    ];
  }

  async start(): Promise<void> {
    this.isRunning = true;
    this.initLayout();
    
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
    if (this.messages.length > MAX_MESSAGES) {
      this.messages = this.messages.slice(-MAX_MESSAGES);
    }
    this.scheduleRender();
  }

  setTodos(_todos: string[]): void {}

  setContext(context: string[]): void {
    const statusLine = context.find(c => c.startsWith('状态:'));
    if (statusLine) {
      this.taskInfo.status = statusLine.replace('状态:', '').trim();
    }
  }

  updateWorkspace(): void {
    // 保留接口兼容性
  }

  // 更新 Agent 状态
  updateAgentStatus(agentId: string, status: AgentStatus['status'], task?: string): void {
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) {
      agent.status = status;
      agent.currentTask = task;
      if (status === 'working') {
        this.addLog(`${agent.name} 开始工作`);
      }
    }
  }

  // 添加执行日志
  addLog(log: string): void {
    this.recentLogs.push(log);
    if (this.recentLogs.length > 5) {
      this.recentLogs = this.recentLogs.slice(-5);
    }
  }

  private initLayout(): void {
    this.terminalWidth = process.stdout.columns || 120;
    this.terminalHeight = process.stdout.rows || 40;
    
    // 固定比例布局
    this.mainContentWidth = Math.floor(this.terminalWidth * 0.70);
    this.sidebarWidth = this.terminalWidth - this.mainContentWidth - 1;
    this.mainContentHeight = Math.floor(this.terminalHeight * 0.85);
    this.inputHeight = this.terminalHeight - this.mainContentHeight;
  }

  private scheduleRender(): void {
    if (!this.isRunning) return;
    
    const now = Date.now();
    if (now - this.lastRenderTime < RENDER_INTERVAL) {
      if (this.renderTimer) clearTimeout(this.renderTimer);
      this.renderTimer = setTimeout(() => this.render(), RENDER_INTERVAL);
    } else {
      this.render();
    }
  }

  private render(): void {
    this.lastRenderTime = Date.now();
    this.initLayout();
    
    // 构建整个屏幕
    const screen: string[] = [];
    
    // 主内容区 + 侧边栏（85%高度）
    for (let row = 0; row < this.mainContentHeight; row++) {
      const mainLine = this.renderMainLine(row);
      const sidebarLine = this.renderSidebarLine(row);
      screen.push(mainLine + chalk.gray('│') + sidebarLine);
    }
    
    // 底部输入区（15%高度）
    screen.push(this.renderInputSection());
    
    // 一次性输出
    process.stdout.write('\u001b[2J\u001b[H' + screen.join('\n'));
  }

  // ===== 主内容区渲染 =====
  private renderMainLine(row: number): string {
    // 标题行
    if (row === 0) {
      const title = ' 💬 任务对话 ';
      return chalk.bold.cyan(title) + chalk.gray('─').repeat(this.mainContentWidth - title.length);
    }
    
    // 消息区域
    const messageAreaStart = 1;
    const messageAreaEnd = this.mainContentHeight - 1;
    
    if (row >= messageAreaStart && row < messageAreaEnd) {
      const messageIndex = row - messageAreaStart + this.scrollOffset;
      if (messageIndex >= 0 && messageIndex < this.messages.length) {
        const msg = this.messages[messageIndex];
        if (msg) {
          return this.formatMessageLine(msg);
        }
      }
      return ' '.repeat(this.mainContentWidth);
    }
    
    // 底部分隔
    return chalk.gray('─').repeat(this.mainContentWidth);
  }

  private formatMessageLine(msg: Message): string {
    const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    let prefix: string;
    let contentColor: (s: string) => string;
    
    switch (msg.type) {
      case 'system':
        prefix = ` ⚡ ${chalk.gray(time)}`;
        contentColor = chalk.gray;
        break;
      case 'tool':
        prefix = ` 🔧 ${chalk.gray(time)}`;
        contentColor = chalk.blue;
        break;
      case 'review':
        prefix = ` ✅ ${chalk.gray(time)}`;
        contentColor = chalk.yellow;
        break;
      case 'user':
        const isDelegator = msg.sender === this.taskInfo.delegator;
        prefix = ` ${isDelegator ? '👤' : '🤖'} ${chalk[isDelegator ? 'green' : 'cyan'](msg.sender)} ${chalk.gray(time)}`;
        contentColor = isDelegator ? chalk.green : chalk.cyan;
        break;
      default:
        prefix = ` 🤖 ${chalk.cyan(msg.sender)} ${chalk.gray(time)}`;
        contentColor = chalk.cyan;
    }
    
    const maxLen = this.mainContentWidth - prefix.length - 2;
    const content = msg.content.length > maxLen 
      ? msg.content.slice(0, maxLen - 2) + '…' 
      : msg.content;
    
    const line = `${prefix} ${contentColor(content)}`;
    const displayLen = line.replace(/\x1b\[[0-9;]*m/g, '').length;
    
    return line + ' '.repeat(Math.max(0, this.mainContentWidth - displayLen));
  }

  // ===== 侧边栏渲染 =====
  private renderSidebarLine(row: number): string {
    const modules = [
      { title: '📋 任务状态', lines: this.renderTaskStatus() },
      { title: '🔄 当前工作', lines: this.renderCurrentWork() },
      { title: '👥 Agent 状态', lines: this.renderAgentList() },
      { title: '📝 执行日志', lines: this.renderRecentLogs() },
    ];
    
    let currentRow = 0;
    
    for (const module of modules) {
      // 模块标题
      if (row === currentRow) {
        return chalk.bold.white(` ${module.title} `).padEnd(this.sidebarWidth);
      }
      currentRow++;
      
      // 模块内容
      for (const line of module.lines) {
        if (row === currentRow) {
          return line.padEnd(this.sidebarWidth).slice(0, this.sidebarWidth);
        }
        currentRow++;
      }
      
      // 模块间隔
      if (row === currentRow) {
        return ' '.repeat(this.sidebarWidth);
      }
      currentRow++;
    }
    
    return ' '.repeat(this.sidebarWidth);
  }

  private renderTaskStatus(): string[] {
    const statusMap: Record<string, { emoji: string; text: string }> = {
      'pending': { emoji: '⏳', text: '等待任务' },
      'accepted': { emoji: '✅', text: '已接受' },
      'in_progress': { emoji: '🔄', text: '执行中' },
      'pending_review': { emoji: '🔍', text: '评审中' },
      'completed': { emoji: '✅', text: '已完成' },
      'failed': { emoji: '❌', text: '已失败' },
    };
    
    const status = statusMap[this.taskInfo.status] || { emoji: '📋', text: this.taskInfo.status };
    
    return [
      `  ${status.emoji} ${status.text}`,
      `  任务: ${this.taskInfo.task.slice(0, 20)}...`
    ];
  }

  private renderCurrentWork(): string[] {
    const workingAgent = this.agents.find(a => a.status === 'working');
    
    if (!workingAgent) {
      return [chalk.gray('  (无活动任务)')];
    }
    
    return [
      `  🤖 ${chalk.cyan(workingAgent.id)}`,
      `  ${workingAgent.currentTask || '执行中...'}`
    ];
  }

  private renderAgentList(): string[] {
    return this.agents.map(agent => {
      const statusIcon = agent.status === 'working' ? '🔄' :
                        agent.status === 'completed' ? '✅' : '💤';
      const isMe = agent.id === this.currentUserId;
      const name = isMe ? chalk.bold(`${agent.id} (我)`) : agent.id;
      
      return `  ${statusIcon} ${name}`;
    });
  }

  private renderRecentLogs(): string[] {
    if (this.recentLogs.length === 0) {
      return [chalk.gray('  (暂无日志)')];
    }
    
    return this.recentLogs.map(log => {
      const display = log.length > 25 ? log.slice(0, 22) + '…' : log;
      return `  ${chalk.gray(display)}`;
    });
  }

  // ===== 输入区渲染 =====
  private renderInputSection(): string {
    const lines: string[] = [];
    
    // 分隔线
    lines.push(chalk.gray('─').repeat(this.terminalWidth));
    
    // 输入提示
    const hints = this.getHints();
    lines.push(chalk.yellow(`  ${hints}`));
    
    // 输入框
    const prompt = chalk.bold.green('> ');
    const inputLine = this.inputBuffer + '█';
    lines.push(prompt + inputLine);
    
    // 快捷键提示
    lines.push(chalk.gray('  Enter 发送 | Esc 退出 | ↑↓ 滚动'));
    
    // 填充剩余行
    while (lines.length < this.inputHeight) {
      lines.push('');
    }
    
    return lines.join('\n');
  }

  private getHints(): string {
    switch (this.taskInfo.status) {
      case 'pending':
        return '输入消息，或 @受托者 自动接受任务';
      case 'pending_review':
        return '/accept 通过 | /reject <反馈> 不通过';
      case 'failed':
        return '/retry 重试任务';
      default:
        return '输入消息或指令';
    }
  }

  // ===== 输入处理 =====
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

        // 上箭头
        if (key === '\u001b[A') {
          this.scrollOffset = Math.max(0, this.scrollOffset - 1);
          this.render();
          return;
        }

        // 下箭头
        if (key === '\u001b[B') {
          const maxOffset = Math.max(0, this.messages.length - (this.mainContentHeight - 3));
          this.scrollOffset = Math.min(maxOffset, this.scrollOffset + 1);
          this.render();
          return;
        }

        // Enter 发送
        if (key === '\r' || key === '\n') {
          if (this.inputBuffer.trim() && this.messageCallback) {
            this.messageCallback(this.inputBuffer.trim());
            this.inputBuffer = '';
            this.scrollOffset = Math.max(0, this.messages.length - (this.mainContentHeight - 3));
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
}