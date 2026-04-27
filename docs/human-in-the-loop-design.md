# Human-in-the-Loop 人在回路设计方案

> **日期**: 2026-04-23  
> **分支**: multi  
> **状态**: 设计草案  
> **参考**: LangGraph interrupt / Command 模式

---

## 1. 现状分析

### 1.1 已有基础设施

| 组件 | 已有能力 | 缺失 |
|------|---------|------|
| `types.ts` | `InterruptConfig`(before/after), `workflow_interrupt` 事件 | 缺少 HumanDecision 类型 |
| `orchestrator.ts` | `resume()`, `getState()`, `updateState()` | 无主动暂停等待机制 |
| `langgraph-adapter.ts` | `interruptBefore/After` 编译配置 | 只传递配置，不实际中断 |
| `executor.ts` | 轻量级执行引擎 | **完全无** 人机交互支持 |
| YAML 工作流 | 可声明 `interrupts.before` | 声明了但不生效 |

### 1.2 核心问题

**当前 multi 分支的 Agent 协作图一旦启动就全速运行到结束，没有任何机制让人类介入。**

具体问题：
1. Agent 自主决策执行，用户无法审核或否决
2. 工具调用（文件读写、Shell 命令）无审批流程
3. 错误决策无法中途纠正，只能等全部跑完
4. 用户无法查看/编辑中间状态再继续

---

## 2. LangGraph 人机交互设计参考

LangGraph 提供了三类人在回路模式：

### 2.1 interrupt() — 运行时中断

```python
def get_approval(state):
    # 暂停执行，等待人类输入
    decision = interrupt("请审批: approve 或 reject")
    # 恢复后拿到决策值
    return {'user_decision': decision}
```

- **调用 `interrupt()` 后图执行立即暂停**
- **状态通过 Checkpointer 持久化**
- **恢复时通过 `Command(resume=value)` 传入决策**
- **可在任何节点内动态触发，无需预先声明**

### 2.2 interruptBefore / interruptAfter — 声明式断点

```python
app = graph.compile(
    checkpointer=MemorySaver(),
    interrupt_before=["deploy_node"],   # 在这些节点前暂停
    interrupt_after=["review_node"],    # 在这些节点后暂停
)
```

- **编译时声明，到达断点自动暂停**
- **适合固定流程中的审批节点**

### 2.3 Command(goto=...) — 人类驱动的动态路由

```python
def router(state):
    if state['user_decision'] == 'approve':
        return Command(goto='deploy')
    else:
        return Command(goto='rollback')
```

- **人类决策直接控制图的走向**
- **不需要预定义所有边，运行时动态决定**

### 2.4 状态编辑（Time Travel）

```python
# 查看当前状态
state = app.get_state(config)
# 编辑状态
app.update_state(config, {'plan': revised_plan})
# 继续执行
app.invoke(None, config)
```

- **暂停期间可以查看和修改图状态**
- **修改后从编辑后的状态继续执行**

---

## 3. SecureBot 人在回路设计方案

### 3.1 设计目标

1. **双模式覆盖**: 轻量级模式和 LangGraph 模式都支持人机交互
2. **多层干预**: 从全自动到全人工审批，可配置干预级别
3. **类型安全**: TypeScript 严格类型定义
4. **可插拔**: 不影响现有代码，渐进式接入
5. **统一接口**: 两种模式使用相同的人机交互 API

### 3.2 架构总览

```
┌─────────────────────────────────────────────────────┐
│                    用户界面层                        │
│  CLI / TUI / API → HumanInteractionManager          │
├─────────────────────────────────────────────────────┤
│               人在回路管理层                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │InterruptMgr │  │ApprovalMgr   │  │StateEditor │ │
│  │(中断/恢复)   │  │(审批工具调用) │  │(状态编辑)   │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
├─────────────────────────────────────────────────────┤
│                执行引擎层                            │
│  ┌────────────────────┐  ┌───────────────────────┐ │
│  │  GraphExecutor     │  │  LangGraphAdapter     │ │
│  │  + HITL 支持       │  │  + interrupt 适配     │ │
│  └────────────────────┘  └───────────────────────┘ │
├─────────────────────────────────────────────────────┤
│                持久化层                              │
│  ┌─────────────────────────────────────────────┐   │
│  │  CheckpointStore (Memory / SQLite / File)   │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 3.3 干预级别

```typescript
/**
 * 人在回路干预级别
 */
