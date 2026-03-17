# SecureBot 事件驱动架构设计

## 一、当前架构问题分析

### 1.1 依赖关系现状

```
┌─────────────────────────────────────────────────────────────┐
│                        repl.ts (主控制器)                     │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  直接调用:                                                ││
│  │  - memoryManager.remember()                             ││
│  │  - memoryManager.getStats()                             ││
│  │  - confirmationManager.requestConfirmation()            ││
│  │  - auditLogger.logToolCall()                            ││
│  │  - executeTool()                                         ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
         ↓              ↓              ↓              ↓
   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │ Memory   │   │Confirm   │   │ Audit    │   │ Tools    │
   │ Manager  │   │ Manager  │   │ Logger   │   │          │
   └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

### 1.2 核心问题

| 问题 | 说明 |
|------|------|
| **紧耦合** | repl.ts 直接依赖 4+ 个系统，修改任一系统都需要改 repl.ts |
| **职责不清** | 记忆/审计/确认逻辑散落在多处 |
| **难以扩展** | 添加新的横切关注点（如性能监控）需要到处修改 |
| **难以测试** | 系统 A 依赖系统 B，单元测试需要 mock 大量依赖 |
| **重复调用** | 同样的记忆记录逻辑在多处重复 |

---

## 二、事件驱动架构设计

### 2.1 核心概念

```
┌─────────────────────────────────────────────────────────────┐
│                      Event Bus (事件总线)                     │
│                                                              │
│  publish(event)  →  所有订阅者收到通知                        │
│  subscribe(type, handler)  →  注册事件处理器                  │
└─────────────────────────────────────────────────────────────┘
         ↑              ↑              ↑              ↑
         │ publish      │ publish      │ publish      │
   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │ repl.ts  │   │  tools/  │   │  agent   │   │  其他    │
   │ (生产者) │   │ (生产者) │   │ (生产者) │   │ (生产者) │
   └──────────┘   └──────────┘   └──────────┘   └──────────┘
                      
         ↓              ↓              ↓              ↓
         │ subscribe    │ subscribe    │ subscribe    │
   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │ Memory   │   │ Audit    │   │ Confirm  │   │ Monitor  │
   │ Handler  │   │ Handler  │   │ Handler  │   │ Handler  │
   │ (消费者) │   │ (消费者) │   │ (消费者) │   │ (消费者) │
   └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

### 2.2 事件类型定义

```typescript
// src/core/events.ts

/** 事件基础接口 */
interface Event<T = unknown> {
  type: string;
  timestamp: Date;
  agentId: string;
  sessionId: string;
  payload: T;
}

/** 用户消息事件 */
interface UserMessageEvent extends Event<{
  message: string;
  complexity: 'simple' | 'complex';
}> {
  type: 'user:message';
}

/** 工具调用事件 */
interface ToolCallEvent extends Event<{
  toolName: string;
  arguments: Record<string, unknown>;
  result?: 'pending' | 'success' | 'failure';
  error?: string;
  duration?: number;
}> {
  type: 'tool:call' | 'tool:success' | 'tool:failure';
}

/** 任务事件 */
interface TaskEvent extends Event<{
  taskDescription: string;
  planId?: string;
  stepId?: string;
  status?: 'started' | 'completed' | 'failed';
}> {
  type: 'task:start' | 'task:complete' | 'task:fail' | 'task:plan';
}

/** 确认事件 */
interface ConfirmationEvent extends Event<{
  toolName: string;
  arguments: Record<string, unknown>;
  risk: string;
  decision: 'approved' | 'denied' | 'remembered';
}> {
  type: 'confirmation:request' | 'confirmation:approve' | 'confirmation:deny';
}

/** 会话事件 */
interface SessionEvent extends Event<{
  action: 'start' | 'end' | 'save' | 'restore';
  planStatus?: {
    hasPlan: boolean;
    completedSteps: number;
    totalSteps: number;
  };
}> {
  type: 'session:start' | 'session:end' | 'session:save' | 'session:restore';
}
```

### 2.3 事件总线实现

```typescript
// src/core/event-bus.ts

type EventHandler<T = unknown> = (event: Event<T>) => void | Promise<void>;

class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private middleware: Array<(event: Event) => Event | null> = [];

  /** 订阅事件 */
  subscribe<T>(eventType: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as EventHandler);
    
    // 返回取消订阅函数
    return () => {
      this.handlers.get(eventType)?.delete(handler as EventHandler);
    };
  }

  /** 发布事件 */
  async publish<T>(event: Event<T>): Promise<void> {
    // 执行中间件
    let processedEvent = event;
    for (const mw of this.middleware) {
      processedEvent = mw(processedEvent);
      if (!processedEvent) return; // 中间件可以阻止事件
    }

    // 通知所有订阅者
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      await Promise.all(
        Array.from(handlers).map(h => h(processedEvent))
      );
    }
  }

  /** 添加中间件 */
  use(middleware: (event: Event) => Event | null): void {
    this.middleware.push(middleware);
  }
}

// 单例
export const eventBus = new EventBus();
```

### 2.4 事件处理器（消费者）

