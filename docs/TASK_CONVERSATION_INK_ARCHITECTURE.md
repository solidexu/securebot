# 任务对话 UI - Ink 架构方案

## 一、技术选型

### 1.1 核心框架

| 库 | 版本 | 用途 | 说明 |
|---|---|---|---|
| ink | ^4.4.1 | React for CLI | 主框架，类似 Go 的 Bubble Tea |
| react | ^18.2.0 | UI 框架 | Ink 基于 React |
| ink-text-input | ^5.0.1 | 输入组件 | 成熟的文本输入，支持中文 |
| ink-spinner | ^5.0.0 | 加载动画 | 执行中的加载指示器 |
| chalk | ^5.3.0 | 颜色输出 | 文本着色 |
| cli-truncate | ^4.0.0 | 文本截断 | 长文本处理 |

### 1.2 为什么选择 Ink

| 对比项 | blessed | Ink |
|--------|---------|-----|
| 架构模式 | 命令式 | 声明式 (React) |
| 输入处理 | 复杂，易出问题 | 成熟，支持中文 |
| 组件化 | 有限 | 完全组件化 |
| 状态管理 | 手动 | React Hooks |
| 社区活跃度 | 低 | 高 |
| 测试难度 | 高 | 中等 |

### 1.3 参考

- opencode (Go) 使用 Bubble Tea
- Ink 是 Bubble Tea 的 TypeScript/React 实现
- 相同的 Elm 架构模式

---

## 二、界面设计

### 2.1 布局结构

```
┌─────────────────────────────────────────────────────────────┐
│  💬 任务: 使用 Python 实现梯度下降算法 (ID: abc123)         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  消息区域 (70%)                              │ 侧边栏 (30%) │
│                                                             │
│  👤 dev 16:30 @py 接受任务                   │ 📋 任务状态  │
│  ⚡ 16:30 py 已自动接受                       │ ⏳ in_progress│
│  ⚡ 16:30 开始执行第1轮                       │ 轮次: 1/5    │
│  🔧 16:31 调用工具: write                    │─────────────│
│   ✓ 文件已写入: gradient.py                  │ 👥 参与者    │
│  🔧 16:32 调用工具: exec                     │ 🔄 py        │
│   ✓ 测试通过                                 │ 💤 dev (我)  │
│                                              │─────────────│
│                                              │ 📝 执行日志  │
│                                              │ [16:30] 开始 │
│                                              │ [16:31] write│
├─────────────────────────────────────────────────────────────┤
│  > 输入消息█                                                 │
│  (Enter 发送 | Esc 退出 | Ctrl+C 强退)                       │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 尺寸比例

| 区域 | 宽度 | 高度 |
|------|------|------|
| 标题栏 | 100% | 1 行 |
| 消息区域 | 70% | 85% - 4 行 |
| 侧边栏 | 30% | 85% - 4 行 |
| 输入区域 | 100% | 3 行 |

---

## 三、组件结构

```
src/cli/tui/
├── index.ts                    # 导出入口
├── TaskConversationApp.tsx     # 主应用组件
│
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx       # 主布局 (分屏容器)
│   │   └── SplitPane.tsx       # 分割面板
│   │
│   ├── chat/
│   │   ├── ChatPanel.tsx       # 左侧聊天面板
│   │   ├── MessageList.tsx     # 消息列表
│   │   ├── MessageItem.tsx     # 单条消息
│   │   └── ChatHeader.tsx      # 聊天标题
│   │
│   ├── sidebar/
│   │   ├── Sidebar.tsx         # 右侧边栏容器
│   │   ├── TaskStatus.tsx      # 任务状态卡片
│   │   ├── Participants.tsx    # 参与者列表
│   │   └── ExecutionLogs.tsx   # 执行日志
│   │
│   ├── input/
│   │   ├── InputArea.tsx       # 输入区域
│   │   └── MessageInput.tsx    # 消息输入框
│   │
│   └── common/
│       ├── Box.tsx             # 带边框盒子
│       ├── ScrollableList.tsx  # 可滚动列表
│       └── StatusBar.tsx       # 状态栏
│
├── hooks/
│   ├── useInput.ts             # 输入处理
│   ├── useMessages.ts          # 消息管理
│   ├── useTaskInfo.ts          # 任务信息
│   ├── useAgents.ts            # Agent 状态
│   └── useAppSize.ts           # 窗口大小
│
├── context/
│   └── TaskContext.tsx         # 任务上下文
│
├── types/
│   ├── message.ts              # 消息类型
│   ├── task.ts                 # 任务类型
│   └── agent.ts                # Agent 类型
│
└── utils/
    ├── format.ts               # 格式化工具
    ├── ansi.ts                 # ANSI 工具
    └── theme.ts                # 主题配置