export enum HitlLevel {
  /** 全自动执行，无中断 */
  FULL_AUTO = 'full_auto',

  /** 工具调用前需要审批 */
  TOOL_APPROVAL = 'tool_approval',

  /** 特定节点前暂停等待审批 */
  NODE_INTERRUPT = 'node_interrupt',

  /** 每个节点后暂停（调试/审核模式） */
  STEP_THROUGH = 'step_through',

  /** 完全手动，每个决策都需要人类确认 */
  FULL_MANUAL = 'full_manual',
}
```

### 3.4 核心类型定义

#### 3.4.1 HumanDecision

```typescript
/**
 * 人类决策
 */
export interface HumanDecision {
  /** 动作 */
  action: 'approve' | 'reject' | 'modify' | 'skip' | 'abort';
  /** 决策理由 */
  reason?: string;
  /** 修改后的内容（action=modify 时） */
  modifiedContent?: string;
  /** 修改后的状态（action=modify 时） */
  modifiedState?: Record<string, unknown>;
  /** 替代路由目标（拒绝时指定跳往哪个节点） */
  goto?: string;
}
```

#### 3.4.2 InterruptState

```typescript
/**
 * 中断状态
 */
export interface InterruptState {
  /** 线程 ID */
  threadId: string;
  /** 当前节点 ID */
  nodeId: string;
  /** 中断原因 */
  reason: string;
  /** 中断类型 */
  interruptType: 'before_node' | 'after_node' | 'tool_call' | 'manual';
  /** 当前图状态（供人类查看） */
  currentState: GraphState;
  /** 等待决策中 */
  pending: boolean;
  /** 决策（已回复时） */
  decision?: HumanDecision;
  /** 超时时间（可选） */
  timeoutMs?: number;
  /** 创建时间 */
  createdAt: number;
}
```

#### 3.4.3 HitlConfig

```typescript
/**
 * 人在回路配置
 */
export interface HitlConfig {
  /** 干预级别 */
  level: HitlLevel;
  /** 需要中断的节点列表 */
  interruptNodes?: string[];
  /** 工具调用是否需要审批 */
  requireToolApproval?: boolean;
  /** 白名单工具（无需审批） */
  approvedTools?: string[];
  /** 超时自动通过（毫秒，0=不超时） */
  autoApproveTimeoutMs?: number;
  /** 决策回调（编程式决策） */
  onDecisionRequired?: (interrupt: InterruptState) => Promise<HumanDecision>;
}
```

#### 3.4.4 新增事件类型

```typescript
// 在 AgentEvent 中新增
export type AgentEvent =
  // ... 已有类型 ...
  | { type: 'hitl_interrupt'; graphId: string; threadId: string; 
      nodeId: string; reason: string; interruptState: InterruptState; 
      timestamp: number }
  | { type: 'hitl_decision'; graphId: string; threadId: string; 
      nodeId: string; decision: HumanDecision; timestamp: number }
  | { type: 'hitl_tool_approval'; graphId: string; threadId: string;
      nodeId: string; tool: string; args: Record<string, unknown>;
      timestamp: number }
  | { type: 'hitl_state_updated'; graphId: string; threadId: string;
      before: GraphState; after: GraphState; timestamp: number };
```

### 3.5 核心模块设计

#### 3.5.1 HumanInteractionManager

```typescript
/**
 * 人在回路交互管理器
 * 
 * 统一管理中断、审批、状态编辑、恢复等操作
 */
export class HumanInteractionManager {
  // 活跃的中断（threadId -> InterruptState）
  private activeInterrupts: Map<string, InterruptState>;
  // 持久化存储
  private store: InterruptStore;
  // 事件发射
  private emit: (event: AgentEvent) => void;

  /**
   * 创建中断
   * 由执行器在需要人类决策时调用
   */
  async createInterrupt(
    threadId: string,
    nodeId: string,
    reason: string,
    interruptType: InterruptState['interruptType'],
    state: GraphState
  ): Promise<InterruptState>;

  /**
   * 提交人类决策
   * 由 CLI/TUI/API 在用户做出决策后调用
   */
  async submitDecision(
    threadId: string,
    decision: HumanDecision
  ): Promise<void>;

