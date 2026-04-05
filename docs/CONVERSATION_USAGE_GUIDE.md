# 任务对话功能使用指南

## 功能概述

任务对话功能允许委派者和受托者在任务执行过程中进行实时沟通，对话历史会自动保存到任务的公共工作空间，确保信息不丢失。

---

## 主要特性

### 1. 对话持久化 ✅

- **自动保存**: 每条消息发送后自动保存到工作空间
- **历史加载**: 进入任务详情时自动加载所有历史对话
- **文件位置**: `{sharedWorkspace}/.conversations/{delegation-id}.json`

### 2. 对话界面 ✅

- **历史显示**: 显示最近20条对话记录
- **清晰标识**: 区分委派者、受托者、系统消息
- **时间标记**: 每条消息显示发送时间

### 3. @提及自动接受 ✅

- **触发方式**: 输入 `@<agentId>` 触发自动接受
- **即时响应**: 系统检测并显示自动接受对话框
- **执行通知**: 自动接受后任务立即开始执行

---

## 使用方法

### 查看任务对话

1. 在任务列表中选择任务查看详情
2. 系统自动加载并显示历史对话（最近20条）
3. 消息按时间顺序排列，带有发送者和时间标记

```
历史对话记录:
──────────────────────────────────────────────────
[委派者] 14:30
  @py 请接受这个任务

[系统] 14:31
  py 已自动接受任务
  任务将开始执行...

[受托者] 14:35
  已开始执行，预计完成时间15:00
──────────────────────────────────────────────────
```

### 发送新消息

1. 在任务详情界面选择 `m. 任务对话`
2. 查看历史对话记录
3. 输入新消息内容
4. 消息自动保存到工作空间

```
💬 任务对话
──────────────────────────────────────────────────
[输入消息内容]: 测试已完成，等待验收

✓ 消息已发送
时间: 14:45
对话已保存到工作空间
```

### @提及触发自动接受

**委派者操作流程：**

```
1. 发送消息: "@py 请接受这个任务"

2. 系统检测到@提及:
   ⚡⚡⚡ 检测到任务接受请求
   ──────────────────────────────────────────────────
   dev 请求 py 接受任务
   
   [a] 自动接受（推荐）
   [m] 等待被委托者登录确认
   [c] 取消
   ──────────────────────────────────────────────────

3. 选择 [a] 自动接受:

   ✓ 任务已被自动接受
   任务将开始执行...
   对话已保存到: workspace/.conversations/task-123.json

4. 系统发送通知:
   py 已自动接受任务
```

---

## 对话存储位置

### 文件结构

```
{sharedWorkspace}/
  .conversations/
    {delegation-id}.json     ← 对话存档文件
```

### 文件内容示例

```json
[
  {
    "id": "msg-001",
    "delegationId": "task-abc",
    "sender": "dev",
    "content": "@py 请接受这个任务",
    "timestamp": 1712234567890,
    "type": "text",
    "read": false
  },
  {
    "id": "msg-002",
    "delegationId": "task-abc",
    "sender": "system",
    "content": "py 已自动接受任务",
    "timestamp": 1712234568000,
    "type": "system",
    "read": true
  }
]
```

---

## 特殊场景处理

### 无工作空间的任务

如果任务没有设置 `sharedWorkspace`，对话仅保存在内存中，退出任务详情后对话历史会丢失。

**建议**: 委派任务时设置 `sharedWorkspace` 参数。

### 对话合并机制

- 加载时自动合并内存对话和文件对话
- 避免重复消息（按消息ID去重）
- 保持时间顺序排列

---

## API 参考

### ConversationStorage 类

```typescript
import { ConversationStorage } from './conversation-storage.js';

// 初始化
const storage = new ConversationStorage(workspacePath, delegationId);

// 加载历史
const messages = storage.loadConversation();

// 保存单个消息
storage.appendMessage(newMessage);

// 保存全部对话
storage.saveConversation(allMessages);

// 获取文件路径
const filePath = storage.getConversationFilePath();
```

### 消息类型

```typescript
interface ConversationMessage {
  id: string;                // 消息唯一ID
  delegationId: string;      // 关联任务ID
  sender: string;            // 发送者ID
  content: string;           // 消息内容
  timestamp: number;         // 时间戳
  type: 'text' | 'instruction' | 'feedback' | 'system' | 'tool_call' | 'tool_result';
  read: boolean;             // 是否已读
  metadata?: {               // 元数据
    toolName?: string;
    toolResult?: string;
    executionTime?: number;
  };
}
```

---

## 最佳实践

### 1. 委派任务时设置工作空间

```typescript
await collaborationManager.delegateTask({
  delegator: 'dev',
  delegatee: 'py',
  task: '实现用户登录功能',
  sharedWorkspace: '/path/to/workspace',  // ← 必须设置
  acceptanceCriteria: ['用户可以登录', '密码验证正确']
});
```

### 2. 重要决策使用对话记录

在任务对话中记录关键决策，方便后续追溯：

```
[委派者]: 选择使用JWT认证方案
[受托者]: 已记录，开始实现JWT认证
```

### 3. @提及提高响应速度

紧急任务使用@提及触发自动接受，减少等待时间。

---

## 相关文档

- [协作会话管理器完整实施报告](./COLLABORATION_SESSION_COMPLETE.md)
- [自动接受任务功能修复](./COLLABORATION_SESSION_COMPLETE.md#场景1)
- [协作会话系统设计](./collaboration-session-design.md)

---

## 版本历史

| 版本 | 功能 | 状态 |
|------|------|------|
| v1.0 | 文件监听同步 | ✅ |
| v1.1 | @提及检测 | ✅ |
| v1.2 | 自动接受对话框 | ✅ |
| v1.3 | 决策请求系统 | ✅ |
| v1.4 | 多感官提示 | ✅ |
| v1.5 | 任务对话持久化 | ✅ |
| v1.6 | 对话历史加载 | ✅ |

**当前版本**: v1.6
**完成度**: 100%