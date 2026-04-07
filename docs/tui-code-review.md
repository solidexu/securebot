# TUI Ink/React 代码审查报告

> 审查范围：`src/cli/tui/` 目录下所有 Ink/React 代码
> 审查时间：2026-04-07
> 严重程度：高 (🔴) | 中 (🟡) | 低 (🟢)

---

## 一、问题清单

### 🔴 高优先级

#### 1. Zustand Store 完全未被使用 (架构问题)

**位置**: 
- `store/index.ts`
- `store/editor-store.ts`
- `store/ui-store.ts`
- `store/message-store.ts`

**问题**: 代码同时维护了 Zustand store 和 React Context 两套状态管理，但实际只使用了 Context。

**影响**: 
- 代码重复维护
- Zustand store 完全死代码
- 混淆开发者

```typescript
// store/index.ts 导出了这些选择器...
export {
  useMessageStore,
  useMessageList,
  useMessageActions,
  useSelectedMessage,
  useUIStore,
  useFocus,
  useScroll,
  useHistory,
  useLogs,
  useEditorStore,
  useCodeEditor,
  useShellOutput,
} from './message-store.js';

// 但实际组件使用的是 Context
import { useApp } from '../../context/index.js';
```

**建议**: 删除所有 Zustand store 代码，或完全迁移到 Zustand。

---

#### 2. useEffect 依赖缺失 (Hook 使用)

**位置**: `App.tsx:109-130`

```typescript
useEffect(() => {
  setAgents(agents.map(id => ({
    id,
    name: id,
    status: 'idle' as const,
  })));
  setCurrentAgent(defaultAgent);
  if (initialSkills.length > 0) {
    setSkills(initialSkills);
  }
  addMessage({...});
  addLog('TUI initialized', 'info');
}, []);  // ⚠️ 依赖数组为空
```

**问题**: 依赖数组为空，但内部使用了 `agents`, `defaultAgent`, `initialSkills`, `setAgents`, `setCurrentAgent`, `setSkills`, `addMessage`, `addLog`。

**影响**: 首次渲染后执行一次，但如果回调函数引用更新（如 onMessage 变化），可能导致闭包陷阱。

**修复建议**:
```typescript
useEffect(() => {
  setAgents(agents.map(id => ({ id, name: id, status: 'idle' as const })));
  setCurrentAgent(defaultAgent);
  if (initialSkills.length > 0) {
    setSkills(initialSkills);
  }
  addMessage({
    sender: 'System',
    content: `Welcome to SecureBot! Current agent: ${defaultAgent}`,
    type: 'system',
  });
  addLog('TUI initialized', 'info');
}, [defaultAgent, agents, initialSkills.length]);
```

---

#### 3. setTimeout 未清理 (内存泄漏风险)

**位置**:

| 文件 | 行号 |
|------|------|
| `context/ui-context.tsx` | 110, 118, 155 |
| `context/editor-context.tsx` | 298 |
| `store/ui-store.ts` | 117, 128, 250 |
| `App.tsx` | 151 |

**示例** (`ui-context.tsx:110-113`):
```typescript
const setFocusPanel = useCallback((panel: FocusPanel) => {
  setState((prev) => ({
    ...prev,
    focusPanel: panel,
    focusBlink: true,
  }));
  // ⚠️ setTimeout 没有清理
  setTimeout(() => {
    setState((prev) => ({ ...prev, focusBlink: false }));
  }, 200);
}, []);
```

**修复建议**:
```typescript
const setFocusPanel = useCallback((panel: FocusPanel) => {
  setState((prev) => ({
    ...prev,
    focusPanel: panel,
    focusBlink: true,
  }));
  
  const timer = setTimeout(() => {
    setState((prev) => ({ ...prev, focusBlink: false }));
  }, 200);
  
  return () => clearTimeout(timer);  // 清理函数
}, []);
```

---

#### 4. useInput 依赖项过多导致重渲染 (性能问题)

**位置**: `components/input/InputBox.tsx:158-373`

