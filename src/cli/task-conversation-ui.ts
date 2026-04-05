import blessed from 'blessed';

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

export class TaskConversationUI {
  private screen: blessed.Widgets.Screen;
  private chatBox: blessed.Widgets.BoxElement;
  private inputBox: blessed.Widgets.BoxElement;
  private statusBox: blessed.Widgets.BoxElement;
  private agentBox: blessed.Widgets.BoxElement;
  private logBox: blessed.Widgets.BoxElement;
  
  private messages: Message[] = [];
  private taskInfo: TaskInfo;
  private agents: AgentStatus[] = [];
  private recentLogs: string[] = [];
  private messageCallback?: (message: string) => void;
  private currentUserId: string;
  private inputBuffer: string = '';
  private stdinHandler?: (key: string) => void;

  constructor(taskInfo: TaskInfo, currentUserId?: string) {
    this.taskInfo = taskInfo;
    this.currentUserId = currentUserId || taskInfo.delegator;
    
    this.agents = [
      { id: taskInfo.delegator, name: taskInfo.delegator, status: 'idle' },
      { id: taskInfo.delegatee, name: taskInfo.delegatee, status: 'idle' }
    ];

    // 创建屏幕
    this.screen = blessed.screen({
      smartCSR: true,
      title: `任务对话 - ${taskInfo.task.slice(0, 30)}`,
      fullUnicode: true,
    });

    // 左侧聊天区域 (70% 宽度, 85% 高度)
    this.chatBox = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '70%',
      height: '85%',
      label: ' 💬 任务对话 ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'white', bold: true },
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '█',
        track: { bg: 'gray' },
        style: { inverse: true },
      },
      keys: true,
      vi: true,
    });

    // 底部输入框显示区 (用 box 而不是 textbox)
    this.inputBox = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '70%',
      height: 3,
      label: ' 输入消息 (Enter 发送, Esc 退出) ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
      },
    });

    // 右侧状态栏 (30% 宽度)
    this.statusBox = blessed.box({
      parent: this.screen,
      top: 0,
      right: 0,
      width: '30%',
      height: '25%',
      label: ' 📋 任务状态 ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
    });

    // 右侧 Agent 状态 (30% 宽度)
    this.agentBox = blessed.box({
      parent: this.screen,
      top: '25%',
      right: 0,
      width: '30%',
      height: '35%',
      label: ' 👥 参与者 ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
    });

    // 右侧日志 (30% 宽度)
    this.logBox = blessed.box({
      parent: this.screen,
      top: '60%',
      right: 0,
      width: '30%',
      height: '40%',
      label: ' 📝 执行日志 ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '█',
        track: { bg: 'gray' },
        style: { inverse: true },
      },
    });
  }

  async start(): Promise<void> {
    this.updateDisplay();
    
    // 设置原始模式输入
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    return new Promise((resolve) => {
      (this as any)._resolveStart = resolve;
      
      this.stdinHandler = (key: string) => {
        // Esc 或 Ctrl+C 退出
        if (key === '\u001b' || key === '\u0003') {
          this.stop();
          return;
        }
        
        // Enter 发送
        if (key === '\r' || key === '\n') {
          if (this.inputBuffer.trim() && this.messageCallback) {
            this.messageCallback(this.inputBuffer.trim());
            this.inputBuffer = '';
            this.updateInputBox();
          }
          return;
        }
        
        // Backspace
        if (key === '\u007f' || key === '\b') {
          this.inputBuffer = this.inputBuffer.slice(0, -1);
          this.updateInputBox();
          return;
        }
        
        // 普通字符（包括中文）
        if (key.charCodeAt(0) >= 32 || key.length > 1) {
          this.inputBuffer += key;
          this.updateInputBox();
        }
      };
      
      process.stdin.on('data', this.stdinHandler);
      this.screen.render();
    });
  }

  stop(): void {
    // 先销毁 blessed screen（它会处理终端状态）
    this.screen.destroy();
    
    // 然后清理我们自己的 stdin 处理
    if (this.stdinHandler) {
      process.stdin.removeListener('data', this.stdinHandler);
      this.stdinHandler = undefined;
    }
    
    // 确保 rawMode 已关闭
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
    
    // 恢复 stdin 到正常状态
    process.stdin.pause();
    
    if ((this as any)._resolveStart) {
      (this as any)._resolveStart();
    }
  }

  onMessage(callback: (message: string) => void): void {
    this.messageCallback = callback;
  }

  addMessage(message: Message): void {
    this.messages.push(message);
    this.updateChatBox();
  }

  setTodos(_todos: string[]): void {}

  setContext(context: string[]): void {
    const statusLine = context.find(c => c.startsWith('状态:'));
    if (statusLine) {
      this.taskInfo.status = statusLine.replace('状态:', '').trim();
    }
    this.updateStatusBox();
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
    this.updateAgentBox();
  }

  addLog(log: string): void {
    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    this.recentLogs.push(`[${time}] ${log}`);
    if (this.recentLogs.length > 20) {
      this.recentLogs = this.recentLogs.slice(-20);
    }
    this.updateLogBox();
  }

  private updateDisplay(): void {
    this.updateStatusBox();
    this.updateAgentBox();
    this.updateLogBox();
    this.updateChatBox();
    this.updateInputBox();
  }

  private updateInputBox(): void {
    const content = `  ${this.inputBuffer}█`;
    this.inputBox.setContent(content);
    this.screen.render();
  }

  private updateChatBox(): void {
    const lines: string[] = [];
    
    for (const msg of this.messages) {
      const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      let line: string;
      
      switch (msg.type) {
        case 'system':
          line = `{gray-fg}⚡ ${time} ${msg.content}{/gray-fg}`;
          break;
        case 'tool':
          line = `{blue-fg}🔧 ${time} ${msg.content}{/blue-fg}`;
          break;
        case 'review':
          line = `{yellow-fg}✅ ${time} ${msg.content}{/yellow-fg}`;
          break;
        default:
          const isDelegator = msg.sender === this.taskInfo.delegator;
          const color = isDelegator ? 'green' : 'cyan';
          const icon = isDelegator ? '👤' : '🤖';
          line = `{${color}-fg}${icon} ${msg.sender} ${time}{/${color}-fg} ${msg.content}`;
      }
      
      lines.push(line);
    }
    
    this.chatBox.setContent(lines.join('\n'));
    this.chatBox.setScrollPerc(100);
    this.screen.render();
  }

  private updateStatusBox(): void {
    const statusEmoji = this.getStatusEmoji();
    const round = this.messages.filter(m => m.type === 'system' && m.content.includes('开始执行')).length;
    
    const content = [
      `  状态: ${statusEmoji} ${this.taskInfo.status}`,
      `  轮次: ${round}/5`,
      `  任务: ${this.taskInfo.task.slice(0, 25)}...`,
    ].join('\n');
    
    this.statusBox.setContent(content);
    this.screen.render();
  }

  private updateAgentBox(): void {
    const lines: string[] = [];
    
    for (const agent of this.agents) {
      const isMe = agent.id === this.currentUserId;
      const statusIcon = agent.status === 'working' ? '🔄' :
                        agent.status === 'completed' ? '✅' : '💤';
      const name = isMe ? `{bold}${agent.id} (我){/bold}` : agent.id;
      
      lines.push(`  ${statusIcon} ${name}`);
      
      if (agent.status === 'working' && agent.currentTask) {
        lines.push(`    ${agent.currentTask.slice(0, 20)}...`);
      }
    }
    
    this.agentBox.setContent(lines.join('\n'));
    this.screen.render();
  }

  private updateLogBox(): void {
    const content = this.recentLogs.map(log => `  ${log}`).join('\n');
    this.logBox.setContent(content);
    this.logBox.setScrollPerc(100);
    this.screen.render();
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