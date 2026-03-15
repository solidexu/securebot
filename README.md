# SecureBot

安全可控的多 Agent AI 助手，使用 CLI 交互。

## 特性

- **多 Agent 隔离**: 不同用途使用独立 Agent
- **交互式创建 Agent**: 问答式引导，零配置创建新 Agent
- **CLI 交互**: 纯命令行，@ 方式切换 Agent
- **本地模型**: 对接 Ollama，数据不出本机
- **安全隔离**: 默认禁用网络工具，防止数据泄露
- **会话持久化**: 自动保存对话历史，重启后恢复
- **流式输出**: 实时显示模型回复
- **RAG 支持**: 本地知识库检索增强
- **审计日志**: 所有工具调用可追溯

## 安装

```bash
# 克隆仓库
git clone https://gitee.com/nicolasxu93/securebot.git
cd securebot

# 安装依赖
npm install

# 构建
npm run build

# 全局安装（可选）
npm link
```

## 快速开始

### 1. 运行配置向导（首次使用）

```bash
npm run dev -- init

# 或
securebot init
```

配置向导会引导你：
- 配置 Ollama 连接
- 选择默认模型
- 添加自定义 Agent
- 设置数据目录

### 2. 确保 Ollama 运行

```bash
# 启动 Ollama
ollama serve

# 下载模型（如果还没有）
ollama pull qwen3.5-35b-a3b
```

### 2. 启动 SecureBot

```bash
# 普通模式
npm run dev

# TUI 分屏模式（左侧聊天，右侧文件浏览器）
npm run dev -- --tui

# 或构建后运行
npm run build
npm start

# 或全局安装后
securebot chat           # 普通模式
securebot chat --tui     # TUI 分屏模式
```

## 使用

### TUI 分屏界面

使用 `--tui` 参数启动分屏界面：

```
┌─────────────────────────────┬─────────────────┐
│ 💬 聊天                      │ 📂 工作区        │
│                             │ 📁 agents       │
│ 你: 帮我分析项目结构          │   📁 dev        │
│                             │   📁 support    │
│ [开发助手]                   │ 📁 src          │
│ 我来查看一下...              │   📄 index.ts   │
│                             │   📄 types.ts   │
├─────────────────────────────┼─────────────────┤
│ 输入消息 (Enter 发送)        │ 👁 预览          │
│                             │ 文件内容...      │
├─────────────────────────────┼─────────────────┤
│ Agent: 开发助手 模型: qwen   │ 状态             │
│ Tab:切换 F2:Agent F5:刷新    │ F2:切换Agent     │
└─────────────────────────────┴─────────────────┘
```

**快捷键**:
- `Tab` - 切换焦点（输入框/文件树）
- `F2` - 切换 Agent
- `F5` - 刷新文件树
- `Q/Esc` - 退出

### 基本对话

```
SecureBot v0.1.0 | Agent: dev | Model: qwen3.5-35b-a3b

[开发助手] > 你好，帮我分析一下当前项目结构
思考中...
[开发助手]
我来查看一下...
```

### 切换 Agent

使用 `@agent名` 快速切换：

```
[开发助手] > @support 用户反馈登录失败，怎么处理？

┌─────────────────────────────────────┐
│  🤖 正在与 客服助手 对话              │
└─────────────────────────────────────┘

[客服助手]: 登录失败可能有以下原因...
```

### 创建新 Agent

**交互式创建**（推荐）：

```bash
# 在命令行中运行
securebot agent create

# 或在聊天中退出后运行
> /exit
$ securebot agent create

🤖 SecureBot Agent 创建向导

? Agent ID（仅字母、数字、下划线） my-agent
? Agent 名称 我的助手
? 工具权限
  ❯ 最小权限 - 仅基础对话，无文件/命令访问权限
    开发助手 - 可读写文件、执行命令（白名单）
    对话助手 - 纯对话，无文件/命令访问
    完全权限 - 所有权限（除网络）
? 设为默认 Agent？ No

━━━ Agent 配置预览 ━━━
  ID:        my-agent
  名称:      我的助手
  权限:      最小权限
  工作空间:  ./agents/my-agent
━━━━━━━━━━━━━━━━━━━━━

? 确认创建？ Yes

✓ Agent 创建成功！

使用方式：
  @my-agent <消息>
  /agent my-agent
```

