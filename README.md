# SecureBot

**[English](README_EN.md)** | 中文

安全可控的多 Agent AI 助手，使用 CLI 交互。

## 核心特性

- **多 Agent 隔离** - 不同用途使用独立 Agent，工作空间完全隔离
- **三层记忆架构** - 工作记忆 + 结构化记忆 + RAG 向量检索
- **智能技能系统** - 公共/个人技能，关键词 + 语义双重唤醒
- **本地模型优先** - 对接 Ollama，数据不出本机
- **安全确认机制** - 敏感操作分级确认，防止数据泄露
- **RAG 知识库** - 三阶段检索增强，支持文档问答

> 📑 **[查看完整的安全架构文档 →](assets/SECURITY.md)** - 了解 SecureBot 如何实现公司级数据安全。

## 快速上手

### 安装

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

### 配置

```bash
# 启动 Ollama
ollama serve

# 下载模型
ollama pull qwen3.5:35b-a3b

# 运行配置向导
securebot init
```

> 💡 **GPU 用户推荐**：RTX 3090+ 用户可用 `mdq100/qwen3.5-flash:35b-code` 获得更快响应。

### 启动对话

```bash
securebot chat
```

---

## 最佳实践示例

### 场景：创建一个 Python 开发助手

**Step 1: 创建 Agent**

```bash
securebot agent create
```

按提示输入：
```
Agent ID: py_dev
Agent 名称: Py哥
权限预设: coding
```

**Step 2: 添加知识库（可选）**

```bash
# 安装嵌入模型
ollama pull all-minilm

# 复制项目文档到知识库
cp ~/my-project/docs/*.md ~/.securebot/knowledges/py_dev/
```

**Step 3: 开始使用**

```bash
securebot chat

[Py哥] > 帮我分析这个项目的架构

# 切换到其他 Agent
[Py哥] > @dev 帮我写一个 React 组件

# 让 Agent 记住重要信息
[Py哥] > 记住项目路径是 /home/user/my-project
[Py哥] 好的，已记住。（importance=5，自动同步到 RAG）

# 使用技能
[Py哥] > 帮我 review 一下这段代码
[Py哥] [技能: code-review] 我来帮你审查代码...
```

**Step 4: 创建个人技能**

```
[Py哥] > /skill create

技能 ID: fastapi-helper
技能名称: FastAPI 助手
描述: 帮助编写 FastAPI 接口代码
关键词: fastapi, api, 接口, endpoint

# 之后提到相关关键词会自动唤醒
[Py哥] > 帮我写一个 fastapi 接口
[Py哥] [技能: fastapi-helper] 检测到 FastAPI 相关请求...
```

---

## 三层记忆架构

SecureBot 的记忆系统分为三层，确保信息既不丢失，又不会让上下文膨胀：

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: 向量记忆 (RAG)                                     │
│  - 历史文档、长期知识                                         │
│  - 按需检索，不占用上下文                                     │
│  - 重要性 >= 4 的记忆自动同步                                 │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: 结构化记忆                                         │
│  ├── profiles/    用户/Agent 档案（偏好、统计）              │
│  ├── events/      重要事件记录                               │
│  └── summaries/   记忆摘要（超过阈值自动压缩）               │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: 工作记忆 (daily/)                                  │
│  - 最近 3 天的对话、任务                                      │
│  - 自动加载，按重要性排序                                     │
│  - 自动衰减，低重要性记忆逐渐遗忘                             │
└─────────────────────────────────────────────────────────────┘
```

### 记忆类型

| 类型 | 说明 | 自动触发 |
|------|------|----------|
| `conversation` | 对话记录 | 每次对话 |
| `task` | 任务完成 | 工具调用成功 |
| `knowledge` | 知识点 | 用户明确要求记住 |
| `event` | 重要事件 | 创建/删除文件等 |
| `preference` | 用户偏好 | "我喜欢..." |

### 智能重要性评估

系统自动评估记忆重要性（1-5 分）：

- **基础分**: 3 分
- **+2 分**: "记住"、"重要"、"关键" 等关键词
- **+1 分**: 包含路径、配置、项目相关
- **+1 分**: 内容长度 > 500 字符

**重要性 >= 4 的记忆会自动同步到 RAG**，实现长期记忆。

### 记忆命令

```
/memory stats       # 查看记忆统计
/memory search 关键词  # 搜索记忆
/memory trigger     # 手动触发摘要压缩
```

---

## 技能系统

### 公共技能 vs 个人技能

```
~/.securebot/
├── skills/
│   └── public/              # 公共技能（所有 Agent 可用）
│       ├── code-review.json
│       ├── translator.json
│       └── ...
└── agents/
    └── {agentId}/
        └── skills/          # 个人技能（仅此 Agent 可用）
            ├── fastapi-helper.json
            └── my-custom.json
```

### 内置公共技能

| 技能 | 关键词 | 说明 |
|------|--------|------|
| code-review | 审查, review, 检查代码 | 专业代码审查 |
| translator | 翻译, translate | 多语言翻译 |
| api-designer | API, 接口设计, RESTful | RESTful API 设计 |
| debugger | 调试, debug, 报错, bug | 问题定位与分析 |
| doc-writer | 文档, readme, 注释 | 技术文档撰写 |

### 智能唤醒机制

技能支持两种唤醒方式：

1. **关键词匹配** - 快速匹配，优先级高
2. **语义匹配** - 使用 RAG embedding，理解意图

```
用户: 帮我看看这段代码有什么问题
系统: 检测到关键词 "问题" → 唤醒 debugger 技能