  /**
   * 编辑状态
   * 在暂停期间修改图状态
   */
  async editState(
    threadId: string,
    updates: Record<string, unknown>
  ): Promise<GraphState>;

  /**
   * 获取中断状态
   */
  getInterrupt(threadId: string): InterruptState | undefined;

  /**
   * 列出所有待处理的中断
   */
  listPendingInterrupts(): InterruptState[];

  /**
   * 等待中断解决（可带超时）
   * 执行器调用此方法阻塞等待
   */
  waitForDecision(threadId: string, timeoutMs?: number): Promise<HumanDecision>;
}
```

#### 3.5.2 InterruptStore

```typescript
/**
 * 中断持久化存储
 */
interface InterruptStore {
  save(interrupt: InterruptState): Promise<void>;
  load(threadId: string): Promise<InterruptState | undefined>;
  delete(threadId: string): Promise<void>;
  listPending(): Promise<InterruptState[]>;
  saveCheckpoint(threadId: string, state: GraphState): Promise<void>;
  loadCheckpoint(threadId: string): Promise<GraphState | undefined>;
}

// 实现: MemoryStore, FileStore, SqliteStore
```

### 3.6 执行器改造

#### 3.6.1 GraphExecutor 改造（轻量级模式）

```typescript
class GraphExecutor {
  protected hitlManager?: HumanInteractionManager;
  protected hitlConfig?: HitlConfig;

  /**
   * 设置人在回路管理
   */
  setHitl(manager: HumanInteractionManager, config: HitlConfig): this {
    this.hitlManager = manager;
    this.hitlConfig = config;
    return this;
  }

  /**
   * 执行单个节点（改造后）
   */
  private async executeNode(
    node: AgentNode,
    llmClient: LLMClient
  ): Promise<NodeResponse> {
    // === 节点前中断 ===
    if (this.shouldInterruptBefore(node.id)) {
      await this.handleInterrupt('before_node', node.id);
    }

    // === 执行节点 ===
    const response = await this.callLLM(node, llmClient);

    // === 工具调用审批 ===
    if (response.toolCall && this.needsToolApproval(response.toolCall.name)) {
      const approved = await this.handleToolApproval(node.id, response.toolCall);
      if (!approved) {
        return { type: 'result', content: 'Tool call rejected by user' };
      }
    }

    // === 执行工具调用 ===
    if (response.toolCall) {
      await this.executeTool(response.toolCall);
    }

    // === 节点后中断 ===
    if (this.shouldInterruptAfter(node.id)) {
      await this.handleInterrupt('after_node', node.id);
    }

    return response;
  }

  /**
   * 处理中断
   */
  private async handleInterrupt(
    type: InterruptState['interruptType'],
    nodeId: string
  ): Promise<void> {
    if (!this.hitlManager || !this.hitlConfig) return;

    const interrupt = await this.hitlManager.createInterrupt(
      this.threadId,
      nodeId,
      `Node "${nodeId}" execution ${type === 'before_node' ? 'paused before' : 'paused after'}`,
      type,
      this.state
    );

    this.emitEvent({
      type: 'hitl_interrupt',
      graphId: this.graphId,
      threadId: this.threadId,
      nodeId,
      reason: interrupt.reason,
      interruptState: interrupt,
      timestamp: Date.now(),
    });

    // 阻塞等待决策
    const decision = await this.hitlManager.waitForDecision(
      this.threadId,
      this.hitlConfig.autoApproveTimeoutMs
    );

    this.processDecision(decision, nodeId);

    this.emitEvent({
      type: 'hitl_decision',
      graphId: this.graphId,
      threadId: this.threadId,
      nodeId,
      decision,
      timestamp: Date.now(),
    });
  }

  /**
   * 处理工具调用审批
   */
  private async handleToolApproval(
    nodeId: string,
    toolCall: LLMResponse['toolCall']
  ): Promise<boolean> {
    if (!this.hitlManager) return true;

    this.emitEvent({
      type: 'hitl_tool_approval',
      graphId: this.graphId,
      threadId: this.threadId,
      nodeId,
      tool: toolCall.name,
      args: toolCall.args,
      timestamp: Date.now(),
    });

    const decision = await this.hitlManager.waitForDecision(this.threadId);
    return decision.action === 'approve';
  }

