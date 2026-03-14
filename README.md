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
# 直接运行（开发模式，无需构建）
npm run dev

# 或构建后运行
npm run build
npm start

# 或全局安装后
securebot chat
```

## 使用

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

### CLI 命令

在聊天中可使用的命令：

```bash
/help              # 显示帮助
/exit, /quit, /q   # 退出

# Agent 管理
/agent [name]      # 显示/切换当前 Agent
/agents            # 列出所有 Agent

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