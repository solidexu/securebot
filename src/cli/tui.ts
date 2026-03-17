/**
 * TUI (Terminal User Interface) REPL
 * 
 * 分屏界面：左侧聊天，右侧文件浏览器
 */

import blessed from 'blessed';
import { readdirSync, statSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Agent, Message } from '../core/types.js';
import { loadConfig, createDefaultConfig } from '../core/config.js';
import { createAgents, getDefaultAgent, getOrCreateMainSession } from '../core/agent.js';
import { addUserMessage, addAssistantMessage, buildSystemPrompt } from '../core/session.js';
import { OllamaAdapter, type StreamCallback } from '../model/ollama.js';
import { getAvailableTools, getAvailableToolNames } from '../tools/index.js';
import { getSessionStorage } from '../core/session-storage.js';
import { getMemoryManager } from '../core/memory.js';
import { getSkillManager } from '../core/skills.js';

// ============ 类型定义 ============

interface TuiState {
  config: ReturnType<typeof loadConfig>;
  agents: Map<string, Agent>;
  currentAgentId: string;
  modelAdapter: OllamaAdapter;
  running: boolean;
  workspace: string;
}

// ============ 文件树 ============

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

/**
 * 构建文件树
 */
function buildFileTree(dir: string, maxDepth: number = 3, currentDepth: number = 0): FileNode[] {
  if (currentDepth >= maxDepth) return [];
  if (!existsSync(dir)) return [];

  const items: FileNode[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  // 排序：目录优先，然后按名称
  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  // 过滤隐藏文件和常用忽略目录
  const ignorePatterns = ['node_modules', '.git', 'dist', '.DS_Store', 'Thumbs.db'];
  
  for (const entry of sorted) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    if (ignorePatterns.includes(entry.name)) continue;

    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      items.push({
        name: entry.name,
        path: fullPath,
        type: 'directory',
        children: buildFileTree(fullPath, maxDepth, currentDepth + 1),
      });
    } else {
      items.push({
        name: entry.name,
        path: fullPath,
        type: 'file',
      });
    }
  }

  return items;
}

/**
 * 获取文件预览
 */
function getFilePreview(filePath: string, maxLines: number = 20): string {
  if (!existsSync(filePath)) return '文件不存在';
  
  const stat = statSync(filePath);
  if (stat.isDirectory()) return '这是一个目录';
  if (stat.size > 100000) return `文件过大 (${(stat.size / 1024).toFixed(1)} KB)，请使用编辑器打开`;
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').slice(0, maxLines);
    
    let result = lines.map((line, i) => `${String(i + 1).padStart(4)}: ${line}`).join('\n');
    if (content.split('\n').length > maxLines) {
      result += `\n... (更多内容)`;
    }
    return result;
  } catch {
    return '无法读取文件内容（可能是二进制文件）';
  }
}

// ============ TUI 类 ============

export class TuiRepl {
  private screen: blessed.Widgets.Screen;
  private chatBox: blessed.Widgets.BoxElement;
  private inputBox: blessed.Widgets.TextareaElement;
  private fileTree: blessed.Widgets.ListElement;
  private previewBox: blessed.Widgets.BoxElement;
  private statusBar: blessed.Widgets.BoxElement;
  private state: TuiState | null = null;
  private sessionStorage: ReturnType<typeof getSessionStorage> | null = null;
  private selectedFilePath: string = '';
  private filePaths: string[] = []; // 存储文件路径列表
  private isGenerating: boolean = false; // 是否正在生成回复
  private showRightPanel: boolean = true; // 右侧面板是否显示