用户: 这个接口响应太慢了，怎么优化
系统: 语义匹配 → 唤醒 api-designer 技能
```

### 创建技能

**CLI 方式：**

```bash
securebot skill create
```

**对话方式：**

```
[开发助手] > /skill create
技能 ID: my-helper
技能名称: 我的助手
描述: 帮助处理日常工作
关键词: 帮忙, 协助
```

**直接编辑 JSON：**

```json
// ~/.securebot/agents/dev/skills/my-helper.json
{
  "id": "my-helper",
  "name": "我的助手",
  "description": "帮助处理日常工作",
  "keywords": ["帮忙", "协助"],
  "systemPrompt": "你是一位专业的助手...",
  "tools": ["read", "write"],
  "isPublic": false,
  "agentId": "dev"
}
```

---

## RAG 知识库

### 三阶段检索流程

```
用户查询
    ↓
┌─────────────────┐
│  1. 查询扩展     │  同义词扩展、关键词提取
└────────┬────────┘
         ↓
┌─────────────────┐
│  2. 向量检索     │  Embedding + 相似度搜索
└────────┬────────┘
         ↓
┌─────────────────┐
│  3. 重排序       │  可选 Rerank 模型精排
└────────┬────────┘
         ↓
返回最相关文档
```

### 配置 RAG

```bash
# 安装嵌入模型
ollama pull all-minilm

# 创建 Agent 时会自动检测并配置
securebot agent create
```

或在 `config.json` 中手动配置：

```json
{
  "agents": [{
    "id": "dev",
    "rag": {
      "enabled": true,
      "knowledgeDirs": ["~/.securebot/knowledges/dev"],
      "embeddingModel": "all-minilm",
      "enableRerank": false
    }
  }]
}
```

### RAG 工具

| 工具 | 说明 |
|------|------|
| `rag_search <query>` | 搜索知识库 |
| `rag_index <path>` | 索引文档目录 |
| `rag_remember <content>` | 直接存入知识库 |

---

## 安全机制

### 操作分级确认

| 敏感度 | 操作示例 | 默认行为 |
|--------|----------|----------|
| `safe` | read 普通文件 | 自动执行 |
| `low` | rag_index | 自动执行 |
| `medium` | write, edit | 首次确认 |
| `high` | exec, 敏感文件 | 每次确认 |
| `critical` | 删除操作 | 每次确认 + 二次确认 |

### 授权记忆

确认时选择：
- `y` - 本次允许
- `a` - 总是允许此工具
- `p` - 总是允许此目录

授权记录保存在 `~/.securebot/config.json` 的 `tools.allowlist` 中。

### 审计日志

所有工具调用自动记录：

```bash
securebot audit list        # 查看日志
securebot audit search rm   # 搜索删除操作
```

---

## CLI 命令参考

```bash
# 主命令
securebot chat              # 启动对话
securebot init              # 配置向导
securebot config            # 查看配置

# Agent 管理
securebot agent list        # 列出所有 Agent
securebot agent create      # 交互式创建 Agent
securebot agent show <id>   # 查看 Agent 详情

# 技能管理
securebot skill list        # 列出技能
securebot skill create      # 创建技能
securebot skill assign      # 分配技能

# 审计
securebot audit list        # 查看审计日志
securebot audit search <kw> # 搜索日志
```

### 对话内命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助 |
| `/agent [id]` | 切换/列出 Agent |
| `/skills` | 查看当前技能 |
| `/skill create` | 创建技能 |
| `/memory stats\|search` | 记忆管理 |
| `/checkpoint` | 检查点管理 |
| `/perf` | 性能监控 |
| `/exit` | 退出 |

---

## 目录结构

```
~/.securebot/
├── config.json              # 全局配置
├── agents/                  # Agent 工作空间
│   └── dev/
│       ├── workspace/       # 工作目录
│       └── skills/          # 个人技能
├── memory/                  # 记忆系统
│   ├── daily/               # 每日工作记忆
│   ├── profiles/            # 用户/Agent 档案
│   ├── events/              # 事件日志
│   └── summaries/           # 记忆摘要
├── knowledges/              # RAG 知识库
│   └── dev/                 # 按 Agent 隔离
├── skills/                  # 公共技能
│   └── public/
├── sessions/                # 会话持久化
└── audit/                   # 审计日志
```

---

## 常见问题

### Ollama 连接失败

```bash
ollama serve  # 确保 Ollama 正在运行
```

### 记忆为空

- 确保使用 `securebot chat` 启动（不是 `npm run dev`）
- 记忆在对话过程中自动记录

### 技能未生效

- 检查关键词是否匹配
- 查看 `/skills` 确认技能已加载
- 公共技能首次运行 `securebot chat` 时自动初始化

### RAG 检索无结果

- 确保已安装嵌入模型：`ollama pull all-minilm`
- 确保知识库目录有文档
- 使用 `rag_index <path>` 手动索引

---

## 开发

```bash
npm run dev        # 开发模式
npm run build      # 构建
npm test           # 运行测试
npm run typecheck  # 类型检查
```

---

## License

本软件采用 **CC BY-NC 4.0** 许可协议。

- [LICENSE.md](LICENSE.md) - English Version
- [LICENSE_CN.md](LICENSE_CN.md) - 中文版

**摘要**：可自由共享和演绎，但须署名且不得用于商业目的。