```

---

## 四、核心代码实现

### 4.1 主应用组件

```typescript
// TaskConversationApp.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { TaskProvider, useTask } from './context/TaskContext';
import { AppLayout } from './components/layout/AppLayout';
import { ChatPanel } from './components/chat/ChatPanel';
import { Sidebar } from './components/sidebar/Sidebar';
import { InputArea } from './components/input/InputArea';

interface Props {
  taskInfo: TaskInfo;
  currentUserId: string;
  onMessage: (message: string) => void;
  onExit: () => void;
}

const TaskConversationApp: React.FC<Props> = ({
  taskInfo,
  currentUserId,
  onMessage,
  onExit
}) => {
  const { exit } = useApp();
  const [inputValue, setInputValue] = useState('');
  
  // 处理输入
  useInput((input, key) => {
    if (key.escape) {
      onExit();
      exit();
      return;
    }
    
    if (key.return) {
      if (inputValue.trim()) {
        onMessage(inputValue.trim());
        setInputValue('');
      }
      return;
    }
    
    if (key.backspace || key.delete) {
      setInputValue(v => v.slice(0, -1));
      return;
    }
    
    // 普通字符（包括中文）
    setInputValue(v => v + input);
  });
  
  return (
    <TaskProvider taskInfo={taskInfo} currentUserId={currentUserId}>
      <Box flexDirection="column" height="100%">
        <AppLayout
          left={<ChatPanel />}
          right={<Sidebar />}
          bottom={<InputArea value={inputValue} />}
        />
      </Box>
    </TaskProvider>
  );
};

export const startTaskConversation = (
  taskInfo: TaskInfo,
  currentUserId: string,
  onMessage: (message: string) => void
): Promise<void> => {
  return new Promise((resolve) => {
    const { waitUntilExit } = render(
      <TaskConversationApp
        taskInfo={taskInfo}
        currentUserId={currentUserId}
        onMessage={onMessage}
        onExit={resolve}
      />
    );
    waitUntilExit().then(resolve);
  });
};
```

### 4.2 主布局组件

```typescript
// components/layout/AppLayout.tsx
import React from 'react';
import { Box } from 'ink';

interface Props {
  left: React.ReactNode;
  right: React.ReactNode;
  bottom: React.ReactNode;
}

export const AppLayout: React.FC<Props> = ({ left, right, bottom }) => {
  return (
    <>
      {/* 主内容区 (85%) */}
      <Box flexDirection="row" height="85%">
        {/* 左侧 (70%) */}
        <Box width="70%" flexDirection="column">
          {left}
        </Box>
        
        {/* 分隔线 */}
        <Box width={1} borderStyle="single" borderColor="gray" />
        
        {/* 右侧 (30%) */}
        <Box width="30%" flexDirection="column">
          {right}
        </Box>
      </Box>
      
      {/* 输入区 (15%) */}
      <Box height="15%" flexDirection="column">
        {bottom}
      </Box>
    </>
  );
};
```

### 4.3 消息列表组件

```typescript
// components/chat/MessageList.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { useTask } from '../../context/TaskContext';

export const MessageList: React.FC = () => {
  const { messages } = useTask();
  
  return (
    <Box flexDirection="column" padding={1}>
      {messages.map(msg => (
        <MessageItem key={msg.id} message={msg} />
      ))}
    </Box>
  );
};

interface MessageItemProps {
  message: Message;
}

const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const time = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const getStyle = () => {
    switch (message.type) {
      case 'system': return { color: 'gray', icon: '⚡' };
      case 'tool': return { color: 'blue', icon: '🔧' };
      case 'review': return { color: 'yellow', icon: '✅' };
      default: return {
        color: message.sender === 'delegator' ? 'green' : 'cyan',
        icon: message.sender === 'delegator' ? '👤' : '🤖'
      };
    }
  };
  
  const style = getStyle();
  
  return (
    <Box marginBottom={1}>
      <Text color={style.color}>
        {style.icon} {message.sender} {time}
      </Text>
      <Text> {message.content}</Text>
    </Box>
  );
};
```

### 4.4 输入区域组件

```typescript
// components/input/InputArea.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { useTask } from '../../context/TaskContext';

interface Props {
  value: string;
}

