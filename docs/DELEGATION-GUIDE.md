# 委派任务使用指南

## 问题诊断

### 为什么任务一直显示pending？

委派任务pending的根本原因：**Agent没有注册委派处理器**

---

## 解决方案

### 方案1: 注册委派处理器（推荐）

在Agent初始化时注册handler：

```typescript
import { getCollaborationManager } from 'securebot';

const collaborationManager = getCollaborationManager();

// 注册处理器
collaborationManager.registerDelegationHandler('dev', async (delegation) => {
  console.log(`收到委派任务: ${delegation.task}`);
  
  // 1. 接受任务
  await collaborationManager.acceptDelegation(delegation.id);
  
  // 2. 处理任务
  const result = await processTask(delegation.task);
  
  // 3. 完成任务
  await collaborationManager.completeDelegation(delegation.id, result);
  
  return true; // 接受任务
});
```

### 方案2: 启动后台任务处理器

自动处理所有pending任务：

```typescript
const collaborationManager = getCollaborationManager();

// 启动后台处理器（每5秒检查一次）
collaborationManager.startDelegationProcessor(async (delegation) => {
  console.log(`自动处理任务: ${delegation.id}`);
  
  // 接受任务
  await collaborationManager.acceptDelegation(delegation.id);
  
  // 执行任务
  const result = await executeTask(delegation);
  
  // 完成任务
  await collaborationManager.completeDelegation(delegation.id, result);
});

// 程序退出时停止处理器
process.on('SIGINT', () => {
  collaborationManager.stopDelegationProcessor();
});
```

### 方案3: 手动处理pending任务

在REPL中：

```bash
# 查看pending任务
/collab delegations

# 手动接受任务（需要在代码中实现）
```

在代码中：

```typescript
// 获取pending任务
const delegations = collaborationManager.getDelegations('dev', 'delegatee');
const pending = delegations.filter(d => d.status === 'pending');

// 处理每个任务
for (const delegation of pending) {
  await collaborationManager.acceptDelegation(delegation.id);
  const result = await processTask(delegation.task);
  await collaborationManager.completeDelegation(delegation.id, result);
}
```

---

## 完整示例

### 创建一个简单的委派系统

```typescript
import { Agent, getCollaborationManager } from 'securebot';

// 创建Agent
const devAgent = new Agent('dev', '开发者Agent');

// 获取协作管理器
const collab = getCollaborationManager();

// 注册委派处理器
devAgent.onDelegation(async (delegation) => {
  const { task, delegator } = delegation;
  
  console.log(`收到来自 ${delegator} 的任务: ${task}`);
  
  try {
    // 执行任务
    const result = await devAgent.execute(task);
    
    // 标记完成
    await collab.completeDelegation(delegation.id, result);
    
    console.log(`任务完成: ${delegation.id}`);
  } catch (error) {
    // 标记失败
    await collab.rejectDelegation(delegation.id, error.message);
  }
  
  return true; // 接受任务
});

// 启动后台处理器作为备份
collab.startDelegationProcessor(async (delegation) => {
  if (delegation.delegatee === 'dev') {
    await collab.acceptDelegation(delegation.id);
  }
});
```

---

## 状态流转图

```
┌─────────┐
│ pending │ ← 任务创建
└────┬────┘
     │
     ├─── Agent接受 ───→ ┌──────────┐
     │                    │ accepted │
     │                    └─────┬────┘
     │                          │
     │                          ├─── 开始执行 ───→ ┌──────────────┐
     │                          │                  │ in_progress  │
     │                          │                  └───────┬──────┘
     │                          │                          │
     │                          │                          ├─── 成功 ───→ ┌───────────┐
     │                          │                          │              │ completed │
     │                          │                          │              └───────────┘
     │                          │                          │
     │                          │                          └─── 失败 ───→ ┌────────┐
     │                          │                                         │ failed │
     │                          │                                         └────────┘
     │                          │
     └─── Agent拒绝 ───→ ┌──────────┐
                         │ rejected │
                         └──────────┘
```

---

## API参考

### DelegationManager

#### `registerHandler(agentId, handler)`
注册委派处理器