**手动配置**：

编辑 `~/.securebot/config.json`：

```json5
{
  agents: [
    // 添加新 Agent
    {
      id: 'translator',
      name: '翻译助手',
      workspace: 'translator',
      tools: {
        profile: 'messaging',  // 仅对话权限
        deny: ['group:web'],   // 禁用网络
      },
    },
  ],
}
```

然后在聊天中使用 `/reload` 热重载配置。

### 管理 Agent

```bash
# 列出所有 Agent
securebot agent list

# 交互式删除 Agent
securebot agent delete
```

### Agent 列表

| Agent | 用途 | 权限 |
|-------|------|------|
| dev | 开发助手 | 文件读写、命令执行 |
| support | 客服助手 | 仅对话 |
| admin | 管理助手 | 完全权限 |
| finance | 财务助手 | 文件只读 |

## 技能系统

SecureBot 支持技能系统，可以为 Agent 添加专业技能。

### 技能类型

- **公共技能**: 所有 Agent 可用
- **个人技能**: 仅特定 Agent 可用

### 内置公共技能

| 技能 | 说明 |
|------|------|
| code-review | 代码审查，发现代码问题和改进建议 |
| translator | 多语言翻译，支持中英日韩 |
| api-designer | RESTful API 设计 |
| debugger | 调试专家，帮助定位代码问题 |
| doc-writer | 技术文档撰写 |

### 管理技能

```bash
# 列出所有技能
securebot skill list

# 列出指定 Agent 的技能
securebot skill list -a dev

# 创建新技能
securebot skill create

# 为 Agent 创建个人技能
securebot skill create -a dev

# 删除技能
securebot skill delete <skill-id>

# 将技能分配给 Agent
securebot skill assign <skill-id> <agent-id>

# 从 Agent 移除技能
securebot skill unassign <skill-id> <agent-id>
```

### 查看技能

在聊天中使用 `/skills` 命令查看当前 Agent 的技能：

```
/skills

📚 开发助手的技能

公共技能:
  code-review - 代码审查 ✓
  translator - 翻译助手
  debugger - 调试专家 ✓

个人技能:
  my-workflow - 我的工作流

管理技能: securebot skill list/create/assign
```

### CLI 命令

在聊天中可使用的命令：

```bash
/help              # 显示帮助
/exit, /quit, /q   # 退出

# Agent 管理
/agent [name]      # 显示/切换当前 Agent
/agents            # 列出所有 Agent
/skills            # 显示当前 Agent 的技能

# 模型
/model [name]      # 显示/切换模型
/models            # 列出可用模型

# 会话
/history           # 显示对话历史
/reset             # 清除当前会话历史
/save              # 手动保存会话
/sessions          # 列出已保存会话
/export [format]   # 导出会话 (markdown/json/txt)

# 配置
/reload            # 热重载配置文件

# 审计
/audit             # 查看审计日志
/audit stats       # 审计统计
/audit on/off      # 开启/关闭审计

# 其他
/confirm [on/off/always]  # 敏感操作确认设置
/clear             # 清屏
```

## 配置

配置文件位于 `~/.securebot/config.json`：

```json5
{
  model: {
    model: 'qwen3.5-35b-a3b',
    baseUrl: 'http://localhost:11434',
  },
  defaultAgent: 'dev',
  dataDir: '~/.securebot',  // 可选，自定义数据目录
  agents: [
    {
      id: 'dev',
      name: '开发助手',
      workspace: 'dev',  // 相对于 <dataDir>/agents
      tools: { profile: 'coding' },
    },
    // ...
  ],
}
```

