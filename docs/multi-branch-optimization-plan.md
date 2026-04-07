# SecureBot Multi 分支优化方案

**日期**: 2026-04-07  
**基于**: multi-branch-architecture-review.md  
**目标**: 提升代码质量、可维护性和性能

---

## 优化路线图

```
Phase 1 (1-2周)          Phase 2 (3-4周)          Phase 3 (1-2月)
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ • 拆分 Context  │     │ • 引入 Zustand  │     │ • 工作流可视化  │
│ • 拆分大类      │ ──▶ │ • 统一 CLI/TUI  │ ──▶ │ • 调试模式增强  │
│ • Service Layer │     │ • 事件总线      │     │ • 性能监控      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Phase 1: 立即优化（1-2周）

### 1.1 拆分 AppContext

**问题**: AppContext.tsx 526行，23+状态字段

**方案**: 拆分为 4 个独立 Context

```
src/cli/tui/context/
├── messages-context.tsx     # 消息相关
├── editor-context.tsx       # 编辑器相关
├── ui-context.tsx           # UI 状态
├── collaboration-context.tsx # 协作状态
└── index.tsx                # 组合导出
```

**实现步骤**:

```typescript
// Step 1: 创建 messages-context.tsx
import React, { createContext, useState, useCallback, useContext } from 'react';
import type { Message } from '../types/message.js';

interface MessagesContextValue {
  messages: Message[];
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, content: string) => void;
  clearMessages: () => void;
}

const MessagesContext = createContext<MessagesContextValue | null>(null);

export const MessagesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([]);

  const addMessage = useCallback((msg: Omit<Message, 'id' | 'timestamp'>) => {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newMessage: Message = { ...msg, id, timestamp: Date.now() };
    setMessages(prev => [...prev, newMessage]);
    return id;
  }, []);

  const updateMessage = useCallback((id: string, content: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, content } : m));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return (
    <MessagesContext.Provider value={{ messages, addMessage, updateMessage, clearMessages }}>
      {children}
    </MessagesContext.Provider>
  );
};

export const useMessages = () => {
  const context = useContext(MessagesContext);
  if (!context) throw new Error('useMessages must be used within MessagesProvider');
  return context;
};

// Step 2: 创建 editor-context.tsx
interface EditorContextValue {
  codeEditor: CodeEditorState | null;
  shellOutput: ShellOutputState | null;
  startCodeWriter: (path: string, content: string) => Promise<void>;
  startCodeEditor: (path: string, old?: string, new_?: string) => Promise<void>;
  startShellOutput: (command: string, cwd?: string) => void;
  addShellOutput: (type: 'stdout' | 'stderr', text: string) => void;
  finishShellOutput: (exitCode: number | null) => void;
  closeShellOutput: () => void;
}

// ... 类似实现

// Step 3: 创建 ui-context.tsx
interface UIContextValue {
  isStreaming: boolean;
  currentAgent: string;
  chatScrollOffset: number;
  // ... 其他 UI 状态
}

// Step 4: 创建 collaboration-context.tsx
interface CollaborationContextValue {
  agents: AgentInfo[];
  taskStatus: TaskStatus | null;
  skills: SkillInfo[];
  // ... 协作相关状态
}

// Step 5: 组合 Providers
// src/cli/tui/context/index.tsx
export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MessagesProvider>
    <EditorProvider>
      <UIProvider>
        <CollaborationProvider>
          {children}
        </CollaborationProvider>
      </UIProvider>
    </EditorProvider>
  </MessagesProvider>
);

// 导出 hooks
export { useMessages } from './messages-context.js';
export { useEditor } from './editor-context.js';
export { useUI } from './ui-context.js';
export { useCollaboration } from './collaboration-context.js';
```

**文件改动**:
- 新增: 4 个 Context 文件
- 修改: `App.tsx` 使用新 Context
- 删除: 旧 `AppContext.tsx`

**工作量**: 1 人日

---

### 1.2 拆分 collaboration.ts

**问题**: collaboration.ts 1856行，包含多个大类

**方案**: 拆分为独立模块

```
src/core/collaboration/
├── index.ts                  # 统一导出
├── types.ts                  # 类型定义（已存在，补充）
├── message-bus.ts            # AgentMessageBus
├── delegation-manager.ts     # DelegationManager
├── workspace-manager.ts      # SharedWorkspaceManager
├── collaboration-manager.ts  # 统一入口（精简）
├── config.ts                 # 配置类型
└── utils.ts                  # 工具函数
```

**实现步骤**:

```typescript
// Step 1: 提取类型到 types.ts
// src/core/collaboration/types.ts
export interface AgentMessage { /* ... */ }
export interface DelegationRequest { /* ... */ }
export interface SharedWorkspace { /* ... */ }
export interface CollaborationConfig {
  messageTimeout: number;
  maxDelegationDepth: number;
  autoAcceptDelegation: boolean;
  messageRetention: number;
}