export const InputArea: React.FC<Props> = ({ value }) => {
  const { taskInfo } = useTask();
  
  const getHint = () => {
    switch (taskInfo.status) {
      case 'pending': return '输入消息 | @受托者 自动接受';
      case 'pending_review': return '/accept 通过 | /reject <反馈>';
      case 'failed': return '/retry 重试';
      default: return '输入消息';
    }
  };
  
  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderColor="green">
        <Text bold color="green">
          {'> '}
        </Text>
        <Text>
          {value}
          <Text backgroundColor="white" color="black">█</Text>
        </Text>
      </Box>
      <Text dimColor>
        {getHint()} (Esc 退出, Enter 发送)
      </Text>
    </Box>
  );
};
```

### 4.5 侧边栏组件

```typescript
// components/sidebar/Sidebar.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { useTask } from '../../context/TaskContext';
import { TaskStatus } from './TaskStatus';
import { Participants } from './Participants';
import { ExecutionLogs } from './ExecutionLogs';

export const Sidebar: React.FC = () => {
  return (
    <Box flexDirection="column" padding={1}>
      <TaskStatus />
      <Participants />
      <ExecutionLogs />
    </Box>
  );
};

// TaskStatus.tsx
export const TaskStatus: React.FC = () => {
  const { taskInfo, messages } = useTask();
  
  const statusEmoji = {
    pending: '⏳',
    in_progress: '🔄',
    pending_review: '🔍',
    completed: '✅',
    failed: '❌'
  }[taskInfo.status] || '📋';
  
  const round = messages.filter(m => m.type === 'system' && m.content.includes('开始执行')).length;
  
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">📋 任务状态</Text>
      <Text>  状态: {statusEmoji} {taskInfo.status}</Text>
      <Text>  轮次: {round}/5</Text>
    </Box>
  );
};

// Participants.tsx
export const Participants: React.FC = () => {
  const { taskInfo, agents, currentUserId } = useTask();
  
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">👥 参与者</Text>
      {agents.map(agent => {
        const isMe = agent.id === currentUserId;
        const icon = agent.status === 'working' ? '🔄' : 
                    agent.status === 'completed' ? '✅' : '💤';
        return (
          <Text key={agent.id}>
            {icon} {agent.id}{isMe ? ' (我)' : ''}
          </Text>
        );
      })}
    </Box>
  );
};
```

### 4.6 任务上下文

```typescript
// context/TaskContext.tsx
import React, { createContext, useContext, useState, useCallback } from 'react';
import { Message, TaskInfo, AgentStatus } from '../types';

interface TaskContextValue {
  taskInfo: TaskInfo;
  messages: Message[];
  agents: AgentStatus[];
  logs: string[];
  currentUserId: string;
  addMessage: (message: Message) => void;
  updateAgentStatus: (agentId: string, status: AgentStatus['status']) => void;
  addLog: (log: string) => void;
}

const TaskContext = createContext<TaskContextValue | null>(null);

export const useTask = () => {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error('useTask must be used within TaskProvider');
  return ctx;
};

interface Props {
  children: React.ReactNode;
  taskInfo: TaskInfo;
  currentUserId: string;
}

export const TaskProvider: React.FC<Props> = ({ children, taskInfo, currentUserId }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [agents, setAgents] = useState<AgentStatus[]>([
    { id: taskInfo.delegator, name: taskInfo.delegator, status: 'idle' },
    { id: taskInfo.delegatee, name: taskInfo.delegatee, status: 'idle' }
  ]);
  
  const addMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, []);
  
  const updateAgentStatus = useCallback((agentId: string, status: AgentStatus['status']) => {
    setAgents(prev => prev.map(a => 
      a.id === agentId ? { ...a, status } : a
    ));
  }, []);
  
  const addLog = useCallback((log: string) => {
    const time = new Date().toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    setLogs(prev => [...prev.slice(-10), `[${time}] ${log}`]);
  }, []);
  
  return (
    <TaskContext.Provider value={{
      taskInfo,
      messages,
      agents,
      logs,
      currentUserId,
      addMessage,
      updateAgentStatus,
      addLog
    }}>
      {children}
    </TaskContext.Provider>
  );
};
```

---

## 五、类型定义

```typescript
// types/message.ts
export type MessageType = 'user' | 'agent' | 'system' | 'tool' | 'review';

export interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  type: MessageType;
}

// types/task.ts
export type TaskStatus = 
  | 'pending' 
  | 'accepted' 
  | 'in_progress' 
  | 'pending_review' 
  | 'completed' 
  | 'failed';