```typescript
useInput((char, key) => {
  // 大量内联逻辑...
}, { isActive: !isStreaming });  // ⚠️ isActive 是响应式值
```

**问题**: `isActive` 是响应式值，每次 `isStreaming` 变化都会重新创建 useInput 回调。虽然 Ink 内部会处理，但可以通过稳定引用优化。

**修复建议**: 使用 useCallback 包裹或拆分组件。

---

#### 5. useApp Hook 过度聚合 (性能问题)

**位置**: `context/index.tsx:62-123`

```typescript
export const useApp = () => {
  const messagesCtx = useMessages();
  const editorCtx = useEditor();
  const uiCtx = useUI();
  const collabCtx = useCollaboration();

  return {
    // 消息相关 (8个)
    messages: messagesCtx.messages,
    addMessage: messagesCtx.addMessage,
    updateMessage: messagesCtx.updateMessage,
    // ... 更多
    
    // 编辑器相关 (9个)
    codeEditor: editorCtx.codeEditor,
    // ...
    
    // UI 相关 (17个)
    // ...
    
    // 协作相关 (7个)
    // ...
  };
};
```

**问题**: 
1. 任何状态变化都会导致使用 `useApp` 的组件完全重渲染
2. 无法利用 React 的细粒度更新
3. 40+ 属性集中在一个 hook

**修复建议**: 保留细粒度 hooks (useMessageList, useCodeEditor 等)，删除 `useApp`。

---

### 🟡 中优先级

#### 6. TypeScript `any` 类型使用

**位置**:

| 文件 | 行号 | 类型 |
|------|------|------|
| `App.tsx` | 13 | `msg: any` |
| `index.tsx` | 59, 69 | context 属性 |
| `context/ui-context.tsx` | 165 | `level` |
| `components/chat/MessageItem.tsx` | 30 | `meta as {...}` |
| `components/chat/MessageItem.tsx` | 78 | `color as any` |
| `components/status/AgentList.tsx` | 66, 71 | `color as any` |

**示例** (`App.tsx:13`):
```typescript
addMessage?: (msg: any) => string;
```

**修复建议**: 定义完整类型
```typescript
export interface MessageContext {
  addMessage?: (msg: Omit<Message, 'id' | 'timestamp'>) => string;
}
```

---

#### 7. 列表渲染使用数组索引作为 key

**位置**: 
- `components/chat/MessageList.tsx:131-141`
- `components/status/SkillViewer.tsx:32-52`

```typescript
// MessageList.tsx
{viewport.visibleLines.map((line, i) => (
  line.align === 'right' ? (
    <Box key={i} ...>  // ⚠️ 使用索引
```

**问题**: 当消息列表变化（添加/删除），可能导致错误的 DOM 更新。

**修复建议**: 使用稳定的消息 ID 作为 key。

---

#### 8. useInput 回调过于庞大

**位置**: `components/input/InputBox.tsx:158-373` (215 行)

**问题**: 单个 useInput 回调处理了 20+ 种输入场景，难以维护。

**建议**: 拆分输入处理逻辑
```typescript
// 拆分方案
const handleMessageViewerInput = useCallback((char, key) => {...}, [...]);
const handleNormalInput = useCallback((char, key) => {...}, [...]);

useInput(messageViewerOpen ? handleMessageViewerInput : handleNormalInput, ...);
```

---

#### 9. Context 重复定义类型

**位置**:
- `types/message.ts`
- `types/agent.ts`
- `context/editor-context.tsx`
- `context/messages-context.tsx`

**问题**: 类型定义在多个文件中重复，例如 `DisplayLine`, `CodeEditorState`, `ShellOutputState` 在 store 和 context 中各有一份。

**建议**: 统一使用 `types/` 目录下的定义。

---

#### 10. 闪烁效果重复实现

**位置**:
- `components/chat/ChatPanel.tsx:13-26`
- `components/status/StatusPanel.tsx:17-31`
- `components/status/AgentList.tsx:15-29`

**问题**: 三处几乎相同的闪烁逻辑重复。

