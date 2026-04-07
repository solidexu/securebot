# SecureBot Multi-Branch 架构审核报告

**分支**: multi  
**审核日期**: 2026-04-07  
**审核范围**: TUI/Ink 架构、协作系统架构、整体架构  

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [TUI/Ink 架构审核](#2-tuiink-架构审核)
3. [协作系统架构审核](#3-协作系统架构审核)
4. [整体架构分析](#4-整体架构分析)
5. [改进建议](#5-改进建议)
6. [优先级矩阵](#6-优先级矩阵)

---

## 1. 执行摘要

### 1.1 整体评价

| 维度 | 评分 | 说明 |
|------|------|------|
| 模块化 | ⭐⭐⭐⭐☆ | 层级清晰，但部分职责边界模糊 |
| 可维护性 | ⭐⭐⭐☆☆ | Context 过于臃肿，状态管理分散 |
| 性能 | ⭐⭐⭐⭐☆ | 虚拟化实现良好，但仍有优化空间 |
| 可扩展性 | ⭐⭐⭐⭐☆ | 协作系统设计灵活，模式切换机制完善 |
| 代码质量 | ⭐⭐⭐☆☆ | 存在重复代码，部分类型缺失 |

### 1.2 主要发现

**优点**:
- TUI 采用 React/Ink 实现，组件化良好
- 协作系统支持双模式执行（轻量级/LangGraph）
- 状态管理使用 Context，简化了组件间通信
- 虚拟化渲染优化，避免大量消息时的性能问题

**问题**:
- `AppContext` 承担过多职责（23+ 个状态字段 + 15+ 个方法）
- 协作系统类型定义分散（`src/core/collaboration.ts` 1800+ 行）
- 存在全局状态耦合（`abortCurrentExecution` 跨模块变量）
- 依赖注入机制缺失，模块间耦合度较高

---

## 2. TUI/Ink 架构审核

### 2.1 组件设计

#### 文件结构

```
src/cli/tui/
├── App.tsx                    # 主应用组件
├── index.tsx                  # 入口 + 消息处理器
├── context/
│   ├── AppContext.tsx        # 全局状态管理（526 行）
│   └── index.ts
├── components/
│   ├── chat/
│   │   ├── ChatPanel.tsx     # 聊天面板容器
│   │   ├── MessageList.tsx   # 消息列表（虚拟化）
│   │   ├── MessageItem.tsx    # 单条消息
│   │   ├── MessageItemMd.tsx  # Markdown 消息
│   │   ├── CodeEditor.tsx    # 代码编辑动画面板
│   │   └── ShellOutputPanel.tsx  # Shell 输出面板
│   ├── layout/
│   │   ├── MainLayout.tsx    # 主布局（左右分栏）
│   │   └── InputArea.tsx     # 输入区域包装
│   ├── input/
│   │   └── InputBox.tsx      # 输入框组件（423 行）
│   ├── status/
│   │   ├── StatusPanel.tsx   # 状态面板容器
│   │   ├── TaskStatus.tsx    # 任务状态
│   │   ├── AgentList.tsx     # Agent 列表
│   │   ├── SkillViewer.tsx   # 技能查看
│   │   └── LogViewer.tsx     # 日志查看
│   ├── collaboration/
│   │   └── CollaborationPanel.tsx  # 协作面板
│   └── common/
│       └── ScrollBar.tsx     # 滚动条组件
├── services/
│   └── MarkdownRenderer.tsx  # Markdown 渲染服务
├── styles/
│   └── theme.ts              # 主题配置
├── types/
│   ├── index.ts
│   ├── message.ts
│   └── agent.ts
└── utils/
    ├── AnimationManager.ts
    └── shell-commands.ts
```

#### 评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 组件粒度 | ⭐⭐⭐⭐☆ | 组件划分合理，职责单一 |
| 复用性 | ⭐⭐⭐☆☆ | 部分组件复用性不足（如 InputBox） |
| 可测试性 | ⭐⭐☆☆☆ | 组件与业务逻辑耦合紧密 |
| 命名一致性 | ⭐⭐⭐⭐☆ | 命名规范，遵循 React 惯例 |

#### 问题分析

**问题 1: AppContext 职责过重**

```tsx
// src/cli/tui/context/AppContext.tsx - 526 行
interface AppContextValue extends AppState {
  // 14 个状态字段
  messages: Message[];
  agents: AgentInfo[];
  currentAgent: string;
  taskStatus: TaskStatus | null;
  logs: LogEntry[];
  skills: SkillInfo[];
  isStreaming: boolean;
  inputHistory: string[];
  historyIndex: number;
  chatScrollOffset: number;
  // ... 10+ 个滚动偏移量
  codeEditor: {...} | null;
  shellOutput: {...} | null;
  
  // 15+ 个方法
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, content: string) => void;
  setAgents: (agents: AgentInfo[]) => void;
  // ... 更多方法
}
```

**影响**:
- Context 难以测试和维护
- 状态更新可能导致不必要的重渲染
- 新增功能需要修改核心文件

**建议**: 拆分 Context 为多个专门的 Context：
- `MessagesContext` - 消息状态
- `UIContext` - UI 状态（滚动、焦点、面板）
- `EditorContext` - 代码编辑器状态
- `CollaborationContext` - 协作状态

**问题 2: InputBox 组件职责过多**

`InputBox.tsx` (423 行) 承担了以下职责：
- 用户输入处理
- 键盘快捷键处理
- Tab 补全逻辑
- 消息滚动控制
- 焦点面板切换
- 历史导航

**建议**: 拆分职责：
- `useInput` hook - 输入处理逻辑
- `useKeyboardShortcuts` hook - 快捷键处理
- `useCompletion` hook - 补全逻辑
- `InputBox` 只保留 UI 渲染

**问题 3: 状态更新频繁触发重渲染**

```tsx
// AppContext.tsx - 第 343 行
const addMessage = useCallback((message: Omit<Message, 'id' | 'timestamp'>) => {
  const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const newMessage: Message = { ...message, id, timestamp: Date.now() };
  setMessages(prev => [...prev, newMessage]);  // 新数组引用
  return id;
}, []);
```

消息列表更新会导致所有使用 `useApp()` 的组件重渲染。

### 2.2 状态管理方案

#### 当前方案

使用 React Context + useState 的单例模式：

```tsx
// AppContext.tsx
const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  // ... 更多状态
  return <AppContext.Provider value={/* ... */}>{children}</AppContext.Provider>;
};
```

#### 优点

- 简单直观，无需额外依赖
- 适合中小型应用
- 类型安全

#### 缺点

- Context 过于臃肿
- 状态更新粒度过粗
- 缺乏时间旅行/撤销重做能力

#### 改进建议

**方案 A: 拆分 Context (推荐)**

```tsx
// messages-context.tsx
const MessagesContext = createContext<{
  messages: Message[];
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, content: string) => void;
} | null>(null);

// editor-context.tsx
const EditorContext = createContext<{
  codeEditor: CodeEditorState | null;
  shellOutput: ShellOutputState | null;
  // ...
} | null>(null);
```

**方案 B: 使用 Zustand**

```tsx
// store/app-store.ts
import { create } from 'zustand';

interface AppState {
  messages: Message[];
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => string;
  // ...
}

export const useAppStore = create<AppState>((set, get) => ({
  messages: [],
  addMessage: (msg) => {
    const id = `msg-${Date.now()}`;
    set(state => ({ messages: [...state.messages, { ...msg, id, timestamp: Date.now() }] }));
    return id;
  },
  // ...
}));
```

**方案 C: 使用 Jotai (Atom-based)**

```tsx
// atoms/messages.ts
const messagesAtom = atom<Message[]>([]);
const addMessageAtom = atom(null, (get, set, message) => {
  const id = `msg-${Date.now()}`;
  set(messagesAtom, [...get(messagesAtom), { ...message, id, timestamp: Date.now() }]);
  return id;
});
```

### 2.3 性能优化空间

#### 虚拟化渲染

**已有优化**:
- `MessageList` 使用虚拟化渲染（固定窗口 30 行）
- `CodeEditor` 使用视口计算，只渲染可见区域

**可改进点**:

1. **消息列表合并渲染**
```tsx
// 当前：每次新消息触发完整重算
const allLines = useMemo(() => flattenAllMessages(messages), [messages]);

// 建议：使用 react-window 或 @tanstack/virtual
import { VariableSizeList } from 'react-window';

const MessageRow = ({ index, style }) => (
  <div style={style}>{messages[index].content}</div>
);
```

2. **状态更新优化**
```tsx
// 当前：直接更新导致重渲染
setMessages(prev => [...prev, newMessage]);

// 建议：使用 Immer 或 immer 减少重渲染
import { produce } from 'immer';
setMessages(produce(draft => {
  draft.push(newMessage);
}));
```

3. **动画优化**
```tsx
// 当前：setInterval 驱动动画
codeEditorTimerRef.current = setInterval(() => {
  // ...
}, 35);

// 建议：使用 requestAnimationFrame
const animate = () => {
  // ...
  if (!done) requestAnimationFrame(animate);
};
requestAnimationFrame(animate);
```

### 2.4 React 最佳实践

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 组件函数化 | ✅ | 所有组件使用 FC |
| Hooks 规则 | ⚠️ | `useCallback` 依赖数组不完整 |
| Context 拆分 | ❌ | Context 过于臃肿 |
| 懒加载 | ❌ | 无代码分割 |
| Memo 优化 | ⚠️ | 部分组件未使用 `React.memo` |
| TypeScript | ✅ | 完整类型定义 |

**问题代码示例**:

```tsx
// index.tsx - 第 242 行
const handleSubmit = useCallback(async (input: string) => {
  // ...
}, [addMessage, addLog, onMessage, setCurrentAgent, setIsStreaming, 
    startCodeWriter, startCodeEditor, updateMessage, setTaskStatus, currentAgent]);
```

**问题**: 依赖数组过长，容易遗漏或产生 stale closure。

---

## 3. 协作系统架构审核

### 3.1 模块划分

#### 文件结构

```
src/core/collaboration/
├── index.ts              # 统一导出
├── types.ts              # 类型定义
├── collaboration.ts      # 核心类 (1800+ 行)
│   ├── AgentMessageBus   # 消息总线
│   ├── DelegationManager  # 任务委派管理器
│   ├── SharedWorkspaceManager  # 共享工作空间
│   └── CollaborationManager  # 统一入口
├── graph.ts              # 图结构
├── builder.ts            # 图构建器
├── executor.ts           # 执行器
├── orchestrator.ts       # 统一协调器
├── langgraph-adapter.ts  # LangGraph 适配器
├── streaming.ts           # 流式执行
├── memory-store.ts       # 记忆存储
├── reducers.ts           # Reducer 注册表
├── loader.ts             # 配置加载器
├── collaboration-session.ts     # 协作会话（CLI）
├── collaboration-session-manager.ts  # 会话管理器
├── collaboration-session-ui.ts      # 会话 UI
└── collaboration-sync.ts  # 文件同步
```

#### 模块依赖图

```
┌─────────────────────────────────────────────────────────────┐
│                    CollaborationManager                     │
│                         (协调入口)                           │
├─────────────────────────────────────────────────────────────┤
│  AgentMessageBus  │  DelegationManager  │  WorkspaceManager │
│    (消息总线)     │    (任务委派)        │   (共享工作空间)   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    UnifiedOrchestrator                     │
│                      (统一协调器)                           │
├─────────────────────────────────────────────────────────────┤
│     GraphExecutor     │      LangGraphAdapter              │
│     (轻量级模式)       │       (LangGraph模式)               │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 接口设计评估

#### 核心接口

```typescript
// types.ts
export interface AgentMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  type: 'request' | 'response' | 'notification' | 'delegation' | 'query';
  content: string;
  taskId?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'pending' | 'delivered' | 'read' | 'processed' | 'failed';
  createdAt: number;
  processedAt?: number;
  replyTo?: string;
  metadata?: Record<string, unknown>;
}

export interface DelegationRequest {
  id: string;
  delegator: string;
  delegatee: string;
  task: string;
  acceptanceCriteria?: string[];
  expectedDeliverables?: string[];
  context?: string;
  deadline?: number;
  priority: 'low' | 'normal' | 'high';
  sharedWorkspace?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'in_progress' | 'pending_review' | 'completed' | 'failed';
  currentRound: number;
  maxRounds: number;
  executionHistory: ExecutionRecord[];
  reviewHistory: ReviewRecord[];
  result?: string;
  reviewFeedback?: string;
  conversationHistory: ConversationMessage[];
  unreadCount?: number;
  retryCount?: number;
  createdAt: number;
  updatedAt: number;
}
```

#### 评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 清晰度 | ⭐⭐⭐⭐☆ | 接口定义清晰，字段语义明确 |
| 完整性 | ⭐⭐⭐⭐⭐ | 覆盖完整的状态流转 |
| 可扩展性 | ⭐⭐⭐⭐☆ | 支持 metadata 扩展 |
| 一致性 | ⭐⭐⭐☆☆ | 部分字段命名不一致 |

### 3.3 冗余与缺失

#### 冗余

**问题 1: 双套消息历史**

- `DelegationRequest.conversationHistory` - 委派任务对话历史
- `AgentMessageBus` - 独立的消息队列

**问题 2: CLI 和 TUI 重复实现**

```
src/cli/
├── collaboration-session.ts      # 233 行
├── collaboration-session-manager.ts  # 188 行
└── collaboration-session-ui.ts   # 234 行

src/cli/tui/components/collaboration/
└── CollaborationPanel.tsx       # 100 行
```

两套实现功能高度相似，缺乏复用。

**问题 3: 状态管理分散**

```typescript
// DelegationManager 内部状态
private delegations: Map<string, DelegationRequest> = new Map();
private executionQueue: string[] = [];
private isExecuting: boolean = false;
private eventListeners: Map<string, Set<() => void>> = new Map();

// 同时使用文件系统作为持久化
```

缺乏统一的状态管理抽象。

#### 缺失

**缺失 1: 错误恢复机制**

```typescript
// executor.ts - 缺少重试配置
interface RunOptions {
  timeout?: number;
  // 缺少: retryConfig, maxRetries, backoffStrategy
}
```

**缺失 2: 监控指标**

```typescript
// CollaborationManager 缺少指标暴露
getStats(agentId?: string) {
  // 只返回基础统计，缺少性能指标
}
```

**缺失 3: 健康检查**

```typescript
// 缺少系统健康状态检查
healthCheck(): {
  messageBus: boolean;
  executor: boolean;
  memory: boolean;
}
```

### 3.4 模式切换机制

```typescript
// orchestrator.ts - 双模式支持
export class UnifiedOrchestrator {
  async run(input: string, options?: RunOptions): Promise<ExecutionResult> {
    if (this.mode === 'lightweight') {
      return this.runLightweight(input, onEvent);
    } else {
      return this.runLangGraph(input, options?.threadId, onEvent);
    }
  }
}
```

**优点**:
- 渐进式采用新框架
- 支持降级
- 配置灵活

**缺点**:
- 执行器抽象不够彻底
- 事件格式不一致
- 状态管理割裂

---

## 4. 整体架构分析

### 4.1 层级结构

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Layer                            │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │  REPL   │  │   TUI   │  │Commands │  │ Daemon  │     │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘     │
├───────┴─────────────┴─────────────┴─────────────┴───────────┤
│                     Business Logic Layer                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │Collaboration│  │   Skills   │  │   Memory    │        │
│  │  Manager    │  │   System   │  │   Manager   │        │
│  └──────┬──────┘  └──────┬─────┘  └──────┬─────┘        │
├─────────┴─────────────────┴───────────────┴───────────────┤
│                    Core Layer                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Config  │  │  Agent   │  │ Session  │  │   Tool   │  │
│  │  Manager │  │  Manager │  │  Storage │  │ Registry │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    Model Layer                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Ollama    │  │  Model      │  │  Streaming  │        │
│  │  Adapter    │  │   Router    │  │   Handler   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 依赖关系分析

#### 关键依赖路径

```
CLI Layer
    │
    ├── REPL → Core/Agent, Core/Session, Tools/...
    ├── TUI → Core/Agent, Core/Session, Model/Ollama, Tools/...
    └── Commands → Core/* (几乎所有核心模块)
    
Core Layer
    │
    ├── Config ← CLI, Collaboration, Skills, Memory
    ├── Agent ← CLI, Collaboration, Tools
    ├── Session ← CLI, Agent, Collaboration
    └── Skills ← CLI, Agent, RAG
```

#### 问题分析

**问题 1: CLI 层直接依赖核心模块**

```typescript
// src/cli/tui/index.tsx - 第 6-22 行
import { loadConfig, createDefaultConfig } from '../../core/config.js';
import { createAgents, getDefaultAgent, getOrCreateMainSession } from '../../core/agent.js';
import { OllamaAdapter } from '../../model/ollama.js';
import { getAvailableTools, getAvailableToolNames, executeTool } from '../../tools/index.js';
// ... 更多导入
```

**建议**: 引入 Service Layer 抽象

```typescript
// src/services/
export interface AgentService {
  getDefaultAgent(): Agent;
  createSession(agentId: string): Session;
  executeMessage(message: string, context: ExecutionContext): Promise<void>;
}

export interface ModelService {
  chat(params: ChatParams): Promise<ChatResult>;
  stream(params: ChatParams, onChunk: StreamCallback): Promise<void>;
}

// TUI 依赖 Service 而非直接依赖 Core
import { AgentService, ModelService } from '../../services/index.js';
```

**问题 2: 循环依赖风险**

```typescript
// plan-state-machine.ts 引用 repl-plan.ts
import { savePlanToSession } from '../cli/repl-plan.js';

// repl-plan.ts 可能也引用了 plan-state-machine
```

### 4.3 循环依赖检查

| 模块对 | 风险等级 | 说明 |
|--------|----------|------|
| Core ↔ CLI | ⚠️ 中 | TUI 直接依赖核心模块 |
| Collaboration ↔ Skills | ✅ 低 | 通过事件解耦 |
| Agent ↔ Session | ⚠️ 中 | 相互引用但有单向数据流 |
| Plan ↔ REPL | ❌ 高 | 检测到潜在循环 |

### 4.4 依赖注入缺失

**当前实现**: 直接导入模块

```typescript
// src/cli/tui/index.tsx
import { getSkillManager } from '../../core/skills.js';
import { getMemoryManager } from '../../core/memory.js';

// 使用全局单例
const skillManager = getSkillManager();
```

**问题**:
- 难以测试（无法 mock）
- 模块间耦合紧密
- 配置不灵活

**建议**: 引入依赖注入容器

```typescript
// src/di/container.ts
import { createContainer } from 'tiny-injector';

const container = createContainer();

// 注册服务
container.register('AgentService', AgentService);
container.register('ModelService', OllamaAdapter);

// 解析依赖
const agentService = container.resolve('AgentService');

// 或使用装饰器
class TuiComponent {
  @inject('AgentService')
  private agentService!: AgentService;
}
```

---

## 5. 改进建议

### 5.1 TUI/Ink 架构改进

#### 短期改进（1-2 周）

| 改进项 | 工作量 | 影响 |
|--------|--------|------|
| 拆分 AppContext | 1 人日 | 提升可维护性 |
| 优化动画实现 | 0.5 人日 | 提升性能 |
| 添加组件文档 | 0.5 人日 | 提升可维护性 |

**拆分 AppContext 示例**:

```typescript
// src/cli/tui/context/messages-context.ts
export const MessagesContext = createContext<{
  messages: Message[];
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, content: string) => void;
} | null>(null);

// src/cli/tui/context/editor-context.ts
export const EditorContext = createContext<{
  codeEditor: CodeEditorState | null;
  shellOutput: ShellOutputState | null;
  startCodeWriter: (path: string, content: string) => Promise<void>;
  // ...
} | null>(null);
```

#### 中期改进（1-2 月）

| 改进项 | 工作量 | 影响 |
|--------|--------|------|
| 引入 Zustand/Jotai | 3 人日 | 提升状态管理 |
| 添加虚拟化列表 | 2 人日 | 提升大列表性能 |
| 组件测试覆盖 | 5 人日 | 提升代码质量 |

#### 长期改进（3-6 月）

| 改进项 | 工作量 | 影响 |
|--------|--------|------|
| 重构为微前端架构 | 20 人日 | 提升可扩展性 |
| 添加可视化调试器 | 15 人日 | 提升开发体验 |

### 5.2 协作系统改进

#### 短期改进

```typescript
// 1. 提取类型到独立文件
// src/core/collaboration/types.ts
export interface CollaborationConfig {
  messageTimeout: number;
  maxDelegationDepth: number;
  autoAcceptDelegation: boolean;
  messageRetention: number;
}

// 2. 拆分大类为多个小类
// src/core/collaboration/message-bus.ts
export class AgentMessageBus {
  // 消息发送/接收
}

// src/core/collaboration/delegation-manager.ts
export class DelegationManager {
  // 任务委派
}

// 3. 添加健康检查
export interface SystemHealth {
  messageBus: boolean;
  delegationManager: boolean;
  storage: boolean;
  lastCheck: number;
}
```

#### 中期改进

| 改进项 | 工作量 | 影响 |
|--------|--------|------|
| 统一 CLI/TUI 协作实现 | 5 人日 | 减少代码重复 |
| 添加错误恢复机制 | 3 人日 | 提升稳定性 |
| 完善监控指标 | 2 人日 | 提升可观测性 |

### 5.3 对标最佳实践

#### Claude Code 对标

Claude Code 的架构特点：
- 流式输出优先
- 事件驱动架构
- 插件化工具系统

**借鉴点**:
1. 事件总线统一通信
```typescript
// Claude Code 风格
eventBus.emit('agent:message', { agentId, message });
eventBus.on('tool:result', handleToolResult);
```

2. 流式渲染优化
```typescript
// 使用 Web Streams API
async function* streamResponse(prompt: string): AsyncGenerator<string> {
  const response = await fetch('/api/chat', {
    body: JSON.stringify({ prompt }),
  });
  const reader = response.body?.getReader();
  // ...
}
```

#### OpenCode 对标

OpenCode 的架构特点：
- 模块化设计
- 配置驱动
- 测试覆盖率高

**借鉴点**:
1. 配置驱动架构
```typescript
// 配置文件
interface TuiConfig {
  theme: ThemeConfig;
  layout: LayoutConfig;
  animations: AnimationConfig;
}

// 使用配置而非硬编码
const { theme } = loadConfig<TuiConfig>('tui');
```

2. 测试覆盖率要求
```typescript
// 测试覆盖率 > 80%
describe('CollaborationManager', () => {
  it('should send message', () => { /* ... */ });
  // 边界条件测试
  it('should handle timeout', () => { /* ... */ });
});
```

#### DeerFlow 对标

DeerFlow 的架构特点：
- 工作流引擎
- 可视化 DAG
- 调试能力强

**借鉴点**:
1. 工作流可视化
```typescript
interface WorkflowNode {
  id: string;
  type: 'agent' | 'tool' | 'condition';
  config: NodeConfig;
  inputs: string[];
  outputs: string[];
}

interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}
```

2. 调试模式
```typescript
// 调试模式支持
if (debugMode) {
  console.log('Node execution:', node.id);
  console.log('State:', state);
}
```

### 5.4 具体优化方案

#### 方案 1: 重构 Context 结构

```typescript
// 1. 创建细粒度 Context
// src/cli/tui/context/messages-context.ts
export const MessagesContext = createContext<MessagesContextValue | null>(null);

export const MessagesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  
  const addMessage = useCallback((msg) => {
    const id = `msg-${Date.now()}`;
    setMessages(prev => [...prev, { ...msg, id, timestamp: Date.now() }]);
    return id;
  }, []);
  
  const updateMessage = useCallback((id, content) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, content } : m));
  }, []);
  
  return (
    <MessagesContext.Provider value={{ messages, addMessage, updateMessage }}>
      {children}
    </MessagesContext.Provider>
  );
};

// 2. 拆分其他 Context
// src/cli/tui/context/editor-context.ts
// src/cli/tui/context/ui-context.ts
// src/cli/tui/context/collaboration-context.ts

// 3. 组合 Providers
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
```

#### 方案 2: 引入状态管理库

```typescript
// src/cli/tui/store/index.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface MessagesState {
  messages: Message[];
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, content: string) => void;
}

export const useMessagesStore = create<MessagesState>()(
  immer((set) => ({
    messages: [],
    addMessage: (msg) => {
      const id = `msg-${Date.now()}`;
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
  }))
);

// 组件使用
const MessageList: React.FC = () => {
  const messages = useMessagesStore((s) => s.messages);
  const addMessage = useMessagesStore((s) => s.addMessage);
  // ...
};
```

#### 方案 3: 添加事件总线

```typescript
// src/core/event-bus.ts
type EventCallback<T = unknown> = (data: T) => void | Promise<void>;

interface EventBus {
  on<T>(event: string, callback: EventCallback<T>): () => void;
  emit<T>(event: string, data?: T): void;
  once<T>(event: string, callback: EventCallback<T>): void;
}

// 实现
class EventBusImpl implements EventBus {
  private listeners = new Map<string, Set<EventCallback>>();
  
  on<T>(event: string, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback);
    
    // 返回取消订阅函数
    return () => {
      this.listeners.get(event)?.delete(callback as EventCallback);
    };
  }
  
  emit<T>(event: string, data?: T): void {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Event callback error: ${event}`, error);
      }
    });
  }
}

// 导出单例
export const eventBus = new EventBusImpl();

// 组件使用
const TuiComponent: React.FC = () => {
  useEffect(() => {
    const unsubscribe = eventBus.on('agent:message', (data) => {
      console.log('New message:', data);
    });
    return unsubscribe;
  }, []);
};
```

---

## 6. 优先级矩阵

### 高优先级（立即处理）

| 问题 | 影响 | 建议 |
|------|------|------|
| AppContext 臃肿 | 可维护性 | 拆分 Context |
| 类型定义集中 | 可维护性 | 提取到独立文件 |
| 缺少依赖注入 | 可测试性 | 引入 DI 容器 |

### 中优先级（2-4 周）

| 问题 | 影响 | 建议 |
|------|------|------|
| 动画性能 | 用户体验 | 优化渲染逻辑 |
| 测试覆盖 | 代码质量 | 添加单元测试 |
| CLI/TUI 重复 | 代码重复 | 统一实现 |

### 低优先级（长期规划）

| 问题 | 影响 | 建议 |
|------|------|------|
| 架构演进 | 可扩展性 | 微前端架构 |
| 可视化调试 | 开发体验 | DAG 可视化 |
| 云部署支持 | 可用性 | 无服务器架构 |

---

## 附录

### A. 文件清单

```
src/cli/tui/
├── App.tsx                     (275 行)
├── index.tsx                   (653 行)
├── context/
│   └── AppContext.tsx          (526 行) ⚠️ 过大
├── components/
│   ├── chat/
│   │   ├── ChatPanel.tsx      (76 行)
│   │   ├── MessageList.tsx     (203 行)
│   │   ├── MessageItem.tsx     (~50 行)
│   │   ├── MessageItemMd.tsx   (~50 行)
│   │   ├── CodeEditor.tsx      (216 行)
│   │   └── ShellOutputPanel.tsx (80 行)
│   ├── layout/
│   │   ├── MainLayout.tsx      (33 行)
│   │   └── InputArea.tsx       (~20 行)
│   ├── input/
│   │   └── InputBox.tsx         (423 行) ⚠️ 过大
│   ├── status/
│   │   ├── StatusPanel.tsx      (113 行)
│   │   ├── TaskStatus.tsx       (~50 行)
│   │   ├── AgentList.tsx        (~50 行)
│   │   ├── SkillViewer.tsx      (~50 行)
│   │   └── LogViewer.tsx        (~50 行)
│   ├── collaboration/
│   │   └── CollaborationPanel.tsx (100 行)
│   └── common/
│       └── ScrollBar.tsx        (~50 行)
├── services/
│   └── MarkdownRenderer.tsx     (179 行)
├── styles/
│   └── theme.ts                (88 行)
└── types/
    ├── index.ts                (2 行)
    ├── message.ts              (~30 行)
    └── agent.ts                (~30 行)

src/core/collaboration/
├── index.ts                    (26 行)
├── types.ts                   (~200 行)
├── collaboration.ts           (1856 行) ⚠️ 过大
├── graph.ts                   (~200 行)
├── builder.ts                 (~200 行)
├── executor.ts                (~300 行)
├── orchestrator.ts            (308 行)
├── langgraph-adapter.ts       (~300 行)
├── streaming.ts               (~150 行)
├── memory-store.ts            (~200 行)
├── reducers.ts                (~100 行)
└── loader.ts                  (~150 行)

src/cli/
├── collaboration-session.ts     (233 行)
├── collaboration-session-manager.ts (188 行)
├── collaboration-session-ui.ts (234 行)
└── collaboration-sync.ts       (83 行)
```

### B. 关键指标

| 指标 | 当前值 | 目标值 |
|------|--------|--------|
| 最大组件行数 | 653 | <200 |
| 最大类行数 | 1856 | <500 |
| Context 状态数 | 23+ | <10 |
| 测试覆盖率 | ~40% | >80% |
| 模块耦合度 | 高 | 中 |

### C. 参考资料

1. React 官方文档 - Context 最佳实践
2. Ink 官方文档 - CLI 组件开发
3. Zustand 官方文档 - 状态管理
4. Martin Fowler - 微服务设计
5. Clean Architecture - Robert C. Martin
