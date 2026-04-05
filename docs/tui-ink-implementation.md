# SecureBot TUI (Ink 架构) - 完成文档

基于 Ink (React for CLI) 的终端用户界面模块

## 完成进度

```
Phase 1: 基础架构 ✅ 100%
Phase 2: 核心组件 ✅ 100%
Phase 3: 集成功能 ✅ 100%
```

## 模块结构

```
src/cli/tui/
├── components/              # React 组件
│   ├── chat/               # 聊天模块
│   │   ├── ChatPanel.tsx   # 聊天面板容器
│   │   ├── MessageList.tsx # 消息列表
│   │   ├── MessageItem.tsx # 单条消息
│   │   └── MessageItemMd.tsx # Markdown消息
│   │
│   ├── status/             # 状态面板模块
│   │   ├── StatusPanel.tsx # 状态面板容器
│   │   ├── TaskStatus.tsx  # 任务状态
│   │   ├── AgentList.tsx   # Agent列表
│   │   └── LogViewer.tsx   # 日志查看器
│   │
│   ├── input/              # 输入模块
│   │   └── InputBox.tsx    # 输入框
│   │
│   ├── layout/             # 布局组件
│   │   ├── MainLayout.tsx  # 主布局 (70%-30%分屏)
│   │   └── InputArea.tsx   # 底部输入区
│   │
│   └── collaboration/      # 协作模块
│       └── CollaborationPanel.tsx # 协作面板
│
├── services/               # 服务层
│   ├── StreamService.ts    # 流式输出服务
│   └── MarkdownRenderer.tsx # Markdown渲染器
│
├── context/                # React Context
│   └── AppContext.tsx      # 全局应用状态
│
├── types/                  # TypeScript 类型
│   ├── message.ts          # 消息类型
│   └── agent.ts            # Agent类型
│
├── styles/                 # 样式配置
│   └── theme.ts            # 主题配置
│
├── App.tsx                 # 主应用组件
├── index.tsx               # 入口文件
└── demo.tsx                # 演示程序
```

## 已创建文件 (30个)

**类型定义 (3个)**
- `types/message.ts` - 消息类型
- `types/agent.ts` - Agent类型
- `types/index.ts` - 类型导出

**样式主题 (2个)**
- `styles/theme.ts` - 主题配置
- `styles/index.ts` - 样式导出

**Context (2个)**
- `context/AppContext.tsx` - 全局状态管理
- `context/index.ts` - Context导出

**服务层 (3个)**
- `services/StreamService.ts` - 流式输出服务
- `services/MarkdownRenderer.tsx` - Markdown渲染器
- `services/index.ts` - 服务导出

**聊天组件 (5个)**
- `components/chat/ChatPanel.tsx`
- `components/chat/MessageList.tsx`
- `components/chat/MessageItem.tsx`
- `components/chat/MessageItemMd.tsx`
- `components/chat/index.ts`

**状态组件 (5个)**
- `components/status/StatusPanel.tsx`
- `components/status/TaskStatus.tsx`
- `components/status/AgentList.tsx`
- `components/status/LogViewer.tsx`
- `components/status/index.ts`

**输入组件 (2个)**
- `components/input/InputBox.tsx`
- `components/input/index.ts`

**布局组件 (3个)**
- `components/layout/MainLayout.tsx`
- `components/layout/InputArea.tsx`
- `components/layout/index.ts`

**协作组件 (2个)**
- `components/collaboration/CollaborationPanel.tsx`
- `components/collaboration/index.ts`

**主文件 (3个)**
- `App.tsx` - 主应用组件
- `index.tsx` - 入口文件
- `demo.tsx` - 演示程序

## 使用方式

### 启动 TUI

```bash
# 使用 Ink TUI
securebot chat --tui

# 使用旧版 blessed TUI
securebot chat --legacy-tui

# 普通 REPL
securebot chat
```

### 代码示例

```tsx
import { startTuiRepl } from './cli/tui/index.js';

await startTuiRepl({
  defaultAgent: 'dev',
  model: 'llama3.2',
});
```

### 使用服务

```typescript
import { StreamService, MarkdownRenderer } from './cli/tui/services/index.js';

// 流式输出
const stream = new StreamService({ updateInterval: 50 });
stream.setOnChunk((chunk) => console.log(chunk));
stream.start('msg-1');
stream.append('Hello ');
stream.append('World!');
stream.complete();

// Markdown 渲染
const renderer = new MarkdownRenderer();
const { elements } = renderer.render('# Hello\n- Item 1\n- Item 2');
```

## 核心特性

| 特性 | 实现 |
|------|------|
| 布局系统 | Flexbox (Yoga引擎) |
| 状态管理 | React Context + Hooks |
| 组件化 | 函数组件 + JSX |
| 类型安全 | TypeScript |
| 流式输出 | StreamService |
| Markdown | MarkdownRenderer |
| 主题配置 | 可配置颜色和图标 |

## 键盘快捷键

- `Enter` - 发送消息
- `Tab` - 自动补全 (命令/Agent)
- `↑/↓` - 历史记录导航
- `Ctrl+C` - 退出

## 依赖

```json
{
  "dependencies": {
    "ink": "^6.8.0",
    "react": "^19.2.4",
    "ink-spinner": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0"
  }
}
```

## 与 Blessed 对比

| 特性 | Blessed | Ink |
|------|---------|-----|
| 编程范式 | 命令式 | 声明式 (React) |
| 布局系统 | 手动计算 | Flexbox |
| 状态管理 | 手动管理 | React Hooks |
| 组件复用 | 类继承 | 函数组件 |
| 类型安全 | 弱 | 强 |
| 开发体验 | 复杂 | 现代化 |

---

**创建时间**: 2026-04-05  
**架构**: Ink (React for CLI)  
**状态**: 全部完成 ✅