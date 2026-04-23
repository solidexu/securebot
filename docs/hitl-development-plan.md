# HITL 人在回路 - 详细开发计划

> **日期**: 2026-04-23 | **分支**: multi | **基于**: human-in-the-loop-design.md

---

## 当前代码现状梳理

### 已有但不可用的

| 文件 | 已有内容 | 问题 |
|------|---------|------|
| `types.ts` | `InterruptConfig` (before/after), `workflow_interrupt` 事件 | 只有声明，无运行时支持 |
| `orchestrator.ts` | `resume()`, `getState()`, `updateState()` | 依赖 LangGraphAdapter，但未真正暂停 |
| `langgraph-adapter.ts` | `compile()` 中传递 `interruptBefore/After` | 配置传了但执行时不生效 |
| `executor.ts` | 完整的轻量级执行引擎 | **零** 人机交互支持 |
| `streaming.ts` | `StreamingExecutor extends GraphExecutor` | 继承 executor，同样无 HITL |
| `loader.ts` | 可加载 `langgraph` 配置 | 不支持 `hitl` 配置 |

### 关键入口点

```
executor.ts::run()          ← 主循环: while(iterations < maxIterations)
  └─ executeNodeWithContext()  ← 每个节点的执行
       └─ executeNode()        ← LLM 调用 + 工具执行
```

**HITL 的切入位置就在 run() 主循环的每个节点前后。**

---

## Phase 1: 基础设施（2 天）

### 1.1 `hitl-types.ts` — 类型定义

**新建文件**，不修改任何现有文件。

```
src/core/collaboration/hitl-types.ts
```

**内容**：

| 类型 | 说明 |
|------|------|
| `HitlLevel` enum | 5 个干预级别 |
| `HumanDecision` | action + reason + modifiedContent + goto |
| `InterruptState` | threadId, nodeId, reason, currentState, pending |
| `InterruptType` | before_node / after_node / tool_call / manual |
| `HitlConfig` | level, interruptNodes, requireToolApproval, approvedTools, autoApproveTimeoutMs |
| `HitlEvent` | 4 种事件: hitl_interrupt, hitl_decision, hitl_tool_approval, hitl_state_updated |

**与 types.ts 的关系**：
- `AgentEvent` 联合类型**新增** 4 个 HITL 事件变体
- `WorkflowConfig` **新增** `hitl?: HitlConfig` 字段
- `AgentConfig` **新增** `hitl?: { interruptBefore?: boolean, interruptAfter?: boolean }`

**改动量**：~150 行，纯类型，无逻辑。

**依赖**：只依赖 `types.ts` 中的 `GraphState`。

---

### 1.2 `hitl-manager.ts` — 交互管理器

**新建文件**。

```
src/core/collaboration/hitl-manager.ts
```

**类**：`HumanInteractionManager`

**核心方法**：

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `createInterrupt()` | threadId, nodeId, reason, type, state | InterruptState | 创建中断，保存到 store |
| `submitDecision()` | threadId, decision | void | 提交人类决策 |
| `waitForDecision()` | threadId, timeoutMs? | Promise\<HumanDecision\> | **阻塞等待**（关键） |
| `editState()` | threadId, updates | GraphState | 暂停期间修改状态 |
| `getInterrupt()` | threadId | InterruptState? | 查询中断 |
| `listPending()` | - | InterruptState[] | 列出所有待处理 |
| `clearInterrupt()` | threadId | void | 清除已处理的中断 |

**核心机制 — waitForDecision**：

```typescript
async waitForDecision(threadId: string, timeoutMs?: number): Promise<HumanDecision> {
  return new Promise((resolve, reject) => {
    const timer = timeoutMs ? setTimeout(() => {
      resolve({ action: 'approve', reason: 'Auto-approved (timeout)' });
    }, timeoutMs) : null;

    const check = () => {
      const interrupt = this.activeInterrupts.get(threadId);
      if (interrupt?.decision) {
        if (timer) clearTimeout(timer);
        resolve(interrupt.decision);
      } else {
        setTimeout(check, 50); // 50ms 轮询
      }
    };
    check();
  });
}
```

**依赖**：
- `hitl-types.ts`（类型）
- `hitl-store.ts`（持久化）

**改动量**：~200 行。

---

### 1.3 `hitl-store.ts` — 存储层

**新建文件**。

```
src/core/collaboration/hitl-store.ts
```

