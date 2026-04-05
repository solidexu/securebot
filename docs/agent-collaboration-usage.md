# Agent 协作系统使用指南

## 快速开始

### 1. 加载工作流

```bash
# 加载 YAML 工作流
openclaw graph load workflows/examples/model-training.yaml

# 输出
✅ Graph loaded successfully
   ID: model-training-loop
   Name: 模型闭环训练
   Mode: langgraph
   Agents: 4
```

### 2. 运行工作流

```bash
# 运行图
openclaw graph run model-training-loop "开始新一轮训练"

# 指定线程 ID（LangGraph 模式）
openclaw graph run model-training-loop "开始训练" --thread training-001
```

### 3. 查看状态

```bash
# 列出已加载的图
openclaw graph list

# 查看图状态
openclaw graph status model-training-loop

# 查看线程状态（LangGraph 模式）
openclaw graph status model-training-loop --thread training-001
```

### 4. 恢复执行

```bash
# 恢复中断的工作流
openclaw graph resume model-training-loop --thread training-001

# 带输入恢复
openclaw graph resume model-training-loop --thread training-001 --input '{"approved": true}'
```

### 5. 查看图结构

```bash
# 显示图结构
openclaw graph show model-training-loop

# 输出 DOT 格式（可视化）
openclaw graph show model-training-loop --dot > graph.dot
```

---

## YAML 配置格式

### 基本结构

```yaml
id: my-workflow
name: 我的工作流
mode: lightweight  # 或 langgraph
entry: agent-a

agents:
  - id: agent-a
    name: Agent A
    role: 处理器
    systemPrompt: |
      你是一个处理器...

edges:
  - source: agent-a
    target: agent-b
    type: direct
```

### 完整配置（LangGraph 模式）

```yaml
id: advanced-workflow
name: 高级工作流
mode: langgraph
entry: coordinator

langgraph:
  checkpointer:
    type: sqlite
    path: ./checkpoints/workflow.db
  interrupts:
    before:
      - trainer
  stateSchema:
    fields:
      messages:
        type: array
        reducer: append
      trainingParams:
        type: object
        reducer: merge

agents:
  - id: coordinator
    name: 协调器
    role: 项目经理
    systemPrompt: |
      你是协调器...
    tools:
      - tool-a
      - tool-b
    model:
      provider: openai
      name: gpt-4

  - id: worker
    name: 工作节点
    role: 执行者
    systemPrompt: |
      你是执行者...
    behavior:
      isAsync: true
      timeout: 60000

edges:
  - source: coordinator
    target: worker
    type: conditional
    condition:
      keywords: [处理, 执行]
    metadata:
      label: 分配任务
      priority: 1
```

---

## 编程接口

### 加载和运行

```typescript
import { loadFromFile, createOrchestrator } from '@securebot/core/collaboration';

// 加载图
const graph = await loadFromFile('./workflow.yaml');

// 创建协调器
const orchestrator = createOrchestrator(graph, llmClient);

// 运行
const result = await orchestrator.run('开始任务', {
  threadId: 'session-001',
  onEvent: (event) => {
    console.log(`Event: ${event.type}`);
  },
});

console.log(result.result);
```

### 构建 API

```typescript
import { createGraph, createNode, keywordsCondition } from '@securebot/core/collaboration';

const graph = createGraph('my-workflow', '我的工作流')
  .mode('lightweight')
  .addAgents([
    createNode('agent-a', 'Agent A', '处理器', '你是处理器...'),
    createNode('agent-b', 'Agent B', '分析员', '你是分析员...'),
  ])
  .entry('agent-a')
  .addConditionalEdges('agent-a', [
    { target: 'agent-b', condition: keywordsCondition('分析', '评估') }
  ])
  .addDirectEdge('agent-b', 'agent-a')
  .build();
```

### 监控集成