// Step 2: 创建 message-bus.ts
export class AgentMessageBus {
  private messages: Map<string, AgentMessage[]> = new Map();
  private listeners: Map<string, Set<(msg: AgentMessage) => void>> = new Map();

  async sendMessage(message: Omit<AgentMessage, 'id' | 'createdAt' | 'status'>): Promise<string> {
    const msg: AgentMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: Date.now(),
      status: 'pending',
    };
    
    const agentMessages = this.messages.get(message.toAgent) || [];
    agentMessages.push(msg);
    this.messages.set(message.toAgent, agentMessages);
    
    this.notifyListeners(message.toAgent, msg);
    return msg.id;
  }

  getMessages(agentId: string): AgentMessage[] {
    return this.messages.get(agentId) || [];
  }

  subscribe(agentId: string, callback: (msg: AgentMessage) => void): () => void {
    if (!this.listeners.has(agentId)) {
      this.listeners.set(agentId, new Set());
    }
    this.listeners.get(agentId)!.add(callback);
    return () => this.listeners.get(agentId)?.delete(callback);
  }

  private notifyListeners(agentId: string, message: AgentMessage): void {
    this.listeners.get(agentId)?.forEach(cb => cb(message));
  }
}

// Step 3: 创建 delegation-manager.ts
export class DelegationManager {
  private delegations: Map<string, DelegationRequest> = new Map();
  private executionQueue: string[] = [];
  private isExecuting: boolean = false;

  async createDelegation(request: Omit<DelegationRequest, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'currentRound' | 'executionHistory' | 'reviewHistory' | 'conversationHistory'>): Promise<string> {
    const id = `del-${Date.now()}`;
    const delegation: DelegationRequest = {
      ...request,
      id,
      status: 'pending',
      currentRound: 0,
      executionHistory: [],
      reviewHistory: [],
      conversationHistory: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    this.delegations.set(id, delegation);
    this.executionQueue.push(id);
    this.processQueue();
    
    return id;
  }

  getDelegation(id: string): DelegationRequest | undefined {
    return this.delegations.get(id);
  }

  getPendingDelegations(agentId: string): DelegationRequest[] {
    return Array.from(this.delegations.values())
      .filter(d => d.delegatee === agentId && d.status === 'pending');
  }

  private async processQueue(): Promise<void> {
    if (this.isExecuting || this.executionQueue.length === 0) return;
    
    this.isExecuting = true;
    const id = this.executionQueue.shift()!;
    // ... 执行逻辑
    this.isExecuting = false;
    this.processQueue();
  }
}

// Step 4: 创建 workspace-manager.ts
export class SharedWorkspaceManager {
  private workspaces: Map<string, SharedWorkspace> = new Map();

  createWorkspace(id: string, agents: string[]): SharedWorkspace {
    const workspace: SharedWorkspace = {
      id,
      agents,
      files: new Map(),
      createdAt: Date.now(),
    };
    this.workspaces.set(id, workspace);
    return workspace;
  }

  getFile(workspaceId: string, path: string): string | undefined {
    return this.workspaces.get(workspaceId)?.files.get(path);
  }

  setFile(workspaceId: string, path: string, content: string): void {
    const workspace = this.workspaces.get(workspaceId);
    if (workspace) {
      workspace.files.set(path, { content, updatedAt: Date.now() });
    }
  }
}

// Step 5: 精简 collaboration-manager.ts
export class CollaborationManager {
  private messageBus: AgentMessageBus;
  private delegationManager: DelegationManager;
  private workspaceManager: SharedWorkspaceManager;