### 数据目录结构

默认数据目录为 `~/.securebot`，可通过 `dataDir` 自定义：

```
~/.securebot/
├── agents/              # Agent 工作空间
│   ├── dev/            # 开发助手
│   ├── support/        # 客服助手
│   └── ...
├── memory/             # 记忆数据
│   ├── daily/          # 每日记忆
│   ├── profiles/       # 用户/Agent 档案
│   └── events/         # 事件日志
├── skills/             # 技能数据
│   ├── public/         # 公共技能
│   └── private/        # 个人技能
├── sessions/           # 会话持久化
└── audit/              # 审计日志
```

### 自定义数据目录

**方式一：配置文件**

在 `~/.securebot/config.json` 中设置 `dataDir`：

```json5
{
  // 自定义数据目录
  dataDir: '/data/securebot',
  
  model: {
    model: 'qwen3.5-35b-a3b',
    baseUrl: 'http://localhost:11434',
  },
  defaultAgent: 'dev',
  agents: [
    {
      id: 'dev',
      name: '开发助手',
      workspace: 'dev',  // 实际路径: /data/securebot/agents/dev
      tools: { profile: 'coding' },
    },
  ],
}
```

**方式二：环境变量**

```bash
# 设置配置目录（包含 config.json）
export SECUREBOT_CONFIG_DIR=/custom/securebot

# 设置配置文件路径
export SECUREBOT_CONFIG_PATH=/custom/securebot/config.json
```

**各目录说明**:

| 目录 | 用途 | 内容 |
|------|------|------|
| `agents/` | Agent 工作空间 | 每个 Agent 独立的文件操作目录 |
| `memory/daily/` | 每日记忆 | 按日期存储的对话记录 |
| `memory/profiles/` | 档案 | 用户偏好、Agent 统计 |
| `memory/events/` | 事件日志 | 重要操作记录 |
| `skills/public/` | 公共技能 | 所有 Agent 可用的技能 |
| `skills/private/` | 个人技能 | 特定 Agent 的私有技能 |
| `sessions/` | 会话存储 | 对话历史持久化 |
| `audit/` | 审计日志 | 所有工具调用记录 |
```

### 工具权限预设

| 预设 | 权限 |
|------|------|
| `minimal` | 仅 session_status |
| `coding` | read, write, edit, exec |
| `messaging` | 仅 session_status |
| `full` | 无限制 |

### 会话持久化

会话自动保存在 `~/.securebot/sessions/` 目录：

- 每次对话后自动保存
- 重启 SecureBot 自动恢复历史
- 最多保留 100 条历史消息
- 30 天未访问的会话自动清理

### 审计日志

所有工具调用记录在 `~/.securebot/audit/audit.log`：

```bash
# 查看最近审计记录
/audit

# 查看统计
/audit stats
```

## 记忆系统

SecureBot 实现了三层记忆架构，让 Agent 能够记住重要信息：

### 架构说明

| Layer | 位置 | 内容 | 加载方式 |
|-------|------|------|---------|
| Layer 1 | `~/.securebot/memory/daily/` | 每日笔记 | 自动加载最近 3 天 |
| Layer 2 | `~/.securebot/memory/profiles/` | 用户/Agent 档案 | 自动加载 |
| Layer 3 | RAG 向量库 | 历史知识 | 按需检索 |

### 使用记忆工具

在对话中，Agent 可以使用记忆工具：

```
> 请记住我的项目路径是 /home/user/myproject
[开发助手] 我已记住这个信息。

