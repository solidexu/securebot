# HITL 人在回路 - 使用文档

> Human-in-the-loop 工作流审批与交互系统

---

## 快速开始

### 1. 基础用法

在 YAML 工作流中添加 HITL 配置：

```yaml
id: my-workflow
name: 含审批的工作流
mode: lightweight

hitl:
  level: node_interrupt        # 节点中断模式
  interruptNodes:              # 需要审批的节点
    - security-scanner
    - deploy
  autoApproveTimeoutMs: 30000  # 30秒超时自动通过

entry: analyzer
```

### 2. 运行

```bash
# 加载工作流
openclaw graph load my-workflow.yaml

# 运行
openclaw graph run my-workflow "分析这段代码"

# 查看待处理中断
openclaw graph hitl status

# 批准
openclaw graph hitl approve <thread-id>

# 拒绝（可指定跳转节点）
openclaw graph hitl reject <thread-id> --goto fallback
```

---

## 五种干预级别

| 级别 | 常量 | 说明 |
|------|------|------|
| 全自动 | `full_auto` | 默认行为，不中断 |
| 工具审批 | `tool_approval` | 工具调用前需审批 |
| 节点中断 | `node_interrupt` | 指定节点前后中断 |
| 逐步执行 | `step_through` | 每个节点都暂停 |
| 全手动 | `full_manual` | 节点前后都中断 |

### 级别配置示例

```yaml
# 全自动（默认）
hitl:
  level: full_auto

# 工具审批 - 所有工具调用需审批
hitl:
  level: tool_approval
  approvedTools:        # 白名单工具免审批
    - read_file
    - grep

# 节点中断 - 特定节点需要审批
hitl:
  level: node_interrupt
  interruptNodes:
    - code-reviewer
    - deployer

# 逐步执行 - 每个节点都暂停
hitl:
  level: step_through

# 全手动 - 最严格模式
hitl:
  level: full_manual
```

---

## 单个 Agent 级别配置

可以为特定 Agent 单独配置中断行为：

```yaml
hitl:
  level: node_interrupt
  agentConfig:
    security-scanner:
      interruptBefore: true   # 执行前中断
      interruptAfter: true    # 执行后中断
    deployer:
      interruptBefore: true
```

---

## CLI 命令参考

### graph hitl status

查看当前待处理的中断。

```bash
openclaw graph hitl status
```

输出：
```
⏸️  待处理中断 (2 个):
────────────────────────────────────────────────────────────────────

  Thread: abc-123
  节点:   security-scanner
  位置:   before_node
  原因:   需要用户审批
  创建:   14:30:00

  Thread: def-456
  节点:   deployer
  位置:   before_node
  原因:   部署前确认
  创建:   14:31:00
```

### graph hitl approve <threadId>

批准指定线程的中断，继续执行。

```bash
openclaw graph hitl approve abc-123
```

### graph hitl reject <threadId>

拒绝指定线程的中断。

```bash
# 跳到下一个节点
openclaw graph hitl reject abc-123

# 跳到指定节点
openclaw graph hitl reject abc-123 --goto fallback-node
```

### graph hitl skip <threadId>

跳过当前节点，继续执行下一个。

```bash
openclaw graph hitl skip abc-123
```

### graph hitl abort <threadId>

终止整个工作流执行。

```bash
openclaw graph hitl abort abc-123
```

### graph hitl decide <threadId>

交互式决策菜单。在 TTY 终端中显示完整的决策界面。

```bash
openclaw graph hitl decide abc-123
```

菜单选项：
1. ✅ 通过 (approve)
2. ❌ 拒绝 (reject)
3. ⏭️ 跳过 (skip)
4. ✏️ 修改后继续 (modify)
5. ⛔ 终止 (abort)

### graph hitl edit <threadId>

编辑工作流状态。

```bash
openclaw graph hitl edit abc-123 --values '{"messages": ["override content"]}'
```

### graph hitl list

列出所有中断记录。

```bash
openclaw graph hitl list
```

---

## API 参考

### 创建 HITL 管理器

```typescript
import { createHitlManager, HumanInteractionManager } from './core/collaboration';

const manager = createHitlManager();
```

### 设置 HITL 配置

```typescript
import { GraphExecutor, HitlLevel } from './core/collaboration';

const executor = new GraphExecutor(graph);
executor.setHitl(manager, {
  level: HitlLevel.NODE_INTERRUPT,
  interruptNodes: ['node-a', 'node-b'],
  autoApproveTimeoutMs: 30000,
  agentConfig: {
    'node-a': { interruptAfter: true },
  },
});
```

### 查看待处理中断

```typescript
const interrupts = await manager.listPendingInterrupts();
```

### 提交决策

```typescript
import { HumanDecision } from './core/collaboration';

await manager.submitDecision(threadId, {
  action: 'approve',
  reason: 'Looks good',
});
```

### 编辑状态

```typescript
await manager.editState(threadId, {
  messages: ['new content'],
  context: { key: 'value' },
});
```

### Orchestrator 代理方法

```typescript
// 提交决策
await orchestrator.submitDecision(threadId, decision);

// 获取待处理中断
const pending = await orchestrator.getPendingInterrupts();

// 编辑状态
await orchestrator.editState(threadId, values);

// 获取单个中断
const interrupt = await orchestrator.getInterrupt(threadId);
```

---

## 超时自动通过

设置 `autoApproveTimeoutMs` 后，如果用户在指定时间内未响应，系统自动批准。

```yaml
hitl:
  level: node_interrupt
  interruptNodes:
    - deploy
  autoApproveTimeoutMs: 60000  # 60秒后自动通过
```

---

## 完整示例

### 代码审查含审批

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
  autoApproveTimeoutMs: 30000

entry: style-checker

agents:
  - id: style-checker
    name: 风格检查员
    role: 代码风格检查
    systemPrompt: 检查代码风格和格式。

  - id: bug-finder
    name: Bug 检查员
    role: 潜在 Bug 检查
    systemPrompt: 查找潜在 Bug 和逻辑错误。

  - id: security-scanner
    name: 安全扫描员
    role: 安全问题检查
    systemPrompt: 扫描安全漏洞。

edges:
  - source: style-checker
    target: bug-finder
    type: direct
  - source: bug-finder
    target: security-scanner
    type: direct
  - source: security-scanner
    target: __end__
    type: direct
```

### 逐步调试模式

```yaml
id: step-debug
name: 逐步调试
mode: lightweight

hitl:
  level: step_through

entry: analyzer

agents:
  - id: analyzer
    name: 分析器
    role: 问题分析
    systemPrompt: 分析问题并提供解决方案。

  - id: resolver
    name: 解决器
    role: 问题解决
    systemPrompt: 根据分析结果解决问题。

edges:
  - source: analyzer
    target: resolver
    type: direct
  - source: resolver
    target: __end__
    type: direct
```

---

## 流式事件

运行 HITL 工作流时，会输出以下事件：

| 事件类型 | 说明 |
|---------|------|
| `hitl_interrupt` | 执行被中断，等待人类决策 |
| `hitl_decision` | 用户提交了决策 |
| `hitl_approval` | 工具调用被批准/拒绝 |

---

## 故障排查

### 中断不触发

检查 `hitl.level` 是否正确设置，`interruptNodes` 中的节点 ID 是否匹配。

### 超时不起作用

确认 `autoApproveTimeoutMs` 是正整数，单位为毫秒。

### 决策无效

确保 `action` 是合法值：`approve`, `reject`, `skip`, `modify`, `abort`。