  constructor(config?: Partial<CollaborationConfig>) {
    this.messageBus = new AgentMessageBus();
    this.delegationManager = new DelegationManager();
    this.workspaceManager = new SharedWorkspaceManager();
  }

  getMessageBus(): AgentMessageBus {
    return this.messageBus;
  }

  getDelegationManager(): DelegationManager {
    return this.delegationManager;
  }

  getWorkspaceManager(): SharedWorkspaceManager {
    return this.workspaceManager;
  }
}
```

**工作量**: 2 人日

---

### 1.3 引入 Service Layer

**问题**: CLI 层直接依赖核心模块，难以测试和维护

**方案**: 创建 Service Layer 抽象

```
src/services/
├── index.ts
├── agent-service.ts
├── model-service.ts
├── collaboration-service.ts
├── memory-service.ts
└── types.ts
```

**实现步骤**:

```typescript
// Step 1: 定义服务接口
// src/services/types.ts
export interface AgentService {
  getDefaultAgent(): Promise<Agent>;
  createSession(agentId: string): Promise<Session>;
  executeMessage(message: string, context: ExecutionContext): Promise<void>;
  getAgent(id: string): Agent | undefined;
  listAgents(): Agent[];
}

export interface ModelService {
  chat(params: ChatParams): Promise<ChatResult>;
  stream(params: ChatParams, onChunk: (chunk: string) => void): Promise<void>;
  isAvailable(): boolean;
}

export interface CollaborationService {
  sendMessage(from: string, to: string, content: string): Promise<string>;
  createDelegation(request: DelegationRequest): Promise<string>;
  getWorkspace(id: string): SharedWorkspace | undefined;
}

// Step 2: 实现服务
// src/services/agent-service.ts
import { getAgentManager, Agent, Session } from '../core/agent.js';

export class AgentServiceImpl implements AgentService {
  async getDefaultAgent(): Promise<Agent> {
    const manager = getAgentManager();
    return manager.getDefaultAgent();
  }

  async createSession(agentId: string): Promise<Session> {
    const manager = getAgentManager();
    return manager.createSession(agentId);
  }

  async executeMessage(message: string, context: ExecutionContext): Promise<void> {
    // 业务逻辑封装
  }

  getAgent(id: string): Agent | undefined {
    return getAgentManager().getAgent(id);
  }

  listAgents(): Agent[] {
    return getAgentManager().listAgents();
  }
}

// Step 3: 服务容器
// src/services/index.ts
import { AgentServiceImpl } from './agent-service.js';
import { ModelServiceImpl } from './model-service.js';
import type { AgentService, ModelService } from './types.js';

class ServiceContainer {
  private services: Map<string, unknown> = new Map();

  register<T>(name: string, service: T): void {
    this.services.set(name, service);
  }

  resolve<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) throw new Error(`Service not found: ${name}`);
    return service as T;
  }
}

export const container = new ServiceContainer();

// 注册默认服务
container.register<AgentService>('AgentService', new AgentServiceImpl());
container.register<ModelService>('ModelService', new ModelServiceImpl());

// 导出便捷函数
export const getAgentService = () => container.resolve<AgentService>('AgentService');
export const getModelService = () => container.resolve<ModelService>('ModelService');

// Step 4: TUI 使用服务
// src/cli/tui/index.tsx
import { getAgentService, getModelService } from '../../services/index.js';

const handleSubmit = async (input: string) => {
  const agentService = getAgentService();
  const modelService = getModelService();
  
  const agent = await agentService.getDefaultAgent();
  await modelService.stream({ prompt: input }, (chunk) => {
    addMessage({ role: 'assistant', content: chunk });
  });
};
```

**工作量**: 2 人日

---

## Phase 2: 中期优化（3-4周）

### 2.1 引入 Zustand 状态管理

**问题**: Context 更新粒度过粗，性能不够优化

**方案**: 使用 Zustand 替代部分 Context

```typescript
// src/cli/tui/store/messages-store.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Message } from '../types/message.js';

interface MessagesState {
  messages: Message[];
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, content: string) => void;
  clearMessages: () => void;
}