**接口**：`InterruptStore`

**实现**：

| 实现类 | 后端 | 适用场景 |
|--------|------|---------|
| `MemoryInterruptStore` | Map | 测试、CLI 单次运行 |
| `FileInterruptStore` | JSON 文件 | 持久化、跨会话恢复 |

**MemoryInterruptStore**：
```typescript
class MemoryInterruptStore implements InterruptStore {
  private interrupts: Map<string, InterruptState> = new Map();
  private checkpoints: Map<string, GraphState> = new Map();
  // 实现接口方法...
}
```

**FileInterruptStore**：
```typescript
class FileInterruptStore implements InterruptStore {
  private basePath: string;  // 默认 .securebot/hitl/
  // 每个 threadId 一个 JSON 文件
  // 格式: { interrupt: InterruptState, checkpoint: GraphState }
}
```

**改动量**：~250 行。

---

### 1.4 类型集成

**修改 `types.ts`**：

```diff
// 在 AgentEvent 中新增:
+ | { type: 'hitl_interrupt'; graphId: string; threadId: string; 
+     nodeId: string; reason: string; interruptState: InterruptState; timestamp: number }
+ | { type: 'hitl_decision'; graphId: string; threadId: string; 
+     nodeId: string; decision: HumanDecision; timestamp: number }
+ | { type: 'hitl_tool_approval'; graphId: string; threadId: string;
+     nodeId: string; tool: string; args: Record<string, unknown>; timestamp: number }
+ | { type: 'hitl_state_updated'; graphId: string; threadId: string;
+     before: GraphState; after: GraphState; timestamp: number };

// 在 WorkflowConfig 中新增:
+ hitl?: HitlConfig;
```

**修改 `index.ts`**：

```diff
+ export { HumanInteractionManager } from './hitl-manager.js';
+ export type { InterruptState, HumanDecision, HitlConfig, HitlLevel, HitlEvent } from './hitl-types.js';
```

---

### 1.5 Phase 1 测试

**新建**：`src/core/collaboration/hitl-manager.test.ts`

**测试用例**：

| # | 测试 | 验证 |
|---|------|------|
| 1 | 创建中断 | 状态正确，pending=true |
| 2 | 提交决策 | decision 更新，pending=false |
| 3 | waitForDecision 阻塞到决策 | Promise 在决策后 resolve |
| 4 | waitForDecision 超时自动通过 | timeout 后返回 approve |
| 5 | editState 修改状态 | 状态更新，记录变更 |
| 6 | listPending 返回待处理列表 | 只返回 pending=true 的 |
| 7 | FileStore 持久化 | 重启后数据不丢失 |
| 8 | 多个线程独立 | threadId 隔离 |

---

### Phase 1 产出

```
新建:
  src/core/collaboration/hitl-types.ts          ~150 行
  src/core/collaboration/hitl-manager.ts        ~200 行
  src/core/collaboration/hitl-store.ts          ~250 行
  src/core/collaboration/hitl-manager.test.ts   ~200 行

修改:
  src/core/collaboration/types.ts               +20 行 (4 个事件类型)
  src/core/collaboration/index.ts               +3 行 (导出)

总计: ~820 行新增，20 行修改
```

---

## Phase 2: 轻量级模式集成（3 天）

### 2.1 GraphExecutor 改造

**修改 `executor.ts`**。

**改动点 1**：新增属性

```typescript
protected hitlManager?: HumanInteractionManager;
protected hitlConfig?: HitlConfig;

setHitl(manager: HumanInteractionManager, config: HitlConfig): this {
  this.hitlManager = manager;
  this.hitlConfig = config;
  return this;
}
```

**改动点 2**：改造 `run()` 方法的主循环

在现有循环中的**三个位置**插入检查：

```
while (iterations < maxIterations) {
  // ★★★ 插入点 A: 节点前中断 ★★★
  await this.checkBeforeNodeInterrupt(currentNodeId, runState, threadId);
  
  // 执行节点（现有代码）
  const response = await this.executeNodeWithContext(...);
  
  // ★★★ 插入点 B: 节点后中断 ★★★
  await this.checkAfterNodeInterrupt(currentNodeId, runState, threadId);
  
  // 处理响应/查找下一个节点（现有代码）
  const nextNodeId = this.findNextNodeWithContext(response, runState);
  
  // ★★★ 插入点 C: 处理决策对路由的影响 ★★★
  // (如果人类决策指定了 goto，覆盖 nextNodeId)
}
```