```typescript
import { GraphTool } from '@securebot/tools/graph-tool';
import { EventBroadcaster, MetricsCollector } from '@securebot/core/monitoring';

const broadcaster = new EventBroadcaster();
const collector = new MetricsCollector();

const tool = new GraphTool({
  broadcaster,
  collector,
  llmClient: myLLMClient,
});

// 订阅事件
tool.subscribeEvents((event) => {
  console.log(`Event: ${event.type}`);
});

// 运行
const result = await tool.runGraph('my-workflow', 'input');

// 获取指标
const metrics = tool.getMetrics();
console.log(metrics);
```

---

## 监控与告警

### 实时监控

```bash
# 查看系统指标
openclaw graph status model-training-loop

# 输出示例
📊 Graph Status: model-training-loop
────────────────────────────────────────────────────────────
System Metrics:
  Total Events: 156
  Total Tokens: 12450
  Avg Latency: 234.56ms
  Error Rate: 0.00%

Agent Metrics:
  coordinator:
    Calls: 8
    Success: 8
    Errors: 0
    Avg Duration: 152.34ms

Heartbeat Status:
  🟢 coordinator: online
     Last seen: 2026-04-01 22:20:15
  🟢 data-engineer: online
     Last seen: 2026-04-01 22:20:12
```

### 告警配置

```typescript
import { AlertSystem, createFeishuHandler } from '@securebot/core/monitoring';

const alertSystem = new AlertSystem();

// 添加规则
alertSystem.addRule({
  id: 'high-error-rate',
  name: '高错误率告警',
  condition: 'event.type === "node_error"',
  channels: ['feishu'],
  severity: 'high',
  enabled: true,
  cooldown: 60000,
});

// 配置飞书告警
alertSystem.registerHandler('feishu', createFeishuHandler(WEBHOOK_URL));
```

---

## 心跳管理

### 配置

```typescript
import { HeartbeatManager } from '@securebot/core/heartbeat';

const manager = new HeartbeatManager({
  interval: 30000,     // 30秒心跳
  timeout: 60000,      // 60秒超时
  checkInterval: 10000, // 10秒检查
  maxMissed: 3,         // 3次丢失标记离线
});

// 注册 Agent
manager.registerAgent('agent-a');

// 订阅事件
manager.subscribe((event) => {
  if (event.type === 'agent_offline') {
    console.log(`Agent ${event.agentId} is offline!`);
  }
});

// 启动
manager.start();
```

### Agent 端

```typescript
import { createHttpHeartbeatClient } from '@securebot/core/heartbeat';

const client = createHttpHeartbeatClient(
  'agent-a',
  'http://localhost:3000/heartbeat'
);

// 设置状态
client.setCurrentTask('task-123');

// 启动心跳
client.start();

// 完成任务
client.setCurrentTask(undefined);
```

---

## 最佳实践

### 1. 选择合适的模式

| 场景 | 推荐模式 |
|------|---------|
| 一次性任务 | lightweight |
| 需要 Human-in-the-loop | langgraph |
| 长时间运行 | langgraph |
| 简单流程 | lightweight |

### 2. Agent 设计原则

- 单一职责：每个 Agent 只做一件事
- 清晰的系统提示：明确输入输出
- 合理的 Handoff：条件明确

### 3. 监控建议

- 启用心跳检测
- 配置关键告警
- 定期查看指标

---

## 故障排查

### 常见问题

**Q: 图加载失败**
```bash
# 检查 YAML 格式
openclaw graph load workflow.yaml
# 查看错误信息
```

**Q: Agent 离线**
```bash
# 查看心跳状态
openclaw graph status <graphId>
# 检查心跳客户端是否启动
```

**Q: 执行超时**
- 检查 LLM 客户端配置
- 查看告警日志
- 检查节点超时配置

---

## 更多资源

- [完整设计文档](./dev-plan-agent-collaboration.md)
- [示例工作流](../workflows/examples/)
- [API 参考](../src/core/collaboration/)