  constructor() {
    // 创建屏幕
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'SecureBot - 安全可控的多 Agent AI 助手',
      fullUnicode: true,
    });

    // 左侧聊天区域
    this.chatBox = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '65%',
      height: '85%',
      label: ' 💬 聊天 ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'white', bold: true },
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
        track: { bg: 'gray' },
        style: { inverse: true },
      },
    });

    // 输入框 - 使用 textarea 支持中文
    this.inputBox = blessed.textarea({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '65%',
      height: 3,
      label: ' 输入消息 (Enter 发送, F4 面板, Esc 停止) ',
      inputOnFocus: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
        focus: { border: { fg: 'yellow' } },
      },
      keys: true,
      mouse: true,
    });

    // 右侧文件树
    this.fileTree = blessed.list({
      parent: this.screen,
      top: 0,
      right: 0,
      width: '35%',
      height: '45%',
      label: ' 📂 工作区 ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'white' },
      },
      keys: true,
      vi: true,
      mouse: true,
      scrollable: true,
    });

    // 文件预览
    this.previewBox = blessed.box({
      parent: this.screen,
      top: '45%',
      right: 0,
      width: '35%',
      height: '40%',
      label: ' 👁 预览 ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
        track: { bg: 'gray' },
        style: { inverse: true },
      },
    });

    // 状态栏
    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: 0,
      right: 0,
      width: '35%',
      height: 3,
      label: ' 状态 ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
      },
      content: '加载中...',
    });

    this.setupEvents();
  }

  /**
   * 设置事件
   */
  private setupEvents(): void {
    // 输入框事件
    this.inputBox.key('enter', async () => {
      if (this.isGenerating) return; // 正在生成时不处理
      
      const message = this.inputBox.getValue();
      if (message.trim()) {
        this.inputBox.clearValue();
        this.screen.render();
        await this.handleInput(message.trim());
      }
      this.inputBox.focus();
    });

    // Esc 键停止生成
    this.inputBox.key('escape', () => {
      if (this.isGenerating) {
        this.log('{yellow-fg}[已停止]{/yellow-fg}');
        this.isGenerating = false;
        this.updateStatus();
      }
    });

    // 文件树事件
    this.fileTree.on('select', () => {
      if (!this.state) return;
      
      const selected = this.fileTree.getScroll();
      if (selected >= 0 && selected < this.filePaths.length) {
        const path = this.filePaths[selected];
        if (path) {
          this.selectedFilePath = path;
          this.updatePreview();
        }
      }
    });

    // 全局快捷键
    this.screen.key(['q', 'C-c'], async () => {
      await this.shutdown();
      process.exit(0);
    });

    // F6 切换焦点
    this.screen.key(['f6'], () => {
      if (this.inputBox && this.screen.focused === this.inputBox) {
        this.fileTree.focus();
      } else if (this.inputBox) {
        this.inputBox.focus();
      }
    });

    // F5 刷新文件树
    this.screen.key(['f5'], () => {
      this.updateFileTree();
    });

    // F4 切换右侧面板
    this.screen.key(['f4'], () => {
      this.toggleRightPanel();
    });

    // F2 切换 Agent
    this.screen.key(['f2'], () => {
      this.showAgentMenu();
    });
  }

  /**
   * 启动 TUI
   */
  async start(options: { defaultAgent?: string; model?: string } = {}): Promise<void> {
    // 加载配置
    let config;
    try {
      config = loadConfig();
    } catch {
      createDefaultConfig();
      config = loadConfig();
    }

    // 创建 Agent
    const agents = createAgents(config);

    // 创建模型适配器
    const modelAdapter = new OllamaAdapter({
      baseUrl: config.model.baseUrl ?? undefined,
      defaultModel: options.model ?? config.model.model,
    });

    // 检查 Ollama
    const healthCheck = await modelAdapter.healthCheck();
    if (!healthCheck.ok) {
      this.log('{red-fg}✗ 无法连接到 Ollama{/red-fg}');
      this.log(`{gray-fg}Ollama 地址: ${config.model.baseUrl ?? 'http://localhost:11434'}{/gray-fg}`);
      this.log('{gray-fg}请确保 Ollama 正在运行: ollama serve{/gray-fg}');
      this.screen.render();
      return;
    }

    // 初始化会话存储
    this.sessionStorage = getSessionStorage();
    await this.sessionStorage.initialize();

    // 初始化记忆
    const memoryManager = getMemoryManager();
    await memoryManager.initialize();

    // 获取当前 Agent
    const currentAgentId = options.defaultAgent ?? config.defaultAgent;
    const agent = agents.get(currentAgentId) ?? getDefaultAgent(agents);
    if (!agent) {
      this.log('{red-fg}错误: 找不到 Agent{/red-fg}');
      return;
    }

    // 初始化状态
    this.state = {
      config,
      agents,
      currentAgentId,
      modelAdapter,
      running: true,
      workspace: agent.workspace,
    };

    // 确保 agents 目录存在
    const agentsDir = join(process.cwd(), 'agents');
    if (!existsSync(agentsDir)) {
      mkdirSync(agentsDir, { recursive: true });
      this.log(`{gray-fg}已创建 agents 目录: ${agentsDir}{/gray-fg}`);
    }

    // 确保当前 Agent 的工作空间存在
    if (!existsSync(agent.workspace)) {
      mkdirSync(agent.workspace, { recursive: true });
      this.log(`{gray-fg}已创建工作空间: ${agent.workspace}{/gray-fg}`);
    }

    // 更新界面
    this.updateFileTree();
    this.updateStatus();
    this.log(`{green-fg}✓ SecureBot 已启动{/green-fg}`);
    this.log(`{cyan-fg}当前 Agent: ${agent.name}{/cyan-fg}`);
    this.log('{gray-fg}输入消息开始对话，按 F2 切换 Agent，按 F5 刷新文件树{/gray-fg}');
    this.log('');

    // 渲染并聚焦输入框
    this.screen.render();
    if (this.inputBox) {
      this.inputBox.focus();
    }
  }

  /**
   * 更新文件树
   */
  private updateFileTree(): void {
    if (!this.state) return;

    const workspace = this.state.workspace;
    
    if (!existsSync(workspace)) {
      this.fileTree.setItems(['工作区目录不存在']);
      this.filePaths = [];
      return;
    }

    const tree = buildFileTree(workspace);
    const { items, paths } = this.flattenTree(tree, workspace);
    
    this.filePaths = paths;
    
    if (items.length === 0) {
      this.fileTree.setItems(['(空目录)']);
    } else {
      this.fileTree.setItems(items);
    }

    this.screen.render();
  }

  /**
   * 展平文件树为列表
   */
  private flattenTree(nodes: FileNode[], basePath: string, prefix: string = ''): { items: string[]; paths: string[] } {
    const items: string[] = [];
    const paths: string[] = [];
    
    for (const node of nodes) {
      const icon = node.type === 'directory' ? '📁' : '📄';
      const indent = prefix.replace(/[^ ]/g, '  '); // 保持缩进
      
      items.push(`${indent}${icon} ${node.name}`);
      paths.push(node.path);
      
      if (node.type === 'directory' && node.children && node.children.length > 0) {
        const childResult = this.flattenTree(node.children, basePath, prefix + '  ');
        items.push(...childResult.items);
        paths.push(...childResult.paths);
      }
    }
    
    return { items, paths };
  }

  /**
   * 更新预览
   */
  private updatePreview(): void {
    if (!this.selectedFilePath) {
      this.previewBox.setContent('选择文件查看内容');
      this.screen.render();
      return;
    }

    const preview = getFilePreview(this.selectedFilePath);
    this.previewBox.setContent(preview);
    this.screen.render();
  }

  /**
   * 切换右侧面板显示
   */
  private toggleRightPanel(): void {
    this.showRightPanel = !this.showRightPanel;

    if (this.showRightPanel) {
      // 显示右侧面板 - 恢复分屏布局
      this.chatBox.width = '65%';
      this.inputBox.width = '65%';
      this.fileTree.show();
      this.previewBox.show();
      this.statusBar.show();
    } else {
      // 隐藏右侧面板 - 聊天窗口全屏
      this.chatBox.width = '100%';
      this.inputBox.width = '100%';
      this.fileTree.hide();
      this.previewBox.hide();
      this.statusBar.hide();
    }

    this.screen.render();
  }

  /**
   * 更新状态栏
   */
  private updateStatus(): void {
    if (!this.state) return;

    const agent = this.state.agents.get(this.state.currentAgentId);
    const status = this.isGenerating ? '{red-fg}生成中...{/red-fg}' : '{green-fg}就绪{/green-fg}';
    const panel = this.showRightPanel ? 'F4:隐藏面板' : 'F4:显示面板';
    const lines = [
      `{cyan-fg}Agent:{/cyan-fg} ${agent?.name ?? this.state.currentAgentId}`,
      `{blue-fg}模型:{/blue-fg} ${this.state.config.model.model}`,
      status,
      `{gray-fg}${panel} F2:切换{/gray-fg}`,
    ];

    this.statusBar.setContent(lines.join('\n'));
    this.screen.render();
  }

  /**
   * 显示 Agent 菜单
   */
  private showAgentMenu(): void {
    if (!this.state) return;

    const items = Array.from(this.state.agents.values()).map(a => 
      a.id === this.state!.currentAgentId ? `✓ ${a.name}` : `  ${a.name}`
    );

    // 创建临时列表
    const list = blessed.list({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '50%',
      height: '50%',
      label: ' 选择 Agent ',
      tags: true,
      keys: true,
      vi: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        selected: { bg: 'blue' },
      },
      items,
    });

    list.on('select', (_item: unknown, index: number) => {
      const agents = Array.from(this.state!.agents.keys());
      const selectedId = agents[index];
      if (selectedId) {
        const agent = this.state!.agents.get(selectedId);
        if (agent) {
          this.state!.currentAgentId = selectedId;
          this.state!.workspace = agent.workspace;
          this.log('');
          this.log(`{cyan-fg}═══════════════════════════════════════{/cyan-fg}`);
          this.log(`{white-fg}  🤖 切换到 ${agent.name}{/white-fg}`);
          this.log(`{cyan-fg}═══════════════════════════════════════{/cyan-fg}`);
          this.log('');
          this.updateFileTree();
          this.updateStatus();
        }
      }
      list.destroy();
      if (this.inputBox) this.inputBox.focus();
      this.screen.render();
    });

    list.key(['escape'], () => {
      list.destroy();
      if (this.inputBox) this.inputBox.focus();
      this.screen.render();
    });

    list.focus();
    this.screen.render();
  }

  /**
   * 处理输入
   */
  private async handleInput(message: string): Promise<void> {
    if (!this.state) return;

    // 处理命令
    if (message.startsWith('/')) {
      await this.handleCommand(message);
      return;
    }

    // 处理 @ 前缀
    if (message.startsWith('@')) {
      const parts = message.slice(1).split(' ', 2);
      const agentId = parts[0];
      const msg = parts[1] ?? '';
      
      if (agentId && this.state.agents.has(agentId)) {
        this.state.currentAgentId = agentId;
        const agent = this.state.agents.get(agentId)!;
        this.state.workspace = agent.workspace;
        this.log('');
        this.log(`{cyan-fg}═══════════════════════════════════════{/cyan-fg}`);
        this.log(`{white-fg}  🤖 切换到 ${agent.name}{/white-fg}`);
        this.log(`{cyan-fg}═══════════════════════════════════════{/cyan-fg}`);
        this.updateFileTree();
        this.updateStatus();
        
        if (msg) {
          await this.processMessage(msg);
        } else {
          this.log('');
        }
      } else {
        this.log(`{red-fg}Agent 不存在: ${agentId}{/red-fg}`);
      }
      return;
    }

    await this.processMessage(message);
  }

  /**
   * 处理命令
   */
  private async handleCommand(command: string): Promise<void> {
    const cmd = command.toLowerCase();

    if (['/exit', '/quit', '/q'].includes(cmd)) {
      await this.shutdown();
      process.exit(0);
      return;
    }

    if (cmd === '/help' || cmd === '/h') {
      this.showHelp();
      return;
    }

    if (cmd === '/clear') {
      this.chatBox.setContent('');
      this.screen.render();
      return;
    }

    if (cmd === '/agents') {
      this.log('{cyan-fg}可用 Agent:{/cyan-fg}');
      for (const [id, agent] of this.state!.agents) {
        const current = id === this.state!.currentAgentId ? ' ✓' : '';
        this.log(`  ${id} - ${agent.name}${current}`);
      }
      return;
    }

    if (cmd === '/skills') {
      await this.showSkills();
      return;
    }

    this.log(`{yellow-fg}未知命令: ${command}{/yellow-fg}`);
    this.log('{gray-fg}输入 /help 查看帮助{/gray-fg}');
  }

  /**
   * 显示技能
   */
  private async showSkills(): Promise<void> {
    if (!this.state) return;
    
    const agent = this.state.agents.get(this.state.currentAgentId);
    if (!agent) return;

    const skillManager = getSkillManager();
    const publicSkills = await skillManager.listPublicSkills();
    const privateSkills = await skillManager.listPrivateSkills(this.state.currentAgentId);

    this.log('');
    this.log(`{cyan-fg}📚 ${agent.name} 的技能{/cyan-fg}`);
    this.log('');

    // 公共技能
    this.log('{green-fg}公共技能:{/green-fg}');
    if (publicSkills.length === 0) {
      this.log('{gray-fg}  (无){/gray-fg}');
    } else {
      for (const skill of publicSkills) {
        const assigned = agent.skills?.includes(skill.id);
        const marker = assigned ? '{green-fg} ✓{/green-fg}' : '';
        this.log(`  ${skill.id} - ${skill.name}${marker}`);
      }
    }

    // 个人技能
    this.log('{yellow-fg}个人技能:{/yellow-fg}');
    if (privateSkills.length === 0) {
      this.log('{gray-fg}  (无){/gray-fg}');
    } else {
      for (const skill of privateSkills) {
        this.log(`  ${skill.id} - ${skill.name}`);
      }
    }

    this.log('{gray-fg}管理技能: securebot skill list/create/assign{/gray-fg}');
  }

  /**
   * 显示帮助
   */
  private showHelp(): void {
    const help = [
      '{cyan-fg}═══ 命令帮助 ═══{/cyan-fg}',
      '',
      '{white-fg}快捷键:{/white-fg}',
      '  F4       显示/隐藏右侧面板',
      '  F6       切换焦点 (输入框/文件树)',
      '  F2       切换 Agent',
      '  F5       刷新文件树',
      '  Esc      停止生成',
      '  Q        退出',
      '',
      '{white-fg}命令:{/white-fg}',
      '  /help     显示帮助',
      '  /exit     退出',
      '  /clear    清屏',
      '  /agents   列出 Agent',
      '  /skills   显示当前 Agent 的技能',
      '',
      '{white-fg}切换 Agent:{/white-fg}',
      '  @dev 消息     切换到开发助手并发送消息',
      '  @support      切换到客服助手',
    ];

    help.forEach(line => this.log(line));
  }

  /**
   * 处理消息
   */
  private async processMessage(message: string): Promise<void> {
    if (!this.state) return;

    const agent = this.state.agents.get(this.state.currentAgentId);
    if (!agent) return;

    // 显示用户消息
    this.log('');
    this.log(`{green-fg}你:{/green-fg} ${message}`);
    this.log('');
    this.log(`{cyan-fg}[${agent.name}]{/cyan-fg} `);

    // 设置生成状态
    this.isGenerating = true;
    this.updateStatus();

    // 获取会话
    const session = getOrCreateMainSession(agent);
    addUserMessage(session, message);

    // 获取工具
    const availableTools = getAvailableTools(agent, this.state.config.tools);

    // 加载技能提示词
    const skillManager = getSkillManager();
    const skillsPrompt = await skillManager.buildSkillsPrompt(agent.id, agent.skills);

    // 构建系统提示
    const systemPrompt = await buildSystemPrompt(
      agent,
      this.state.config,
      getAvailableToolNames(agent, this.state.config.tools),
      skillsPrompt
    );

    // 构建消息
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...session.history,
    ];

    // 用于累积流式内容
    let fullContent = '';

    try {
      // 流式输出回调
      const onStream: StreamCallback = (chunk) => {
        if (chunk.content) {
          fullContent += chunk.content;
          // 直接追加到最后
          this.appendStreamContent(chunk.content);
        }
      };

      // 调用模型（流式）
      const result = await this.state.modelAdapter.chatWithStream({
        model: this.state.config.model.model,
        messages,
        tools: availableTools.length > 0 ? availableTools : undefined,
        onStream,
      });

      // 最终显示
      if (!result.content) {
        result.content = fullContent;
      }

      // 保存到会话
      addAssistantMessage(session, result.content);

      if (this.sessionStorage) {
        await this.sessionStorage.saveSession(session);
      }

      // 换行
      this.log('');

      // 显示 Token 统计
      if (result.usage) {
        this.log(`{gray-fg}Token: ${result.usage.promptTokens} + ${result.usage.completionTokens} = ${result.usage.totalTokens}{/gray-fg}`);
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        this.log('\n{yellow-fg}[已停止]{/yellow-fg}');
      } else {
        const msg = error instanceof Error ? error.message : String(error);
        this.log(`{red-fg}错误: ${msg}{/red-fg}`);
      }
    } finally {
      this.isGenerating = false;
      this.updateStatus();
    }
  }

  /**
   * 追加流式内容
   */
  private appendStreamContent(content: string): void {
    // 直接追加到聊天框
    const currentContent = this.chatBox.getContent() as string;
    this.chatBox.setContent(currentContent + content);
    this.chatBox.setScrollPerc(100);
    this.screen.render();
  }

  /**
   * 输出日志
   */
  private log(message: string): void {
    const content = this.chatBox.getContent() as string;
    this.chatBox.setContent(content + (content ? '\n' : '') + message);
    this.chatBox.setScrollPerc(100);
    this.screen.render();
  }

  /**
   * 关闭
   */
  private async shutdown(): Promise<void> {
    if (this.sessionStorage && this.state) {
      // 保存会话
      for (const agent of this.state.agents.values()) {
        for (const session of agent.sessions.values()) {
          if (session.history.length > 0) {
            await this.sessionStorage.saveSession(session);
          }
        }
      }
    }
    this.screen.destroy();
  }
}

/**
 * 启动 TUI REPL
 */
export async function startTuiRepl(options: { defaultAgent?: string; model?: string } = {}): Promise<void> {
  const tui = new TuiRepl();
  await tui.start(options);
}