**改动点 3**：改造 `executeNodeWithContext()` — 工具调用审批

```typescript
// 在 LLM 返回 toolCall 后、执行工具前:
if (response.toolCall && this.needsToolApproval(response.toolCall.name)) {
  const approved = await this.handleToolApproval(node, response.toolCall, runState, threadId);
  if (!approved) {
    return { type: 'result', content: `Tool "${response.toolCall.name}" rejected by user` };
  }
}
```

**改动点 4**：新增辅助方法

| 方法 | 说明 |
|------|------|
| `checkBeforeNodeInterrupt()` | 判断是否需要中断，是则创建中断并等待决策 |
| `checkAfterNodeInterrupt()` | 同上，节点后 |
| `handleToolApproval()` | 工具调用审批流程 |
| `needsToolApproval()` | 根据配置判断工具是否需要审批 |
| `shouldInterruptBefore()` | 判断节点前是否需要中断 |
| `shouldInterruptAfter()` | 判断节点后是否需要中断 |
| `processDecision()` | 处理决策结果（approve/reject/skip/abort/modify） |

**关键：processDecision 的行为**

```
action=approve  → 继续执行
action=reject   → 如果有 goto，跳到 goto 节点；否则跳过当前节点
action=skip     → 跳过当前节点，找下一个
action=abort    → 终止执行，返回当前结果
action=modify   → 更新状态中的消息/上下文，然后继续
```

---

### 2.2 StreamingExecutor 适配

**修改 `streaming.ts`**。

`StreamingExecutor extends GraphExecutor`，自动继承 HITL 支持。

**额外改动**：在流式输出中注入 HITL 事件：

```typescript
// runStream() 中，在节点执行前后插入:
yield { type: 'hitl_interrupt', data: { ... } };
// 流式模式下 waitForDecision 仍然阻塞，但可以通过事件通知 UI
```

---

### 2.3 YAML Loader 支持 hitl 配置

**修改 `loader.ts`**。

```diff
+ import { HitlConfig, HitlLevel } from './hitl-types';

  function loadFromConfig(config: WorkflowConfig): Graph {
    // ... 现有代码 ...
    
+   // 加载 HITL 配置
+   if (config.hitl) {
+     builder.setHitlConfig(config.hitl);
+   }
  }
```

**修改 `builder.ts`**：

```diff
+ private hitlConfig?: HitlConfig;
+ 
+ setHitlConfig(config: HitlConfig): this {
+   this.hitlConfig = config;
+   return this;
+ }
+ 
  build(): AgentGraph {
    return {
      // ... 现有字段 ...
+     hitlConfig: this.hitlConfig,
    };
  }
```

**修改 `types.ts`**：

```diff
  export interface AgentGraph {
    // ... 现有字段 ...
+   hitlConfig?: HitlConfig;
  }
```

---

### 2.4 Orchestrator 集成

**修改 `orchestrator.ts`**。

```diff
+ import { HumanInteractionManager, HitlConfig } from './hitl-manager';
+ import { HumanDecision } from './hitl-types';

  export interface OrchestratorConfig {
    // ... 现有字段 ...
+   hitl?: {
+     manager: HumanInteractionManager;
+     config: HitlConfig;
+   };
  }

  class UnifiedOrchestrator {
+   async submitDecision(threadId: string, decision: HumanDecision): Promise<void> {
+     return this.hitlManager?.submitDecision(threadId, decision);
+   }
+   
+   getPendingInterrupts(): InterruptState[] {
+     return this.hitlManager?.listPending() ?? [];
+   }
+   
+   async editState(threadId: string, updates: any): Promise<GraphState> {
+     return this.hitlManager?.editState(threadId, updates);
+   }
  }
```

---

### 2.5 Phase 2 测试

**新建**：`src/core/collaboration/hitl-integration.test.ts`

**测试用例**：