```typescript
collab.registerHandler('dev', async (delegation) => {
  // 处理逻辑
  return true; // true=接受, false=拒绝
});
```

#### `hasHandler(agentId)`
检查是否注册了处理器

```typescript
const hasHandler = collab.hasHandler('dev');
// true 或 false
```

#### `startDelegationProcessor(processor)`
启动后台任务处理器

```typescript
collab.startDelegationProcessor(async (delegation) => {
  // 处理逻辑
});
```

#### `stopDelegationProcessor()`
停止后台处理器

```typescript
collab.stopDelegationProcessor();
```

#### `acceptDelegation(delegationId)`
接受委派

```typescript
await collab.acceptDelegation(delegationId);
```

#### `rejectDelegation(delegationId, reason?)`
拒绝委派

```typescript
await collab.rejectDelegation(delegationId, '任务不合理');
```

#### `completeDelegation(delegationId, result)`
完成委派

```typescript
await collab.completeDelegation(delegationId, '任务完成结果');
```

#### `getDelegations(agentId, role?)`
获取委派列表

```typescript
// 获取所有相关委派
const all = collab.getDelegations('dev');

// 只获取委派出去的
const delegated = collab.getDelegations('dev', 'delegator');

// 只获取收到的
const received = collab.getDelegations('dev', 'delegatee');
```

---

## 常见问题

### Q1: 如何批量处理pending任务？

```typescript
const pending = collab.getDelegations('dev', 'delegatee')
  .filter(d => d.status === 'pending');

for (const delegation of pending) {
  await processDelegation(delegation);
}
```

### Q2: 如何设置任务超时？

```typescript
await collab.delegateTask('user', 'dev', '任务内容', {
  deadline: Date.now() + 3600000, // 1小时后超时
  priority: 'high'
});
```

### Q3: 如何查看任务状态？

```bash
# REPL中
/collab delegations

# 代码中
const delegation = collab.getDelegation(delegationId);
console.log(delegation.status);
```

### Q4: 如何避免任务重复处理？

使用任务ID作为幂等键：

```typescript
const processed = new Set();

collab.registerHandler('dev', async (delegation) => {
  if (processed.has(delegation.id)) {
    return true; // 已处理，跳过
  }
  
  processed.add(delegation.id);
  
  // 处理任务
  await processTask(delegation);
  
  return true;
});
```

---

## 最佳实践

### 1. 及时注册处理器

在Agent启动时立即注册：

```typescript
class MyAgent {
  constructor() {
    this.setupDelegationHandler();
  }
  
  async setupDelegationHandler() {
    const collab = getCollaborationManager();
    collab.registerHandler(this.id, this.handleDelegation.bind(this));
  }
}
```

### 2. 使用后台处理器作为备份

```typescript
// 主处理器
collab.registerHandler('dev', handler);

// 备份处理器（处理未及时响应的任务）
collab.startDelegationProcessor(backupHandler);
```

### 3. 添加错误处理

```typescript
collab.registerHandler('dev', async (delegation) => {
  try {
    const result = await riskyOperation(delegation);
    await collab.completeDelegation(delegation.id, result);
    return true;
  } catch (error) {
    console.error('任务执行失败:', error);
    await collab.rejectDelegation(delegation.id, error.message);
    return false;
  }
});
```

### 4. 监控pending任务

```typescript
setInterval(() => {
  const pending = collab.getDelegations('dev', 'delegatee')
    .filter(d => d.status === 'pending');
  
  if (pending.length > 0) {
    console.warn(`⚠️  有 ${pending.length} 个pending任务`);
  }
}, 10000); // 每10秒检查一次
```

---

## 调试技巧

### 启用详细日志

```typescript
collab.registerHandler('dev', async (delegation) => {
  console.log('收到委派:', {
    id: delegation.id,
    from: delegation.delegator,
    task: delegation.task,
    priority: delegation.priority
  });
  
  // 处理...
  
  return true;
});
```

### 查看任务详情

```bash
# REPL中
/collab delegations

# 代码中
const delegation = collab.getDelegation('task-id');
console.log(JSON.stringify(delegation, null, 2));
```

---

**更新时间**: 2026-04-03  
**版本**: 1.0.0