```typescript
// src/core/handlers/memory-handler.ts

/** 记忆系统事件处理器 */
export function setupMemoryHandler(memoryManager: MemoryManager) {
  // 用户消息 → 记录到记忆
  eventBus.subscribe<UserMessageEvent>('user:message', async (event) => {
    await memoryManager.remember(
      event.agentId,
      `用户请求: ${event.payload.message}`,
      'conversation'
    );
  });

  // 任务完成 → 记录到记忆
  eventBus.subscribe<TaskEvent>('task:complete', async (event) => {
    await memoryManager.remember(
      event.agentId,
      `完成任务: ${event.payload.taskDescription}`,
      'task'
    );
  });

  // 工具调用成功 → 记录重要操作
  eventBus.subscribe<ToolCallEvent>('tool:success', async (event) => {
    if (['write', 'edit', 'exec'].includes(event.payload.toolName)) {
      await memoryManager.remember(
        event.agentId,
        `${event.payload.toolName}: ${JSON.stringify(event.payload.arguments).slice(0, 100)}`,
        'task'
      );
    }
  });
}

// src/core/handlers/audit-handler.ts

/** 审计系统事件处理器 */
export function setupAuditHandler(auditLogger: AuditLogger) {
  // 工具调用 → 审计日志
  eventBus.subscribe<ToolCallEvent>('tool:call', (event) => {
    auditLogger.logToolCall(
      event.agentId,
      event.sessionId,
      event.payload.toolName,
      event.payload.arguments,
      'pending'
    );
  });

  eventBus.subscribe<ToolCallEvent>('tool:success', (event) => {
    auditLogger.logToolCall(
      event.agentId,
      event.sessionId,
      event.payload.toolName,
      event.payload.arguments,
      'success',
      undefined,
      event.payload.duration
    );
  });

  eventBus.subscribe<ToolCallEvent>('tool:failure', (event) => {
    auditLogger.logToolCall(
      event.agentId,
      event.sessionId,
      event.payload.toolName,
      event.payload.arguments,
      'failure',
      event.payload.error
    );
  });
}
```

### 2.5 重构后的调用方式

```typescript
// 重构前 (repl.ts)
const memoryManager = getMemoryManager();
await memoryManager.remember(agent.id, `用户请求: ${message}`, 'conversation');

// 重构后
await eventBus.publish({
  type: 'user:message',
  timestamp: new Date(),
  agentId: agent.id,
  sessionId: session.sessionKey,
  payload: { message, complexity }
});
```

---

## 三、可行性评估

### 3.1 优势

| 优势 | 说明 |
|------|------|
| ✅ 解耦 | 生产者和消费者互不依赖，可独立开发测试 |
| ✅ 扩展性 | 新增功能只需添加新的处理器，不修改现有代码 |
| ✅ 可测试 | 每个处理器可独立测试，只需 mock EventBus |
| ✅ 可观测 | 所有事件流经总线，便于调试和监控 |
| ✅ 异步友好 | 天然支持异步处理，不阻塞主流程 |

### 3.2 挑战

| 挑战 | 解决方案 |
|------|----------|
| ⚠️ 事件顺序 | 使用中间件控制顺序，关键事件可同步等待 |
| ⚠️ 错误处理 | 每个处理器独立 try-catch，不影响其他处理器 |
| ⚠️ 性能开销 | 事件总线开销极小（~0.1ms），可忽略 |
| ⚠️ 调试复杂度 | 添加事件日志中间件，可视化事件流 |

### 3.3 迁移策略

**分阶段迁移（已全部完成）**：

```
Phase 1: 搭建基础 ✅ 已完成
├── 实现 EventBus
├── 定义事件类型
└── 添加事件中间件

Phase 2: 迁移审计系统 ✅ 已完成
├── 创建 audit-handler
├── tools/index.ts 改为发布事件
└── 验证功能

Phase 3: 迁移记忆系统 ✅ 已完成
├── 创建 memory-handler
├── repl.ts 中的记忆调用改为事件
└── 验证功能

Phase 4: 迁移确认系统 ✅ 已完成
├── 创建 confirmation-handler
├── repl.ts 确认后发布事件
└── 验证功能

Phase 5: 优化扩展 ✅ 已完成
├── 添加 performance-handler (性能监控)
├── 添加 error-handler (错误追踪)
├── 添加 persistence-handler (事件持久化)
└── 添加 /monitor 命令
```

---

## 四、代码质量优化 (已完成)

### 4.1 P0 优化 ✅

- 清理所有 lint 警告 (14 → 0)
- 移除未使用的 catch 参数
- 修复不必要的正则转义

### 4.2 P1 优化 ✅

- **repl.ts 拆分**: 提取 command-handlers.ts 和 repl-utils.ts
- **记忆系统缓存**: 添加 LRU 缓存和搜索缓存

### 4.3 P2 优化 ✅

- **子规划自动检测**: detectSubPlan 函数
- **输出美化**: boxen 和 ora 集成
- **文档完善**: 架构文档更新

---

## 四、工作量估算

| 模块 | 工作量 | 优先级 |
|------|--------|--------|
| EventBus 实现 | 2h | P0 |
| 事件类型定义 | 2h | P0 |
| audit-handler | 1h | P1 |
| memory-handler | 2h | P1 |
| confirmation-handler | 2h | P1 |
| repl.ts 重构 | 4h | P1 |
| 测试用例 | 3h | P2 |
| **总计** | **~16h** | |

---

## 五、推荐方案

**建议采用事件驱动架构**，理由：

1. **当前代码量适中**：~9000 行核心代码，重构成本可控
2. **扩展需求明确**：后续可能添加更多横切关注点
3. **测试友好**：事件驱动更容易做集成测试
4. **架构清晰**：职责分离，易于维护

**可以先在 v1.1.0 版本实施**：
- 保持 v1.0.0 当前功能不变
- v1.1.0 引入事件驱动架构
- 后续版本逐步迁移各模块