export const useMessagesStore = create<MessagesState>()(
  immer((set, get) => ({
    messages: [],
    
    addMessage: (msg) => {
      const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      set((state) => {
        state.messages.push({ ...msg, id, timestamp: Date.now() });
      });
      return id;
    },
    
    updateMessage: (id, content) => {
      set((state) => {
        const msg = state.messages.find((m) => m.id === id);
        if (msg) msg.content = content;
      });
    },
    
    clearMessages: () => {
      set((state) => {
        state.messages = [];
      });
    },
  }))
);

// 组件使用（按需订阅，避免不必要的重渲染）
const MessageList: React.FC = () => {
  // 只订阅 messages，不会因为其他状态变化而重渲染
  const messages = useMessagesStore((s) => s.messages);
  return (
    <Box flexDirection="column">
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}
    </Box>
  );
};

// 添加消息的地方
const InputBox: React.FC = () => {
  const addMessage = useMessagesStore((s) => s.addMessage);
  // ...
};
```

**工作量**: 3 人日

---

### 2.2 统一 CLI/TUI 协作实现

**问题**: CLI 和 TUI 有两套重复的协作实现

**方案**: 抽象共享逻辑

```
src/cli/collaboration/
├── core/
│   ├── session-handler.ts    # 会话处理核心
│   ├── message-handler.ts    # 消息处理核心
│   └── state-manager.ts      # 状态管理
├── adapters/
│   ├── cli-adapter.ts        # CLI 适配器
│   └── tui-adapter.ts        # TUI 适配器
└── index.ts
```

```typescript
// core/session-handler.ts
export interface SessionHandler {
  onCreate(id: string): void;
  onMessage(id: string, message: string): void;
  onClose(id: string): void;
  onError(id: string, error: Error): void;
}

export class CollaborationSessionCore {
  private sessions: Map<string, SessionState> = new Map();
  private handlers: Set<SessionHandler> = new Set();

  registerHandler(handler: SessionHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async createSession(config: SessionConfig): Promise<string> {
    const id = `session-${Date.now()}`;
    this.sessions.set(id, { id, config, status: 'active' });
    this.handlers.forEach(h => h.onCreate(id));
    return id;
  }

  async sendMessage(sessionId: string, message: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    
    // 处理消息
    this.handlers.forEach(h => h.onMessage(sessionId, message));
  }
}

// adapters/tui-adapter.ts
export class TUIAdapter implements SessionHandler {
  private addMessage: (msg: Message) => void;

  constructor(ui: { addMessage: (msg: Message) => void }) {
    this.addMessage = ui.addMessage;
  }

  onMessage(sessionId: string, message: string): void {
    this.addMessage({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: message,
      timestamp: Date.now(),
    });
  }
  // ...
}

// 使用
const core = new CollaborationSessionCore();
const tuiAdapter = new TUIAdapter({ addMessage });

core.registerHandler(tuiAdapter);
await core.createSession({ agentId: 'dev' });
```

**工作量**: 5 人日

---

### 2.3 添加事件总线

**问题**: 模块间通信耦合度高

**方案**: 引入事件总线解耦

```typescript
// src/core/event-bus.ts
type EventCallback<T = unknown> = (data: T) => void | Promise<void>;

interface EventBus {
  on<T>(event: string, callback: EventCallback<T>): () => void;
  once<T>(event: string, callback: EventCallback<T>): void;
  emit<T>(event: string, data?: T): void;
  off(event: string, callback?: EventCallback): void;
}

class EventBusImpl implements EventBus {
  private listeners = new Map<string, Set<EventCallback>>();

  on<T>(event: string, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback);
    return () => this.off(event, callback);
  }

  once<T>(event: string, callback: EventCallback<T>): void {
    const wrapper: EventCallback<T> = (data) => {
      this.off(event, wrapper);
      return callback(data);
    };
    this.on(event, wrapper);
  }