> 我之前说的项目路径是什么？
[开发助手] 根据我的记忆，您的项目路径是 /home/user/myproject。
```

### 记忆命令

```bash
/memory              # 查看工作记忆摘要
/memory stats        # 记忆系统统计
/memory search 项目  # 搜索记忆
```

### 记忆工具列表

| 工具 | 说明 |
|------|------|
| `remember` | 存储重要信息到记忆 |
| `recall` | 搜索记忆中存储的信息 |
| `set_user_info` | 设置用户关键信息 |
| `get_user_info` | 获取用户信息 |
| `memory_stats` | 查看记忆系统状态 |

### 目录结构

```
~/.securebot/memory/
├── daily/           # 每日记忆 (Layer 1)
│   └── 2026-03-14_dev.json
├── profiles/        # 结构化记忆 (Layer 2)
│   ├── user.json
│   └── agent_dev.json
├── events/          # 事件日志
│   └── events.log
└── knowledge/       # 知识库 (Layer 3 扩展)
```

## 任务执行策略

SecureBot 采用智能的任务执行策略，确保复杂任务能够高效完成。

### Plan-first 机制

对于复杂任务，SecureBot 会先制定计划：

```
用户请求
    ↓
[1] 生成 TODO 列表
    ↓
[2] 按计划执行
    ↓
[3] 更新进度
    ↓
[4] 完成并总结
```

### TODO 格式

```
- [ ] 分析需求
- [→] 创建文件结构   ← 进行中
- [x] 初始化项目      ← 已完成
- [!] 需确认方案      ← 阻塞
```

### 终止条件

任务会在以下情况结束：

| 条件 | 阈值 | 说明 |
|------|------|------|
| 无工具调用 | - | 任务自然完成 |
| 连续失败 | 3 次 | 工具执行连续失败 |
| 超时 | 10 分钟 | 单任务执行时间上限 |
| 循环检测 | 启用 | 相同调用重复执行 |
| 最大轮数 | 100 | 安全兜底机制 |

### 配置项

可在 `~/.securebot/config.json` 中自定义：

```json5
{
  taskControl: {
    maxTimeoutMs: 600000,        // 最大执行时间 (毫秒)
    maxConsecutiveFailures: 3,   // 连续失败次数上限
    loopDetection: true,         // 循环检测
    maxRounds: 100,              // 最大轮数
  },
}
```

## 安全

- **默认禁用网络**: web_search/web_fetch/browser 全部禁用
- **文件隔离**: 每个 Agent 独立 workspace
- **命令白名单**: exec 只能执行预定义命令
- **敏感操作确认**: 文件写入、命令执行需用户确认

## 开发

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 测试
npm test

# 类型检查
npm run typecheck

# Lint
npm run lint
```

## ☕ 支持开发者

如果这个项目对您有帮助，欢迎请我喝杯咖啡 ☕

您的支持将帮助我购买 API tokens，让我能够继续开发和维护更多开源工具。

<div align="center">
  <img src="assets/wechat-pay.jpg" width="200" alt="微信赞赏码">
</div>

> 如果您是海外用户，欢迎通过 GitHub Issues 与我联系，我可以提供其他支持方式。

感谢每一位支持者的慷慨！🙏

---

## License

本作品采用 [CC BY-NC 4.0](LICENSE.md) 协议授权。

您可以自由地共享和演绎本作品，但须遵守署名和非商业性使用的条件。

- 中文版协议: [LICENSE_CN.md](LICENSE_CN.md)
- English License: [LICENSE.md](LICENSE.md)

---

## 🚀 开发路线图

### 待办事项

#### P0 - 高优先级
- [x] **任务恢复机制** ✅ 2026-03-15
  - [x] 任务检查点保存 (`saveCheckpoint()`)
  - [x] 断点续执行能力 (`resumeFromCheckpoint()`)
  - [x] 任务状态持久化（跨会话恢复）
  - [x] 自动检查点间隔保存
  - [x] 执行日志与导出报告
  
- [x] **记忆自动摘要** ✅ 2026-03-15
  - [x] 长对话压缩为要点 (`autoSummarize()`)
  - [x] 重要信息自动提取 (`extractKeyInfoFromContent()`)
  - [x] 摘要触发条件（长度/时间阈值）
  - [x] 记忆衰减机制 (`applyDecay()`)
  - [x] 压缩上下文输出 (`getCompressedContext()`)

