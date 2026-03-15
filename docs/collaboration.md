# Agent 协作系统

SecureBot 支持多个 Agent 之间的协作，包括消息传递、任务委派和共享工作空间。

## 概述

协作系统提供三种主要功能：
1. **消息传递** - Agent 间发送和接收消息
2. **任务委派** - 将任务委托给其他 Agent 执行
3. **共享工作空间** - 多个 Agent 共享文件和资源

## CLI 命令

### 查看协作状态

```bash
/collab status
```

显示：
- 待处理消息数
- 活跃委派数
- 共享工作空间数

### 查看消息

```bash
/collab messages
```

显示当前 Agent 收到的所有消息，包括：
- 请求 (request)
- 通知 (notification)
- 查询 (query)
- 委派 (delegation)

### 查看委派

```bash
/collab delegations
```

显示当前 Agent 相关的所有委派任务及其状态。

### 委派任务

```bash
/collab delegate <agent-id> <任务描述>
```

将任务委派给指定的 Agent。

示例：
```bash
/collab delegate reviewer 请审查 PR #123 的代码
```

## 消息类型

| 类型 | 说明 | 用途 |
|------|------|------|
| request | 请求 | 需要回复的询问 |
| response | 响应 | 对请求的回复 |
| notification | 通知 | 简单信息通知 |
| delegation | 委派 | 任务委派请求 |
| query | 查询 | 状态查询 |

## 委派状态

| 状态 | 说明 |
|------|------|
| pending | 等待接受 |
| accepted | 已接受 |
| rejected | 已拒绝 |
| in_progress | 执行中 |
| completed | 已完成 |
| failed | 执行失败 |

## 委派深度限制

为防止无限委派，系统限制最大委派深度为 3 层：

```
Agent A → Agent B → Agent C → Agent D ✗ (超过限制)
```

## 编程接口

### 发送消息

```typescript
import { getCollaborationManager } from './core/collaboration.js';

const collab = getCollaborationManager();

// 发送请求
await collab.request('agent-a', 'agent-b', '请帮忙分析这个文件', {
  priority: 'high',
});
```

### 委派任务

```typescript
const delegation = await collab.delegateTask(
  'manager',     // 委派者
  'developer',   // 受托者
  '实现新功能',  // 任务描述
  {
    context: '用户需要...',
    priority: 'high',
    deadline: Date.now() + 3600000, // 1小时后
  }
);

// 获取委派ID
console.log(delegation.id);
```

### 创建共享工作空间

```typescript
const workspace = await collab.createSharedWorkspace(
  '项目协作空间',
  ['agent-a', 'agent-b', 'agent-c']
);

// 获取工作空间路径
console.log(workspace.sharedPath);
```

### 检查权限

```typescript
const workspaceManager = collab.getWorkspaceManager();

// 检查权限
const canWrite = workspaceManager.checkPermission(
  workspace.id,
  'agent-a',
  'write'
);
```

## 使用场景

### 场景1：代码审查

```bash
# 开发者 Agent 委派审查任务
/collab delegate reviewer 请审查 src/auth.ts 的代码质量
```

### 场景2：多专家协作

```bash
# 前端专家委派后端专家
/collab delegate backend 我需要用户认证API，请帮忙设计
```

### 场景3：状态同步

```bash
# 查看所有协作状态
/collab status

# 查看消息
/collab messages
```

## 配置

在 `~/.securebot/config.json` 中配置：

```json5
{
  collaboration: {
    messageTimeout: 1800000,     // 消息超时 (30分钟)
    maxDelegationDepth: 3,       // 最大委派深度
    autoAcceptDelegation: false, // 自动接受委派
    messageRetention: 604800000, // 消息保留 (7天)
  },
}
```

## 最佳实践

1. **明确任务描述** - 委派任务时提供清晰的上下文
2. **合理设置优先级** - 高优先级任务优先处理
3. **及时响应** - 收到消息后尽快处理
4. **权限管理** - 共享空间按需授权