| # | 测试 | 验证 |
|---|------|------|
| 1 | 全自动模式（默认） | 行为不变，无中断 |
| 2 | 节点前中断 → approve → 继续 | 正确恢复执行 |
| 3 | 节点前中断 → reject → 跳过 | 跳过当前节点 |
| 4 | 节点前中断 → abort → 终止 | 工作流终止 |
| 5 | 节点前中断 → modify → 继续 | 状态已更新 |
| 6 | 工具审批 → approve → 执行 | 工具正常执行 |
| 7 | 工具审批 → reject → 不执行 | 工具被跳过 |
| 8 | 超时自动通过 | 500ms 后自动 approve |
| 9 | 白名单工具免审批 | approvedTools 中的不触发审批 |
| 10 | step_through 模式每节点暂停 | 所有节点都中断 |
| 11 | 中断决策后 goto 路由 | 跳到指定节点 |
| 12 | StreamingExecutor 继承 HITL | 流式模式下也支持 |
| 13 | YAML 加载 hitl 配置 | 配置正确解析 |
| 14 | Orchestrator 代理 HITL 方法 | 统一接口可用 |

---

### Phase 2 产出

```
新建:
  src/core/collaboration/hitl-integration.test.ts  ~400 行

修改:
  src/core/collaboration/executor.ts     ~180 行 (新增方法和检查点)
  src/core/collaboration/streaming.ts    ~30 行  (HITL 事件)
  src/core/collaboration/loader.ts       ~15 行  (hitl 配置加载)
  src/core/collaboration/builder.ts      ~15 行  (setHitlConfig)
  src/core/collaboration/orchestrator.ts ~40 行  (HITL 代理方法)
  src/core/collaboration/types.ts        ~5 行   (AgentGraph 新增字段)

总计: ~400 行新增，~285 行修改
```

---

## Phase 3: LangGraph 模式集成（2 天）

### 3.1 LangGraphAdapter 改造

**修改 `langgraph-adapter.ts`**。

**改动点 1**：新增 hitlManager 引用

```typescript
private hitlManager?: HumanInteractionManager;

setHitl(manager: HumanInteractionManager): this {
  this.hitlManager = manager;
  return this;
}
```

**改动点 2**：wrapNodesWithInterrupt — 节点包装

```typescript
private wrapNodesWithInterrupt(stateGraph: any): void {
  const nodesToWrap = this.getNodesToInterrupt();
  
  for (const nodeId of nodesToWrap) {
    const originalFn = this.nodeFunctions.get(nodeId)!;
    const wrappedFn = async (state: any) => {
      // 调用 LangGraph 的 interrupt()
      const decision = interrupt(`Review node: ${nodeId}`);
      
      // 处理决策
      this.hitlManager?.submitDecision(
        state._threadId,
        this.parseDecision(decision)
      );
      
      return originalFn(state);
    };
    stateGraph.addNode(nodeId, wrappedFn);
  }
}
```

**改动点 3**：resume 方法增强

```typescript
async resume(threadId: string, input?: any): Promise<ExecutionResult> {
  const app = await this.compile();
  const config = { configurable: { thread_id: threadId } };
  
  // 如果有 HITL 决策，更新状态
  if (input) {
    await app.updateState(config, input);
  }
  
  // 继续执行
  const result = await app.invoke(null, config);
  // ... 返回结果
}
```

---

### 3.2 状态编辑支持

在 LangGraph 模式下，利用 LangGraph 原生的 `update_state()`:

```typescript
async editState(threadId: string, values: any): Promise<GraphState> {
  const app = await this.compile();
  await app.updateState(
    { configurable: { thread_id: threadId } },
    values
  );
  const state = await app.getState({ configurable: { thread_id: threadId } });
  return state.values;
}
```

---

### 3.3 Phase 3 测试

**在 `langgraph-adapter.test.ts` 中新增**：

| # | 测试 | 验证 |
|---|------|------|
| 1 | interruptBefore 编译配置 | 编译后配置正确 |
| 2 | interruptAfter 编译配置 | 编译后配置正确 |
| 3 | wrapNodesWithInterrupt | 节点被正确包装 |
| 4 | resume 恢复执行 | 从中断点继续 |
| 5 | editState 编辑状态 | 状态更新后继续 |
| 6 | HITL + LangGraph 端到端 | 完整流程 |

---

### Phase 3 产出

```
修改:
  src/core/collaboration/langgraph-adapter.ts  ~120 行

新增测试:
  langgraph-adapter.test.ts  ~150 行

总计: ~120 行修改，~150 行测试
```

---

## Phase 4: 交互层（2 天）

### 4.1 CLI 交互

**修改 `src/cli/repl-commands.ts`**，新增命令：

