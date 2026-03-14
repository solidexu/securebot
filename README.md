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

### 1. 确保 Ollama 运行

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
  workspaceBaseDir: './agents',  // Agent 工作空间根目录
  agents: [
    {
      id: 'dev',
      name: '开发助手',
      workspace: 'dev',  // 相对路径，实际为 ./agents/dev
      tools: { profile: 'coding' },
    },
    // ...
  ],
}
```

### 目录结构

```
securebot/
├── agents/              # Agent 工作空间（已在 .gitignore）
│   ├── dev/            # 开发助手工作空间
│   ├── support/        # 客服助手工作空间
│   ├── admin/          # 管理助手工作空间
│   └── finance/        # 财务助手工作空间
├── src/
├── dist/
└── ...
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

## License

MIT