# SecureBot

安全可控的多 Agent AI 助手，使用 CLI 交互。

## 特性

- **多 Agent 隔离**: 不同用途使用独立 Agent，工作空间隔离
- **交互式创建 Agent**: 问答式引导，零配置创建新 Agent
- **CLI 交互**: 纯命令行，@ 方式切换 Agent
- **本地模型**: 对接 Ollama，数据不出本机
- **安全隔离**: 默认禁用网络工具，防止数据泄露
- **会话持久化**: 自动保存对话历史，重启后恢复
- **三层记忆**: 自动记录用户请求、任务完成、工具调用
- **流式输出**: 实时显示模型回复
- **RAG 支持**: 本地知识库检索增强
- **审计日志**: 所有工具调用可追溯

> 📑 **[查看完整的安全架构文档 →](assets/SECURITY.md)** - 了解 SecureBot 如何实现公司级数据安全，以及与 OpenClaw 的安全对比。

## 安装

```bash
# 克隆仓库
git clone https://gitee.com/nicolasxu93/securebot.git
cd securebot

# 安装依赖
npm install

# 构建并全局安装
npm run build
npm link
```

安装后即可使用 `securebot` 命令。

## 快速开始

### 1. 运行配置向导（首次使用）

```bash
securebot init
```

配置向导会引导你：
- 配置 Ollama 连接
- 选择默认模型
- 添加自定义 Agent
- 设置 SecureBot 根目录

### 2. 确保 Ollama 运行

```bash
# 启动 Ollama
ollama serve

# 下载模型（如果还没有）
ollama pull qwen3.5:35b-a3b
```

### 3. 启动对话

```bash
securebot chat
```

## 目录结构

SecureBot 使用统一的根目录管理所有数据：

```
{rootDir}/                 # 默认 ~/.securebot/（可自定义）
├── config.json            # 配置文件
├── agents/                # Agent 工作空间
│   ├── dev/               # 开发助手工作空间
│   └── py/                # Python 助手工作空间
├── memory/                # 记忆数据（三层架构）
│   ├── daily/             # Layer 1: 每日工作记忆
│   ├── profiles/          # Layer 2: 用户/Agent 档案
│   ├── events/            # Layer 2: 重要事件记录
│   └── summaries/         # Layer 2: 记忆摘要
├── knowledges/            # RAG 知识库
│   ├── dev/               # 开发助手知识库
│   └── py/                # Python 助手知识库
├── skills/                # 技能定义
│   ├── public/            # 公共技能（所有 Agent 可用）
│   └── private/           # 个人技能（仅特定 Agent）
├── sessions/              # 会话持久化
└── audit/                 # 审计日志
```

### 自定义根目录

在 `config.json` 中设置：

```json
{
  "rootDir": "/data/mybot",
  "model": {
    "model": "qwen3.5:35b-a3b",
    "baseUrl": "http://localhost:11434"
  }
}
```

或通过环境变量：

```bash
export SECUREBOT_CONFIG_DIR=/data/securebot
securebot chat
```

## 使用

### 基本对话

```
[开发助手] > 你好，帮我分析一下当前项目结构

思考中... 
[开发助手]
我来查看一下项目结构...
```

### 切换 Agent

使用 `@agent名` 快速切换：

```
[开发助手] > @python_dev 帮我实现 DeepSORT 算法

┌─────────────────────────────────────┐
│  🤖 正在与 Py哥 对话                  │
└─────────────────────────────────────┘

[Py哥]: 我来帮你实现 DeepSORT...
```

### 查看记忆

```
[开发助手] > /memory stats

📊 记忆系统状态

总条目: 15
- conversation: 5 条
- task: 10 条

最近记录:
- 用户请求: 帮我实现 DeepSORT 算法
- 完成任务: 帮我实现 DeepSORT 算法
- 写入文件: gd_project/src/deep_sort/tracker.py
...
```

