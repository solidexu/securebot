# SecureBot TUI (Terminal User Interface)

基于 blessed 的终端用户界面模块

## 模块结构

```
src/cli/tui/
├── core/                    # 核心引擎
│   ├── layout.ts            # 刚性布局引擎
│   ├── render-engine.ts     # 双缓冲渲染引擎
│   ├── input-handler.ts     # 统一输入处理器
│   └── screen-manager.ts    # 屏幕生命周期管理
│
├── components/              # UI组件
│   ├── chat-panel.ts        # 左侧聊天面板
│   ├── status-panel.ts      # 右侧状态面板
│   └── input-panel.ts       # 底部输入面板
│
├── features/                # 功能模块
│   └── stream-output.ts     # 流式输出处理器
│
├── styles/                  # 样式主题
│   └── theme.ts             # 主题配置
│
└── index.ts                 # 主入口
```

## Phase 1 & 2 完成内容

### Phase 1: 基础架构 ✅

#### 1.1 刚性布局引擎
- ✅ 固定比例布局 (70%-30% 分屏)
- ✅ 像素级锁定防止变形
- ✅ 终端尺寸变化自动调整
- ✅ 区域注册和管理

#### 1.2 双缓冲渲染引擎
- ✅ 内容缓冲区
- ✅ 脏区域标记机制
- ✅ 帧率限制 (60fps)
- ✅ 批量更新优化

#### 1.3 统一输入处理器
- ✅ 使用 blessed textbox
- ✅ Tab 自动补全 (命令/Agent)
- ✅ 历史记录导航 (↑/↓)
- ✅ 中断处理 (Ctrl+C)

#### 1.4 屏幕生命周期管理
- ✅ 创建/销毁生命周期
- ✅ 异常退出清理
- ✅ 优雅关闭流程
- ✅ 调试模式

### Phase 2: 核心组件 ✅

#### 2.1 聊天面板
- ✅ 消息分组显示
- ✅ 不同类型消息样式
- ✅ 流式内容追加
- ✅ 滚动支持

#### 2.2 状态面板
- ✅ 任务状态模块 (25%)
- ✅ Agent列表模块 (35%)
- ✅ 执行日志模块 (40%)
- ✅ 实时更新

#### 2.3 输入面板
- ✅ 固定底部位置
- ✅ 当前Agent提示符
- ✅ 命令补全
- ✅ Agent补全

#### 2.4 流式输出处理器
- ✅ 按词批量更新
- ✅ 进度指示器
- ✅ 中断支持
- ✅ 性能统计

## 使用示例

```typescript
import { SecureBotTUI } from './cli/tui/index.js';

// 创建TUI实例
const tui = new SecureBotTUI({
  debug: true,
  title: 'SecureBot',
});

// 设置Agent列表
tui.setAgents(['dev', 'support', 'analyst']);
tui.setCurrentAgent('dev', 'Development Assistant');

// 监听输入
tui.onInput(async (input) => {
  // 显示用户消息
  tui.addMessage({
    sender: 'You',
    content: input,
    type: 'user',
  });

  // 流式输出响应
  const messageId = `msg-${Date.now()}`;
  const stream = tui.getStreamHandler();
  stream.start(messageId, 'dev');

  for (const char of response) {
    stream.append(char);
    await delay(20);
  }

  stream.complete();
});

// 启动TUI
await tui.start();
```

## 关键特性

| 特性 | 实现方式 | 效果 |
|------|----------|------|
| 布局稳定性 | RigidLayout + 像素锁定 | 防止内容变化导致变形 |
| 渲染优化 | 双缓冲 + 脏区域标记 | 减少闪烁，60fps限制 |
| 输入处理 | blessed textbox | 统一处理，避免冲突 |
| 流式输出 | 批量更新 + 词缓存 | 流畅显示，支持中断 |
| 生命周期 | ScreenManager | 优雅退出，资源清理 |

## 下一步计划

### Phase 3: 功能完善 (第3周)

1. **Markdown渲染器增强**
   - 标题、列表、代码块
   - 行内代码高亮
   - 表格渲染

2. **协作会话UI统一**
   - 整合 collaboration-session-ui
   - 任务对话界面
   - 多轮对话显示

3. **文件树组件增强**
   - 展开/折叠
   - 文件图标
   - 搜索过滤

### Phase 4: 测试与优化 (第4周)

1. 响应式适配测试
2. 性能压力测试
3. Bug修复
4. 文档完善

## 运行演示

```bash
# 开发模式运行演示
npx tsx src/cli/tui/demo.ts

# 或编译后运行
npm run build
node dist/cli/tui/demo.js
```

## 技术栈

- **blessed**: 终端UI库
- **blessed-contrib**: 扩展组件（可选）
- **TypeScript**: 类型安全
- **Node.js ≥ 20**: 运行环境

---

**创建时间**: 2026-04-05  
**完成进度**: Phase 1 ✅ | Phase 2 ✅ | Phase 3 ⏳ | Phase 4 ⏳