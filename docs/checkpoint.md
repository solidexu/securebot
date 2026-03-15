# 任务检查点管理

SecureBot 支持任务检查点机制，可以在任务执行过程中自动保存状态，并在需要时恢复执行。

## 概述

检查点系统提供以下功能：
- 自动保存任务进度
- 断点续执行
- 跨会话任务恢复
- 执行日志记录

## CLI 命令

### 列出检查点

```bash
/checkpoint list
```

显示所有已保存的检查点，包括：
- 创建时间
- 会话ID
- 任务进度

### 保存检查点

```bash
/checkpoint save
```

手动保存当前任务状态的检查点。

### 查看任务状态

```bash
/checkpoint status
```

显示当前任务的详细状态：
- 总任务数
- 已完成数
- 进行中
- 失败数
- 跳过数

### 恢复任务

```bash
/checkpoint resume <checkpoint-id>
```

从指定的检查点恢复任务执行。

## 自动检查点

系统会在以下情况自动保存检查点：
- 每隔 30 秒（可配置）
- 任务超时时
- 连续失败时
- 检测到循环时

## 配置

在 `~/.securebot/config.json` 中配置：

```json5
{
  taskControl: {
    maxTimeoutMs: 600000,        // 最大执行时间 (毫秒)
    maxConsecutiveFailures: 3,   // 连续失败次数上限
    loopDetection: true,         // 循环检测
    maxRounds: 100,              // 最大轮数
    enableCheckpoint: true,      // 启用检查点
    checkpointIntervalMs: 30000, // 检查点间隔
    maxCheckpoints: 10,          // 最大检查点数
  },
}
```

## 编程接口

```typescript
import { getTaskManager } from './core/task-manager.js';

const taskManager = getTaskManager();

// 开始任务
taskManager.start('session-1', 'agent-1', '用户请求');

// 设置 TODO 列表
taskManager.setTodos([
  { id: '1', task: '步骤一', status: 'pending' },
  { id: '2', task: '步骤二', status: 'pending' },
]);

// 保存检查点
const checkpointId = taskManager.saveCheckpoint();

// 恢复检查点
const result = taskManager.resumeFromCheckpoint({ checkpointId });

// 导出报告
const report = taskManager.exportReport();
```

## 执行日志

每个检查点包含完整的执行日志：

```typescript
const log = taskManager.getExecutionLog();
// [
//   { timestamp: 1710123456789, type: 'step_start', data: {...} },
//   { timestamp: 1710123457890, type: 'tool_call', data: {...} },
//   { timestamp: 1710123458901, type: 'step_complete', data: {...} },
// ]
```

## 最佳实践

1. **关键节点保存** - 在重要步骤完成后手动保存检查点
2. **定期清理** - 旧的检查点会自动清理，最多保留 10 个
3. **恢复前确认** - 恢复前先查看任务状态，确认剩余工作
4. **报告导出** - 任务完成后导出报告存档