| 命令 | 说明 |
|------|------|
| `graph hitl approve <thread>` | 批准并继续 |
| `graph hitl reject <thread>` | 拒绝并跳过 |
| `graph hitl skip <thread>` | 跳过当前节点 |
| `graph hitl abort <thread>` | 终止工作流 |
| `graph hitl status` | 查看待处理中断 |
| `graph hitl edit <thread>` | 编辑状态 |

**新增文件**：`src/cli/hitl-interaction.ts`

```typescript
/**
 * CLI 人在回路交互
 */
import { select, input, confirm } from '@clack/prompts';
import { HumanInteractionManager, HumanDecision } from '../core/collaboration';

export async function presentDecision(interrupt: InterruptState): Promise<HumanDecision> {
  // 显示中断信息
  console.log(`\n⏸️  等待人类决策`);
  console.log(`  节点: ${interrupt.nodeId}`);
  console.log(`  原因: ${interrupt.reason}`);
  
  const action = await select({
    message: '请选择操作:',
    options: [
      { value: 'approve', label: '✅ 通过' },
      { value: 'reject', label: '❌ 拒绝' },
      { value: 'skip', label: '⏭️ 跳过' },
      { value: 'modify', label: '✏️ 修改后继续' },
      { value: 'abort', label: '⛔ 终止' },
    ],
  });
  
  let reason: string | undefined;
  let modifiedContent: string | undefined;
  
  if (action === 'modify') {
    modifiedContent = await input({ message: '输入修改内容:' });
  }
  
  reason = await input({ message: '备注 (可选):' }) || undefined;
  
  return { action, reason, modifiedContent };
}
```

---

### 4.2 TUI 集成

**新建**：`src/cli/tui/components/hitl/HumanInteractionPanel.tsx`

```tsx
/**
 * 人在回路面板
 */
interface HumanInteractionPanelProps {
  interrupt: InterruptState | null;
  onDecision: (decision: HumanDecision) => void;
  onEditState: (updates: Record<string, unknown>) => void;
}

export const HumanInteractionPanel: React.FC<HumanInteractionPanelProps> = ({
  interrupt,
  onDecision,
  onEditState,
}) => {
  if (!interrupt) return null;
  
  return (
    <Box flexDirection="column">
      <Text color="yellow">⏸️ 等待审批</Text>
      <Text>节点: {interrupt.nodeId}</Text>
      <Text>原因: {interrupt.reason}</Text>
      <Box>
        <Button onPress={() => onDecision({ action: 'approve' })}>✅ 通过</Button>
        <Button onPress={() => onDecision({ action: 'reject' })}>❌ 拒绝</Button>
        <Button onPress={() => onDecision({ action: 'skip' })}>⏭️ 跳过</Button>
        <Button onPress={() => onDecision({ action: 'abort' })}>⛔ 终止</Button>
      </Box>
    </Box>
  );
};
```

**集成到 TUI App**：

在 `src/cli/tui/App.tsx` 中：
- 监听 `hitl_interrupt` 事件
- 显示 HumanInteractionPanel 覆盖层
- 用户决策后调用 `hitlManager.submitDecision()`

---

### 4.3 事件流推送

**修改 `streaming.ts`**，在流式事件中加入 HITL 事件类型：

```typescript
// StreamEventType 新增:
+ 'hitl_interrupt'
+ 'hitl_decision'
+ 'hitl_tool_approval'
```

---

### Phase 4 产出

```
新建:
  src/cli/hitl-interaction.ts                 ~100 行
  src/cli/tui/components/hitl/HumanInteractionPanel.tsx  ~80 行

修改:
  src/cli/repl-commands.ts     ~100 行 (新增 hitl 子命令)
  src/cli/tui/App.tsx          ~50 行  (集成 HITL 面板)
  src/core/collaboration/streaming.ts  ~20 行 (事件类型)

总计: ~180 行新增，~170 行修改
```

---

## Phase 5: 文档与示例（1 天）

### 5.1 使用文档

**新建**：`docs/hitl-usage.md`

内容：
- 快速开始
- 五种干预级别说明
- YAML 配置示例
- CLI 命令参考
- TUI 使用说明
- API 参考

### 5.2 示例工作流

**新建**：`workflows/examples/code-review-with-approval.yaml`