  emit<T>(event: string, data?: T): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    
    callbacks.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Event callback error [${event}]:`, error);
      }
    });
  }

  off(event: string, callback?: EventCallback): void {
    if (!callback) {
      this.listeners.delete(event);
    } else {
      this.listeners.get(event)?.delete(callback);
    }
  }
}

export const eventBus = new EventBusImpl();

// 事件类型定义
export enum EventType {
  // Agent 相关
  AGENT_MESSAGE = 'agent:message',
  AGENT_SWITCH = 'agent:switch',
  AGENT_ERROR = 'agent:error',
  
  // 协作相关
  COLLABORATION_DELEGATE = 'collaboration:delegate',
  COLLABORATION_ACCEPT = 'collaboration:accept',
  COLLABORATION_COMPLETE = 'collaboration:complete',
  
  // UI 相关
  UI_MESSAGE_ADD = 'ui:message:add',
  UI_MESSAGE_UPDATE = 'ui:message:update',
  UI_CODE_START = 'ui:code:start',
  UI_SHELL_START = 'ui:shell:start',
}

// 使用示例
// 发送事件
eventBus.emit(EventType.AGENT_MESSAGE, {
  agentId: 'dev',
  message: 'Hello',
});

// 监听事件
const unsubscribe = eventBus.on(EventType.AGENT_MESSAGE, (data) => {
  console.log('Received:', data);
});

// 组件中使用
const MessageList: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    return eventBus.on(EventType.UI_MESSAGE_ADD, (msg) => {
      setMessages(prev => [...prev, msg]);
    });
  }, []);

  // ...
};
```

**工作量**: 2 人日

---

## Phase 3: 长期优化（1-2月）

### 3.1 工作流可视化

**目标**: DAG 可视化编辑和调试

```
src/cli/tui/components/workflow/
├── WorkflowEditor.tsx      # 工作流编辑器
├── NodePalette.tsx         # 节点面板
├── Canvas.tsx              # 画布
├── NodeProperties.tsx      # 节点属性面板
└── WorkflowDebugger.tsx    # 调试器
```

**工作量**: 15 人日

---

### 3.2 性能监控

**目标**: 实时性能指标收集和分析

```typescript
// src/core/performance-monitor.ts
interface PerformanceMetrics {
  messageCount: number;
  avgResponseTime: number;
  activeAgents: number;
  memoryUsage: number;
  cpuUsage: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private subscribers: Set<(metrics: PerformanceMetrics) => void> = new Set();

  startMonitoring(): void {
    setInterval(() => this.collect(), 5000);
  }

  private collect(): void {
    this.metrics = {
      messageCount: this.getMessageCount(),
      avgResponseTime: this.getAvgResponseTime(),
      activeAgents: this.getActiveAgents(),
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
      cpuUsage: process.cpuUsage().user / 1000,
    };
    this.notify();
  }

  subscribe(callback: (metrics: PerformanceMetrics) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notify(): void {
    this.subscribers.forEach(cb => cb(this.metrics));
  }
}
```

**工作量**: 5 人日

---

## 实施计划

### Week 1-2

| 任务 | 工作量 | 负责人 | 验收标准 |
|------|--------|--------|----------|
| 拆分 AppContext | 1人日 | - | 4个独立Context，单文件<200行 |
| 拆分 collaboration.ts | 2人日 | - | 单文件<500行 |
| Service Layer | 2人日 | - | CLI层通过Service访问Core |

### Week 3-4

| 任务 | 工作量 | 负责人 | 验收标准 |
|------|--------|--------|----------|
| Zustand 集成 | 3人日 | - | 消息列表性能提升50% |
| CLI/TUI 统一 | 5人日 | - | 删除重复代码 |
| 事件总线 | 2人日 | - | 所有模块通信通过事件 |

### Month 2

| 任务 | 工作量 | 负责人 | 验收标准 |
|------|--------|--------|----------|
| 工作流可视化 | 15人日 | - | 可视化编辑DAG |
| 性能监控 | 5人日 | - | 实时指标面板 |

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 重构引入Bug | 高 | 完善测试覆盖，增量发布 |
| 时间超期 | 中 | 分阶段交付，优先核心功能 |
| 性能回退 | 中 | 性能基准测试，对比验证 |

---

## 成功指标

| 指标 | 当前 | 目标 |
|------|------|------|
| 最大文件行数 | 1856 | <500 |
| Context 状态数 | 23+ | <10 |
| 测试覆盖率 | ~40% | >80% |
| 消息列表渲染时间 | ~100ms | <50ms |
| 代码重复率 | ~15% | <5% |

---

**文档版本**: 1.0  
**创建日期**: 2026-04-07  
**下次更新**: Phase 1 完成后