**建议**: 抽取为自定义 hook
```typescript
// hooks/useBlink.ts
export const useBlink = (trigger: boolean, duration = 300) => {
  const [blinkOn, setBlinkOn] = useState(false);
  // ...
  return blinkOn;
};
```

---

### 🟢 低优先级

#### 11. 未使用的 Props 类型

**位置**: `components/chat/ChatPanel.tsx:74`

```typescript
const Spinner: React.FC<{ type?: string }> = () => (
  <Text color="yellow">{'\u25a0'}</Text>
);
```

**问题**: `type` prop 未使用。

---

#### 12. 常量重复定义

**位置**:
- `components/chat/MessageList.tsx:15` - `WINDOW_HEIGHT = 30`
- `components/input/InputBox.tsx:24` - `CHAT_WINDOW_HEIGHT = 30`

**建议**: 提取到统一常量文件。

---

#### 13. 魔法数字

**位置**: 多处
```typescript
// editor-context.tsx:146
}, 35);  // 动画间隔

// editor-context.tsx:253
}, 100);  // 动画间隔

// ui-context.tsx:112
}, 200);  // 闪烁持续时间
```

**建议**: 定义常量别名。

---

## 二、改进建议

### 架构改进

#### 1. 统一状态管理

选择以下方案之一：

**方案 A (推荐)**: 完全使用 Zustand
```typescript
// 删除所有 Context 代码
// 使用现有的 store

import { useMessageStore, useMessageList } from './store/index.ts';

// 组件中使用
const messages = useMessageList();
```

**方案 B**: 清理 Zustand 代码
```bash
rm src/cli/tui/store/*
```

---

#### 2. 组件拆分

`InputBox.tsx` 建议拆分:
```
InputBox/
├── InputBox.tsx        # 主组件
├── useInputHandler.ts  # 输入处理逻辑 hook
├── completion.ts       # 补全逻辑
└── scroll.ts           # 滚动处理
```

---

### 性能优化

#### 1. 避免 `useApp` 聚合

```typescript
// ❌ 之前
const { messages, isStreaming } = useApp();

// ✅ 之后 (使用细粒度 hooks)
const messages = useMessageList();
const { isStreaming } = useUI();  // 只订阅需要的状态
```

---

#### 2. 虚拟列表优化

当前 `MessageList` 使用手动窗口计算，建议使用 `@tanstack/react-virtual` 或类似库。

---

#### 3. useCallback 稳定引用

```typescript
// ❌ 之前
const handleSubmit = useCallback(async (input: string) => {
  // ...
}, [addMessage, addLog, onMessage, ...]);

// ✅ 之后 - 最小化依赖
const handleSubmit = useCallback(async (input: string) => {
  // 内部直接调用 store action
  messageActions.addMessage({...});
}, []);  // action 引用稳定
```

---

## 三、代码示例

### 示例 1: 修复 setTimeout 清理

```typescript
// context/ui-context.tsx

// 之前
const setFocusPanel = useCallback((panel: FocusPanel) => {
  setState((prev) => ({
    ...prev,
    focusPanel: panel,
    focusBlink: true,
  }));
  setTimeout(() => {
    setState((prev) => ({ ...prev, focusBlink: false }));
  }, 200);
}, []);

// 之后 - 使用 useRef 存储 timer
export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<UIState>(defaultState);
  const focusBlinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setFocusPanel = useCallback((panel: FocusPanel) => {
    // 清理之前的 timer
    if (focusBlinkTimerRef.current) {
      clearTimeout(focusBlinkTimerRef.current);
    }
    
    setState((prev) => ({
      ...prev,
      focusPanel: panel,
      focusBlink: true,
    }));
    
    focusBlinkTimerRef.current = setTimeout(() => {
      setState((prev) => ({ ...prev, focusBlink: false }));
    }, 200);
  }, []);

  // Provider 卸载时清理
  useEffect(() => {
    return () => {
      if (focusBlinkTimerRef.current) {
        clearTimeout(focusBlinkTimerRef.current);
      }
    };
  }, []);

  // ...
};
```

---

### 示例 2: 抽取闪烁逻辑

