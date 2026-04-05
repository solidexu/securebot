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

const ANSI = {
  clear: '\u001b[2J',
  home: '\u001b[H',
  hideCursor: '\u001b[?25l',
  showCursor: '\u001b[?25h',
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  cyan: '\u001b[36m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  gray: '\u001b[90m',
  white: '\u001b[37m',
  bgCyan: '\u001b[46m',
};

export class TaskConversationUI {
  private messages: Message[] = [];
  private taskInfo: TaskInfo;
  private agents: AgentStatus[] = [];
  private recentLogs: string[] = [];
  private messageCallback?: (message: string) => void;
  private currentUserId: string;
  private inputBuffer: string = '';
  private resolveStart?: () => void;
  private renderTimer?: ReturnType<typeof setTimeout>;

  constructor(taskInfo: TaskInfo, currentUserId?: string) {
    this.taskInfo = taskInfo;
    this.currentUserId = currentUserId || taskInfo.delegator;
    
    this.agents = [
      { id: taskInfo.delegator, name: taskInfo.delegator, status: 'idle' },
      { id: taskInfo.delegatee, name: taskInfo.delegatee, status: 'idle' }
    ];
  }

  async start(): Promise<void> {
    this.render();
    
    return new Promise((resolve) => {
      this.resolveStart = resolve;
      
      // 使用 raw mode 处理输入
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdout.write(ANSI.hideCursor);
      
      const onKey = (key: string) => {
        // Ctrl+C 退出
        if (key === '\u0003') {
          cleanup();
          return;
        }
        
        // Enter 发送
        if (key === '\r' || key === '\n') {
          if (this.inputBuffer.trim() && this.messageCallback) {
            this.messageCallback(this.inputBuffer.trim());
          }
          this.inputBuffer = '';
          this.render();
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
          this.render();
        }
      };
      
      const cleanup = () => {
        process.stdin.removeListener('data', onKey);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdout.write(ANSI.showCursor);
        resolve();
      };
      
      process.stdin.on('data', onKey);
    });
  }

  stop(): void {
    process.stdout.write(ANSI.showCursor);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    if (this.resolveStart) {
      this.resolveStart();
    }
  }

  onMessage(callback: (message: string) => void): void {
    this.messageCallback = callback;
  }

  addMessage(message: Message): void {
    this.messages.push(message);
    this.scheduleRender();
  }

  setTodos(_todos: string[]): void {}

  setContext(context: string[]): void {
    const statusLine = context.find(c => c.startsWith('状态:'));
    if (statusLine) {
      this.taskInfo.status = statusLine.replace('状态:', '').trim();
    }
    this.scheduleRender();
  }

  updateWorkspace(): void {}

  updateAgentStatus(agentId: string, status: AgentStatus['status'], task?: string): void {
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) {
      agent.status = status;
      agent.currentTask = task;
      if (status === 'working') {
        this.addLog(`${agent.name} 开始执行`);
      }
    }
    this.scheduleRender();
  }

  addLog(log: string): void {
    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    this.recentLogs.push(`[${time}] ${log}`);
    if (this.recentLogs.length > 10) {
      this.recentLogs = this.recentLogs.slice(-10);
    }
    this.scheduleRender();
  }

  private scheduleRender(): void {
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.render(), 100);
  }

  private render(): void {
    const width = process.stdout.columns || 100;
    const height = process.stdout.rows || 30;
    
    const leftWidth = Math.floor(width * 0.70);
    const rightWidth = width - leftWidth - 1;
    const mainHeight = height - 4;
    
    const lines: string[] = [];
    
    // 标题栏
    lines.push(this.renderTitle(leftWidth));
    
    // 主内容区
    for (let row = 0; row < mainHeight; row++) {
      const left = this.renderChatLine(row, leftWidth, mainHeight);
      const right = this.renderSidebarLine(row, rightWidth);
      lines.push(left + ANSI.gray + '│' + ANSI.reset + right);
    }
    
    // 输入区
    lines.push(ANSI.cyan + '─'.repeat(width) + ANSI.reset);
    lines.push(ANSI.yellow + '  输入消息 (Enter 发送, Ctrl+C 退出):' + ANSI.reset);
    lines.push(ANSI.green + ANSI.bold + '> ' + ANSI.reset + this.inputBuffer + '█');
    
    // 输出
    process.stdout.write(ANSI.clear + ANSI.home + ANSI.hideCursor + lines.join('\n'));
  }

  private renderTitle(_width: number): string {
    const task = this.taskInfo.task.length > 50 ? this.taskInfo.task.slice(0, 47) + '...' : this.taskInfo.task;
    return ANSI.cyan + ANSI.bold + '  💬 ' + task + ANSI.reset;
  }

  private renderChatLine(row: number, width: number, totalHeight: number): string {
    if (row === 0) {
      return ANSI.gray + '─'.repeat(width) + ANSI.reset;
    }
    
    if (row < totalHeight - 1) {
      const idx = row - 1;
      const msg = this.messages[idx];
      if (msg) {
        return this.formatMessage(msg, width);
      }
      return ' '.repeat(width);
    }
    
    return ANSI.gray + '─'.repeat(width) + ANSI.reset;
  }

  private formatMessage(msg: Message, width: number): string {
    const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    
    let prefix: string;
    let contentColor: string;
    
    switch (msg.type) {
      case 'system':
        prefix = `  ⚡ ${time}`;
        contentColor = ANSI.gray;
        break;
      case 'tool':
        prefix = `  🔧 ${time}`;
        contentColor = ANSI.blue;
        break;
      case 'review':
        prefix = `  ✅ ${time}`;
        contentColor = ANSI.yellow;
        break;
      default:
        const isDelegator = msg.sender === this.taskInfo.delegator;
        const icon = isDelegator ? '👤' : '🤖';
        prefix = `  ${icon} ${msg.sender} ${time}`;
        contentColor = isDelegator ? ANSI.green : ANSI.cyan;
    }
    
    const maxLen = width - prefix.length - 2;
    const content = msg.content.length > maxLen ? msg.content.slice(0, maxLen - 2) + '…' : msg.content;
    
    return prefix + ' ' + contentColor + content + ANSI.reset;
  }

  private renderSidebarLine(row: number, width: number): string {
    const modules = [
      { title: '📋 任务状态', lines: this.renderStatus() },
      { title: '👥 参与者', lines: this.renderAgents() },
      { title: '📝 执行日志', lines: this.renderLogs() },
    ];
    
    let currentRow = 0;
    
    for (const mod of modules) {
      if (row === currentRow) {
        return ANSI.white + ANSI.bold + ` ${mod.title} ` + ANSI.reset;
      }
      currentRow++;
      
      for (const line of mod.lines) {
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

  private renderStatus(): string[] {
    const emoji = this.getStatusEmoji();
    const round = this.messages.filter(m => m.type === 'system' && m.content.includes('开始执行')).length;
    return [
      `  状态: ${emoji} ${this.taskInfo.status}`,
      `  轮次: ${round}/5`,
      `  任务: ${this.taskInfo.task.slice(0, 20)}...`,
    ];
  }

  private renderAgents(): string[] {
    return this.agents.map(agent => {
      const isMe = agent.id === this.currentUserId;
      const icon = agent.status === 'working' ? '🔄' : agent.status === 'completed' ? '✅' : '💤';
      const name = isMe ? agent.id + ' (我)' : agent.id;
      return `  ${icon} ${name}`;
    });
  }

  private renderLogs(): string[] {
    if (this.recentLogs.length === 0) {
      return [ANSI.gray + '  (暂无日志)' + ANSI.reset];
    }
    return this.recentLogs.slice(-5).map(log => ANSI.gray + '  ' + log + ANSI.reset);
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
}