export interface TaskInfo {
  id: string;
  task: string;
  status: TaskStatus;
  delegator: string;
  delegatee: string;
  workspace?: string;
}

// types/agent.ts
export type AgentStatusType = 'idle' | 'working' | 'completed';

export interface AgentStatus {
  id: string;
  name: string;
  status: AgentStatusType;
  currentTask?: string;
}
```

---

## 六、使用方式

### 6.1 替换现有实现

```typescript
// src/cli/repl-commands.ts

import { startTaskConversation } from './tui';

// 在任务对话处理中
const ui = await startTaskConversation(
  {
    id: delegation.id,
    task: delegation.task,
    status: delegation.status,
    delegator: delegation.delegator,
    delegatee: delegation.delegatee,
    workspace: delegation.sharedWorkspace
  },
  state.currentAgentId,
  async (message: string) => {
    // 处理消息发送
    if (message.startsWith('/retry')) {
      await retryTask();
    } else if (message.startsWith('@')) {
      await handleMention(message);
    } else {
      await sendMessage(message);
    }
  }
);
```

### 6.2 外部接口

```typescript
// 添加消息
ui.addMessage({
  id: 'msg-1',
  sender: 'system',
  content: '任务开始执行',
  timestamp: Date.now(),
  type: 'system'
});

// 更新 Agent 状态
ui.updateAgentStatus('py', 'working');

// 添加日志
ui.addLog('调用工具: write');
```

---

## 七、优势对比

| 特性 | blessed | Ink |
|------|---------|-----|
| 输入稳定性 | ❌ 问题多 | ✅ 稳定 |
| 中文支持 | ❌ 需要特殊处理 | ✅ 原生支持 |
| 退出恢复 | ❌ 易出问题 | ✅ 自动恢复 |
| 组件复用 | ❌ 有限 | ✅ React 组件 |
| 状态管理 | ❌ 手动 | ✅ Hooks |
| 测试 | ❌ 困难 | ✅ React Testing |

---

## 八、注意事项

### 8.1 滚动处理

Ink 本身滚动支持有限，需要自定义实现：

```typescript
import { useState } from 'react';

const useScroll = (items: any[], visibleCount: number) => {
  const [offset, setOffset] = useState(0);
  
  const scrollUp = () => setOffset(Math.max(0, offset - 1));
  const scrollDown = () => setOffset(Math.min(items.length - visibleCount, offset + 1));
  
  return { offset, scrollUp, scrollDown };
};
```

### 8.2 性能优化

大量消息时使用虚拟列表：

```typescript
import { useMemo } from 'react';

const visibleMessages = useMemo(() => {
  return messages.slice(-50); // 只显示最近 50 条
}, [messages]);
```

### 8.3 颜色主题

统一使用 chalk 配置：

```typescript
// utils/theme.ts
export const colors = {
  primary: '#00d7ff',
  success: '#00ff00',
  error: '#ff0000',
  warning: '#ffaa00',
  muted: '#888888'
};

export const getStatusColor = (status: string) => {
  return {
    pending: 'yellow',
    in_progress: 'cyan',
    completed: 'green',
    failed: 'red'
  }[status] || 'white';
};
```

---

## 九、开发计划

### Phase 1: 基础框架 (Day 1)

- [ ] 安装依赖 (ink, react, chalk 等)
- [ ] 创建目录结构
- [ ] 实现 TaskContext
- [ ] 实现 AppLayout 分屏布局
- [ ] 基本渲染测试

### Phase 2: 消息显示 (Day 2)

- [ ] MessageList 组件
- [ ] MessageItem 消息格式化
- [ ] 消息类型样式
- [ ] 时间戳显示

### Phase 3: 输入系统 (Day 2)

- [ ] useInput hook
- [ ] InputArea 组件
- [ ] 中文输入测试
- [ ] 快捷键处理

### Phase 4: 侧边栏 (Day 3)

- [ ] TaskStatus 组件
- [ ] Participants 组件
- [ ] ExecutionLogs 组件

### Phase 5: 集成测试 (Day 3-4)

- [ ] 替换 TaskConversationUI
- [ ] 端到端测试
- [ ] 边界情况处理

---

## 十、参考资源

- [Ink 官方文档](https://github.com/vadimdemedes/ink)
- [Ink Text Input](https://github.com/vadimdemedes/ink-text-input)
- [Bubble Tea (Go)](https://github.com/charmbracelet/bubbletea)
- [opencode 源码](https://github.com/opencode-ai/opencode)