  /**
   * 判断是否应该在节点前中断
   */
  private shouldInterruptBefore(nodeId: string): boolean {
    if (!this.hitlConfig) return false;
    const { level, interruptNodes } = this.hitlConfig;

    switch (level) {
      case HitlLevel.FULL_AUTO:
        return false;
      case HitlLevel.STEP_THROUGH:
        return true;
      case HitlLevel.NODE_INTERRUPT:
        return interruptNodes?.includes(nodeId) ?? false;
      case HitlLevel.FULL_MANUAL:
        return true;
      default:
        return false;
    }
  }

  /**
   * 判断是否需要工具审批
   */
  private needsToolApproval(toolName: string): boolean {
    if (!this.hitlConfig) return false;
    const { level, requireToolApproval, approvedTools } = this.hitlConfig;

    if (level === HitlLevel.FULL_AUTO) return false;
    if (!requireToolApproval) return false;
    if (approvedTools?.includes(toolName)) return false;

    return true;
  }
}
```

#### 3.6.2 LangGraphAdapter 改造

```typescript
class LangGraphAdapter {
  private hitlManager?: HumanInteractionManager;

  setHitl(manager: HumanInteractionManager): this {
    this.hitlManager = manager;
    return this;
  }

  /**
   * 编译时注入中断配置
   */
  async compile(): Promise<CompiledLangGraphApp> {
    const stateGraph = await this.buildStateGraph();
    const checkpointer = await this.createCheckpointer();

    const compileConfig: any = {
      checkpointer,
    };

    // 声明式中断
    const interrupts = this.graph.config?.interrupts;
    if (interrupts?.before) {
      compileConfig.interruptBefore = interrupts.before;
    }
    if (interrupts?.after) {
      compileConfig.interruptAfter = interrupts.after;
    }

    // 注入 Human-in-the-Loop 节点包装器
    if (this.hitlManager) {
      this.wrapNodesWithInterrupt(stateGraph);
    }

    this.compiledApp = stateGraph.compile(compileConfig);
    return this.compiledApp;
  }

  /**
   * 包装节点，注入 interrupt() 调用
   */
  private wrapNodesWithInterrupt(stateGraph: any): void {
    const nodesToWrap = this.getNodesToInterrupt();
    
    for (const nodeId of nodesToWrap) {
      const originalNodeFn = this.getNodeFunction(nodeId);
      const wrappedFn = async (state: any) => {
        // 节点前调用 interrupt
        const result = interrupt(`Pausing at node "${nodeId}" for review`);
        // 处理人类决策
        this.hitlManager?.submitDecision(
          state._threadId,
          this.parseHumanDecision(result)
        );
        // 执行原始节点
        return originalNodeFn(state);
      };
      stateGraph.addNode(nodeId, wrappedFn);
    }
  }
}
```

### 3.7 YAML 工作流配置扩展

```yaml
# 示例: 代码审查工作流加入人在回路
id: code-review
name: 代码审查
mode: lightweight

# 人在回路配置
hitl:
  level: tool_approval              # 工具调用需要审批
  approvedTools: [read_file, grep]  # 这些工具免审批
  autoApproveTimeoutMs: 300000      # 5分钟不操作自动通过

# 或直接声明断点
  # level: node_interrupt
  # interruptNodes:
  #   - security-scanner            # 安全扫描前暂停
  # requireToolApproval: true

entry: style-checker

agents:
  - id: style-checker
    name: 风格检查员
    role: 代码风格检查
    systemPrompt: |
      你是代码风格检查员。
      发现严重问题时，通过 handoff 通知用户确认后再继续。

  - id: bug-finder
    name: Bug 检查员
    role: 潜在 Bug 检查
    systemPrompt: |
      你是 Bug 检查员。

  - id: security-scanner
    name: 安全扫描员
    role: 安全问题检查
    systemPrompt: |
      你是安全扫描员。检查完毕后暂停等待用户确认。

edges:
  - source: style-checker
    target: bug-finder
    type: direct

  - source: bug-finder
    target: security-scanner
    type: direct
```

### 3.8 CLI 交互设计

```bash
# 运行工作流（带人在回路）
$ openclaw graph run code-review "review src/"
📊 Agent: 风格检查员 - 检查中...
✅ 风格检查完成

📊 Agent: Bug检查员 - 检查中...
⚠️ 发现 2 个潜在问题

