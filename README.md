# SecureBot

安全可控的多 Agent AI 助手，使用 CLI 交互。

## 特性

- **多 Agent 隔离**: 不同用途使用独立 Agent
- **CLI 交互**: 纯命令行，@ 方式切换 Agent
- **本地模型**: 对接 Ollama，数据不出本机
- **安全隔离**: 默认禁用网络工具，防止数据泄露
- **会话持久化**: 自动保存对话历史，重启后恢复
- **流式输出**: 实时显示模型回复
- **RAG 支持**: 本地知识库检索增强

## 安装

```bash
# 克隆仓库
git clone <repo-url>
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
# 直接运行
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

> 你好，帮我分析一下当前项目结构
[dev]: 我来查看一下...
```

### 切换 Agent

```
> @support 用户反馈登录失败，怎么处理？
[support]: 登录失败可能有以下原因...

> @admin 检查系统状态
[admin]: ...
```

### Agent 列表

| Agent | 用途 | 权限 |
|-------|------|------|
| dev | 开发助手 | 文件读写、命令执行 |
| support | 客服助手 | 仅对话 |
| admin | 管理助手 | 完全权限 |
| finance | 财务助手 | 文件只读 |

### CLI 命令

```bash
# 查看帮助
> /help

# 切换 Agent
> @dev <消息>
> /agent dev

# 列出 Agent
> /agents

# 显示当前模型
> /model

# 显示对话历史
> /history

# 清除当前会话历史
> /reset

# 手动保存所有会话
> /save

# 列出已保存的会话
> /sessions

# 退出
> /exit
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
  agents: [
    {
      id: 'dev',
      name: '开发助手',
      workspace: '~/.securebot/workspaces/dev',
      tools: { profile: 'coding' },
    },
    // ...
  ],
}
```

### 会话持久化

会话自动保存在 `~/.securebot/sessions/` 目录：

- 每次对话后自动保存
- 重启 SecureBot 自动恢复历史
- 最多保留 100 条历史消息
- 30 天未访问的会话自动清理

可用命令：
- `/save` - 手动保存所有会话
- `/sessions` - 查看已保存的会话
- `/reset` - 清除当前会话历史

## 安全

- **默认禁用网络**: web_search/web_fetch/browser 全部禁用
- **文件隔离**: 每个 Agent 独立 workspace
- **命令白名单**: exec 只能执行预定义命令

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