#### P1 - 中优先级
- [x] **语义任务判断** ✅ 2026-03-15
  - [x] 多轮对话上下文感知 (`analyzeContext()`)
  - [x] 任务依赖图分析 (`buildDependencyGraph()`, `getExecutionOrder()`)
  - [x] 语义相似度匹配 (`extractKeywords()`, `detectTaskType()`)
  - [x] 用户历史行为学习 (`BehaviorLearner`)

- [x] **Agent 协作能力** ✅ 2026-03-15
  - [x] Agent 间消息传递 (`AgentMessageBus`)
  - [x] 任务委派机制 (`DelegationManager`)
  - [x] 共享工作空间 (`SharedWorkspaceManager`)
  - [x] 统一协作入口 (`CollaborationManager`)

- [x] **错误分级处理** ✅ 2026-03-15
  - [x] 错误分类器 (`ErrorClassifier`)
  - [x] 网络错误自动重试 (`RetryExecutor`)
  - [x] 自动降级策略 (`FallbackConfig`)
  - [x] 用户介入点 (`userInterventionHandler`)

#### P2 - 低优先级
- [x] **测试覆盖** ✅ 2026-03-15
  - [x] collaboration.test.ts (27 tests)
  - [x] error-handler.test.ts (28 tests)
  - [x] task-manager.test.ts (29 tests)
  - [x] smart-task.test.ts (36 tests)
  
- [x] **新模块集成** ✅ 2026-03-15
  - [x] 核心 index.ts 统一导出
  - [x] integration.ts 初始化模块
  - [x] executeWithErrorHandling 统一错误处理
  - [x] createTaskContext 任务上下文管理
  - [x] sendCollaborationMessage 协作消息
  - [x] delegateToAgent 任务委派
  - [x] getAppStatus 应用状态

- [x] **CLI 命令扩展** ✅ 2026-03-15
  - [x] `/checkpoint list/save/status/resume` - 检查点管理
  - [x] `/collab status/messages/delegations/delegate` - 协作系统
  - [x] `/errors [clear]` - 错误统计
  - [x] `/behavior` - 用户行为档案
  - [x] `/summary trigger/history` - 记忆摘要
  - [x] `/perf [report|clear]` - 性能监控

- [x] **文档补充** ✅ 2026-03-15
  - [x] `docs/checkpoint.md` - 检查点管理指南
  - [x] `docs/collaboration.md` - Agent 协作指南
  - [x] `docs/error-handling.md` - 错误处理配置

- [x] **性能优化** ✅ 2026-03-15
  - [x] `LazyLoader` - 懒加载器（缓存 + TTL）
  - [x] `ParallelExecutor` - 并行执行器（并发控制）
  - [x] `ChunkProcessor` - 分块处理器（流式处理）
  - [x] `PerformanceMonitor` - 性能监控

- [x] **CLI 增强** ✅ 2026-03-15
  - [x] `MarkdownRenderer` - Markdown 渲染
  - [x] `CodeHighlighter` - 代码高亮
  - [x] `ProgressBar` - 进度条
  - [x] `TableRenderer` - 表格渲染
  - [x] `Spinner` - 加载动画

- [ ] **性能优化**
  - [ ] 记忆懒加载
  - [ ] 工具调用并行化
  - [ ] 大文件分块处理

- [ ] **CLI 体验增强**
  - [ ] 代码高亮渲染
  - [ ] Markdown 渲染
  - [ ] 任务进度可视化
  - [ ] 历史搜索（Ctrl+R）

#### P3 - 未来规划
- [ ] **插件系统**
  - [ ] 第三方工具集成
  - [ ] 自定义工具热加载
  - [ ] Webhook 支持
  - [ ] MCP 协议支持