```yaml
id: code-review-approval
name: 代码审查（含审批）
mode: lightweight

hitl:
  level: node_interrupt
  interruptNodes:
    - security-scanner
  requireToolApproval: true
  approvedTools: [read_file, grep, list_files]

entry: style-checker

agents:
  - id: style-checker
    name: 风格检查员
    role: 代码风格检查
    systemPrompt: |
      你是代码风格检查员。

  - id: bug-finder
    name: Bug 检查员
    role: 潜在 Bug 检查
    systemPrompt: |
      你是 Bug 检查员。

  - id: security-scanner
    name: 安全扫描员
    role: 安全问题检查
    systemPrompt: |
      你是安全扫描员。扫描前需用户确认。

edges:
  - source: style-checker
    target: bug-finder
    type: direct
  - source: bug-finder
    target: security-scanner
    type: direct
```

**新建**：`workflows/examples/step-debug.yaml`

```yaml
# 逐步调试模式
id: step-debug
name: 逐步调试
mode: lightweight

hitl:
  level: step_through

entry: analyzer
# ...
```

### 5.3 测试

- [ ] 示例工作流可正确加载
- [ ] CLI 交互端到端测试

---

### Phase 5 产出

```
新建:
  docs/hitl-usage.md                           ~300 行
  workflows/examples/code-review-with-approval.yaml  ~50 行
  workflows/examples/step-debug.yaml           ~30 行

总计: ~380 行
```

---

## 总览

### 时间线

| Phase | 内容 | 时间 | 代码量 |
|-------|------|------|--------|
| Phase 1 | 类型 + Manager + Store | 2 天 | ~820 行 |
| Phase 2 | 轻量级模式集成 | 3 天 | ~685 行 |
| Phase 3 | LangGraph 模式集成 | 2 天 | ~270 行 |
| Phase 4 | CLI + TUI 交互 | 2 天 | ~350 行 |
| Phase 5 | 文档 + 示例 | 1 天 | ~380 行 |
| **合计** | | **10 天** | **~2505 行** |

### 文件改动矩阵

| 文件 | Phase | 操作 | 改动量 |
|------|-------|------|--------|
| `hitl-types.ts` | P1 | 新建 | ~150 |
| `hitl-manager.ts` | P1 | 新建 | ~200 |
| `hitl-store.ts` | P1 | 新建 | ~250 |
| `hitl-manager.test.ts` | P1 | 新建 | ~200 |
| `types.ts` | P1/P2 | 修改 | ~25 |
| `index.ts` | P1 | 修改 | ~3 |
| `hitl-integration.test.ts` | P2 | 新建 | ~400 |
| `executor.ts` | P2 | 修改 | ~180 |
| `streaming.ts` | P2/P4 | 修改 | ~50 |
| `loader.ts` | P2 | 修改 | ~15 |
| `builder.ts` | P2 | 修改 | ~15 |
| `orchestrator.ts` | P2 | 修改 | ~40 |
| `langgraph-adapter.ts` | P3 | 修改 | ~120 |
| `langgraph-adapter.test.ts` | P3 | 修改 | ~150 |
| `hitl-interaction.ts` | P4 | 新建 | ~100 |
| `HumanInteractionPanel.tsx` | P4 | 新建 | ~80 |
| `repl-commands.ts` | P4 | 修改 | ~100 |
| `tui/App.tsx` | P4 | 修改 | ~50 |
| `hitl-usage.md` | P5 | 新建 | ~300 |
| `code-review-with-approval.yaml` | P5 | 新建 | ~50 |
| `step-debug.yaml` | P5 | 新建 | ~30 |

### 风险清单

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| waitForDecision 阻塞导致 CLI 卡死 | 中 | 高 | 必须用事件循环 + 超时 |
| executor.ts 改动引入回归 | 中 | 高 | HITL 默认关闭，充分测试 |
| LangGraph interrupt API 变更 | 低 | 中 | 抽象层隔离，动态加载 |
| TUI 状态管理复杂度 | 中 | 中 | 复用 zustand 状态管理 |
| FileStore 并发写入冲突 | 低 | 中 | 文件锁或 SQLite 替代 |

### 关键依赖顺序

```
Phase 1 (types → store → manager)
    ↓
Phase 2 (executor → streaming → loader → orchestrator)
    ↓
Phase 3 (langgraph-adapter)
    ↓
Phase 4 (CLI → TUI)
    ↓
Phase 5 (docs → examples)
```

Phase 1 → 2 有强依赖，必须先完成。
Phase 3 可与 Phase 2 并行（独立文件）。
Phase 4 依赖 Phase 2 的 manager 接口。
Phase 5 依赖所有代码完成。