⏸️ --- 等待人类决策 ---
  节点: security-scanner
  原因: 安全扫描前需要确认
  发现 2 个潜在问题:
    1. 未处理的 Promise rejection
    2. SQL 注入风险
  
  [approve] 继续执行安全扫描
  [reject]  跳过安全扫描
  [skip]    跳过此节点
  [modify]  修改输入后继续
  [abort]   终止整个工作流
  
  请输入决策 > 
```

### 3.9 TUI 集成设计

在 TUI 中新增 `HumanInteractionPanel`：

```
┌─ 人在回路 ───────────────────────────────┐
│ ⏸️ 等待审批                               │
│                                           │
│ 节点: security-scanner                    │
│ 原因: 安全扫描前暂停                       │
│                                           │
│ 当前发现:                                 │
│  ⚠️ SQL 注入风险 (src/db.ts:42)          │
│  ⚠️ 未处理的异常 (src/api.ts:15)          │
│                                           │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │
│ │✅ 通过│ │❌ 拒绝│ │✏️ 修改│ │⛔ 终止│      │
│ └──────┘ └──────┘ └──────┘ └──────┘      │
│                                           │
│ 备注: [_____________________________]     │
│                                           │
│ 待处理中断: 1   已处理: 3                 │
└───────────────────────────────────────────┘
```

---

## 4. 实施计划

### Phase 1: 基础设施（~2天）

- [ ] `src/core/collaboration/hitl-types.ts` - 类型定义
- [ ] `src/core/collaboration/hitl-manager.ts` - HumanInteractionManager
- [ ] `src/core/collaboration/hitl-store.ts` - 存储层（Memory + File）
- [ ] 单元测试

### Phase 2: 轻量级模式集成（~2天）

- [ ] `GraphExecutor` 改造，加入中断检查点
- [ ] 工具调用审批机制
- [ ] 决策处理逻辑（approve/reject/skip/abort/modify）
- [ ] YAML loader 支持 `hitl` 配置
- [ ] 集成测试

### Phase 3: LangGraph 模式集成（~2天）

- [ ] `LangGraphAdapter` 节点包装器
- [ ] `interrupt()` 调用注入
- [ ] `Command` 路由适配
- [ ] 状态编辑支持
- [ ] 集成测试

### Phase 4: 交互层（~2天）

- [ ] CLI 交互（repl-commands.ts 新增 `hitl` 命令）
- [ ] TUI HumanInteractionPanel
- [ ] 事件流推送
- [ ] 端到端测试

### Phase 5: 文档与示例（~1天）

- [ ] 使用文档
- [ ] 示例工作流（含人在回路）
- [ ] API 文档

---

## 5. 关键设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 中断实现方式 | 执行器内阻塞 + 事件通知 | 双模式统一，不依赖特定库 |
| 持久化 | 先 Memory + File，后续 SQLite | 渐进式，避免过重依赖 |
| 超时策略 | 可配置自动通过 | 避免阻塞卡死 |
| 决策方式 | 枚举动作 + 可选修改 | 覆盖常见场景 |
| 工具审批 | 白名单机制 | 读操作免审批，写操作需审批 |
| 状态编辑 | 暂停期间只读，modify 时写入 | 安全可控 |

---

## 6. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 执行器改造可能影响现有逻辑 | 回归风险 | 人在回路默认关闭，现有行为不变 |
| 阻塞等待可能导致连接超时 | 超时断开 | 心跳机制 + 超时自动通过 |
| LangGraph interrupt 版本依赖 | API 变更 | 抽象层隔离，动态加载 |
| 状态编辑导致不一致 | 数据错误 | 编辑前快照，支持回滚 |

---

## 7. 与 LangGraph 的映射关系

| LangGraph 概念 | SecureBot 对应 | 说明 |
|---------------|---------------|------|
| `interrupt()` | `hitlManager.createInterrupt()` + `waitForDecision()` | 运行时中断 |
| `interruptBefore` | `HitlConfig.interruptNodes` + `shouldInterruptBefore()` | 声明式断点 |
| `Command(resume=)` | `HumanDecision` + `processDecision()` | 恢复执行 |
| `Command(goto=)` | `HumanDecision.goto` | 动态路由 |
| `update_state()` | `hitlManager.editState()` | 状态编辑 |
| `checkpointer` | `InterruptStore` + `CheckpointStore` | 状态持久化 |
| `get_state()` | `InterruptState.currentState` | 查看状态 |