```typescript
// hooks/useBlink.ts
import { useState, useEffect, useRef } from 'react';

interface UseBlinkOptions {
  duration?: number;    // 闪烁持续时间 (ms)
  interval?: number;    // 闪烁间隔 (ms)
  count?: number;       // 闪烁次数
}

export const useBlink = (trigger: boolean, options: UseBlinkOptions = {}) => {
  const { duration = 300, interval = 50, count = 6 } = options;
  const [blinkOn, setBlinkOn] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef(0);

  useEffect(() => {
    if (!trigger) {
      setBlinkOn(false);
      return;
    }

    countRef.current = 0;
    setBlinkOn(true);

    intervalRef.current = setInterval(() => {
      countRef.current++;
      if (countRef.current >= count) {
        setBlinkOn(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else {
        setBlinkOn(prev => !prev);
      }
    }, interval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [trigger, duration, interval, count]);

  return blinkOn;
};
```

**使用**:
```typescript
// components/status/AgentList.tsx

// 之前
useEffect(() => {
  if (focusBlink && isFocused) {
    let count = 0;
    const interval = setInterval(() => {
      setBlinkOn(prev => !prev);
      count++;
      if (count >= 6) {
        setBlinkOn(false);
        clearInterval(interval);
      }
    }, 50);
    return () => clearInterval(interval);
  }
}, [focusBlink, isFocused]);

// 之后
const blinkOn = useBlink(focusBlink && isFocused);
```

---

### 示例 3: 修复 TypeScript 类型

```typescript
// types/message.ts - 完善类型

export type MessageType = 'user' | 'agent' | 'system' | 'tool' | 'error' | 'skill' | 'warn';

export interface MessageMeta {
  name?: string;
  path?: string;
  arguments?: Record<string, unknown>;
  lineCount?: number;
}

export interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  type: MessageType;
  meta?: MessageMeta;
}

// App.tsx - 使用正确类型

export interface MessageContext {
  setCurrentAgent?: (id: string) => void;
  setIsStreaming?: (v: boolean) => void;
  updateMessage?: (id: string, content: string) => void;
  addMessage?: (msg: Omit<Message, 'id' | 'timestamp'>) => string;
  // ...
}
```

---

### 示例 4: 最小化 useCallback 依赖

```typescript
// store/message-store.ts - action 已经稳定引用

export const useMessageActions = () =>
  useMessageStore((s) => ({
    addMessage: s.addMessage,
    updateMessage: s.updateMessage,
    clearMessages: s.clearMessages,
    selectMessage: s.selectMessage,
  }));

// components/chat/ChatPanel.tsx

// 之前 - 依赖过多
const handleSubmit = useCallback(async (input: string) => {
  addMessage({...});
  addLog(...);
  // ...
}, [addMessage, addLog, onMessage, setCurrentAgent, setIsStreaming, ...]);

// 之后 - 使用稳定的 action 对象
const messageActions = useMessageActions();
const uiActions = useUI();  // 包含 addLog

const handleSubmit = useCallback(async (input: string) => {
  messageActions.addMessage({
    sender: 'You',
    content: input,
    type: 'user',
  });
  uiActions.addLog(`User input: ${input.slice(0, 30)}...`, 'info');
  // ...
}, []);  // 空依赖 - actions 引用稳定
```

---

## 四、总结

| 分类 | 数量 | 严重程度 |
|------|------|----------|
| 架构问题 | 1 | 🔴 |
| Hook 依赖 | 1 | 🔴 |
| 内存泄漏 | 4 | 🔴 |
| 性能问题 | 2 | 🔴 |
| TypeScript | 4 | 🟡 |
| 代码重复 | 3 | 🟡 |
| 其他 | 3 | 🟢 |

**建议优先修复**:
1. 清理 Zustand store 或完全迁移到 Zustand
2. 修复 useEffect 依赖数组
3. 修复 setTimeout 内存泄漏
4. 避免 useApp 过度聚合
5. 修复 TypeScript any 类型

**长期改进**:
- 组件拆分优化
- 统一类型定义
- 抽取公共 hook
- 性能监控