### 常用命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助 |
| `/agent` | 切换 Agent |
| `/agents` | 列出所有 Agent |
| `/skills` | 查看当前 Agent 技能 |
| `/memory [stats\|search]` | 记忆系统 |
| `/checkpoint [list\|save]` | 检查点管理 |
| `/perf` | 性能监控 |
| `/exit` | 退出 |

## CLI 命令

```bash
securebot chat              # 启动对话
securebot init              # 配置向导
securebot config            # 查看当前配置

securebot agent list        # 列出 Agent
securebot agent create      # 创建 Agent
securebot agent show <id>   # 查看 Agent 详情

securebot skill list        # 列出技能
securebot skill create      # 创建技能
securebot skill assign      # 分配技能给 Agent
```

## 创建新 Agent

**交互式创建**（推荐）：

```bash
securebot agent create
```

按提示输入：
1. Agent ID（如 `python_dev`）
2. Agent 名称（如 `Py哥`）
3. 权限预设（minimal/coding/messaging/full）

## 技能系统

### 内置公共技能

首次运行 `securebot chat` 时自动初始化：

| 技能 | 说明 |
|------|------|
| code-review | 代码审查 |
| translator | 多语言翻译 |
| api-designer | RESTful API 设计 |
| debugger | 调试专家 |
| doc-writer | 技术文档撰写 |

### 查看技能

```bash
securebot skill list
```

或在对话中：

```
[开发助手] > /skills
```

### 创建技能

```bash
securebot skill create
```

按提示输入：
1. 技能 ID
2. 技能描述
3. 提示词模板
4. 关联工具

### 分配技能

```bash
# 分配给单个 Agent
securebot skill assign -s code-review -a dev

# 创建公共技能（所有 Agent 可用）
securebot skill create --public
```

## 安全特性

### 敏感操作确认

五级敏感度，高风险操作需确认：

| 级别 | 示例 |
|------|------|
| safe | read（普通文件） |
| low | rag_index |
| medium | write, edit |
| high | exec, 敏感文件 |
| critical | 删除操作 |

### 授权记忆

选择"总是允许"后可记住授权：

- `y` = 本次确认
- `a` = 总是允许此工具
- `p` = 总是允许此目录

### 审计日志

所有工具调用自动记录：

```bash
securebot audit list          # 查看日志
securebot audit search <关键词> # 搜索日志
```

## 复杂任务规划

检测到复杂任务时自动规划：

```
[开发助手] > 帮我开发一个混合A*算法

🔍 检测到复杂任务，系统将先制定计划...

📋 任务计划已生成:
┌─────────────────────────────────────┐
│ 📋 执行计划                         │
├─────────────────────────────────────┤
│ ⬜ 创建项目目录结构                 │
│ ⬜ 实现 A* 核心算法                 │
│ ⬜ 添加运动学约束                   │
│ ⬜ 编写测试用例                     │
└─────────────────────────────────────┘

✓ 计划已生成，开始执行...
```

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
```

## 配置文件

配置文件位于 `~/.securebot/config.json`：

```json
{
  "rootDir": "~/.securebot",
  "model": {
    "model": "qwen3.5:35b-a3b",
    "baseUrl": "http://localhost:11434"
  },
  "defaultAgent": "dev",
  "tools": {
    "profile": "coding",
    "exec": {
      "security": "allowlist",
      "ask": "on-miss"
    }
  },
  "agents": [
    {
      "id": "dev",
      "name": "开发助手",
      "default": true,
      "workspace": "dev"
    }
  ]
}
```

## RAG 知识库

SecureBot 支持三阶段 RAG 检索增强，让 Agent 可以搜索你的文档库。

### 自动配置（推荐）

创建 Agent 时，系统会自动检测 Ollama 是否安装了嵌入模型。如果检测到，会自动为 Agent 创建独立的知识库。

```bash
# 1. 先安装嵌入模型
ollama pull all-minilm

# 2. 创建 Agent
securebot agent create

# 按提示输入信息后，系统会显示：
# ✓ 检测到嵌入模型: all-minilm
# ✓ 已自动配置知识库: ~/.securebot/knowledges/my-agent

# 3. 添加文档到知识库
cp *.md ~/.securebot/knowledges/my-agent/

# 4. 启动对话，Agent 会自动索引知识库
securebot chat
```

### 目录结构

```
{rootDir}/
├── agents/              # Agent 工作空间
│   ├── dev/
│   └── py/
├── knowledges/          # RAG 知识库（自动创建）
│   ├── dev/
│   └── py/              # 每个 Agent 独立的知识库目录
└── config.json
```

### 三阶段流程

```
用户查询 → 查询扩展 → 向量检索 → 重排序 → 返回结果
```

### 手动配置 RAG

也可以在 `config.json` 中手动配置：

```json
{
  "agents": [{
    "id": "dev",
    "name": "开发助手",
    "workspace": "dev",
    "rag": {
      "enabled": true,
      "knowledgeDirs": ["~/.securebot/knowledges/dev"],
      "embeddingModel": "all-minilm",
      "rerankModel": "qwen3-reranker",
      "enableRerank": true
    }
  }]
}
```

### 推荐 CPU 友好模型

| 阶段 | 模型 | 大小 | 安装命令 |
|------|------|------|----------|
| Embedding | `all-minilm` | 46MB | `ollama pull all-minilm` |
| Embedding | `nomic-embed-text` | 274MB | `ollama pull nomic-embed-text` |
| Reranking | `qwen3-reranker` | 600MB | 导入 GGUF |

### RAG 工具

启用 RAG 后，Agent 可使用以下工具：

| 工具 | 功能 |
|------|------|
| `rag_search <query>` | 搜索知识库 |
| `rag_index <path>` | 添加文档到知识库 |
| `rag_remember <content>` | 记住重要知识（自动存入 RAG） |
| `rag_status` | 查看知识库状态 |

### 记忆 → RAG 自动同步

重要的记忆会自动同步到 RAG 知识库：

- **触发条件**：记忆条目重要性 >= 4（满分 5）
- **同步内容**：对话记忆、任务完成、学习到的知识
- **可检索**：后续可通过 `rag_search` 检索到

```bash
# 示例：Agent 自动记住重要信息
用户: 记住我喜欢用深色主题
Agent: 好的，我已经记住了。（importance=5，自动同步到 RAG）

# 后续可以检索
用户: 我喜欢什么主题？
Agent: [rag_search "主题偏好"] 根据记录，您喜欢用深色主题。
```

**手动存储**：
```
用户: 帮我记住项目路径是 /home/user/my-project
Agent: [rag_remember "项目路径: /home/user/my-project"] 已记住。
```

### 强制 CPU 运行

```bash
# 环境变量
export OLLAMA_NO_GPU=1

# 或启动时
OLLAMA_NO_GPU=1 ollama serve
```

## 常见问题

### 1. Ollama 连接失败

确保 Ollama 正在运行：

```bash
ollama serve
```

### 2. 记忆为空

记忆在对话过程中自动记录，确保：
- 完成 `securebot init` 配置
- 使用 `securebot chat` 启动（不是 `npm run dev`）

### 3. 技能未显示

首次运行 `securebot chat` 会自动初始化内置技能。

### 4. 切换根目录

修改 `config.json` 中的 `rootDir`，或设置环境变量 `SECUREBOT_CONFIG_DIR`。

### 5. RAG 模型未安装

使用 `/init-rag` 查看初始化指引，或直接安装：

```bash
ollama pull all-minilm
```

## License

本软件采用 **CC BY-NC 4.0** 许可协议。

- [LICENSE.md](LICENSE.md) - English Version
- [LICENSE_CN.md](LICENSE_CN.md) - 中文版

**摘要**：可自由共享和演绎，但须署名且不得用于商业目的。

---

## 支持作者

如果这个项目对你有帮助，欢迎请作者喝杯咖啡：

![微信收款码](assets/wechat-pay.jpg)