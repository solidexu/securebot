# SecureBot 记忆系统

SecureBot 采用三层记忆架构，支持 Agent 独立存储、智能去重、一键迁移。

## 目录

- [架构概览](#架构概览)
- [快速开始](#快速开始)
- [事实管理](#事实管理)
- [命令参考](#命令参考)
- [数据结构](#数据结构)
- [迁移指南](#迁移指南)
- [高级用法](#高级用法)
- [常见问题](#常见问题)

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 3: 向量记忆 (RAG)                    │
│                                                              │
│  • 历史文档、长期知识                                          │
│  • 按需检索，不占用上下文                                      │
│  • 重要性 >= 4 的记忆自动同步                                  │
├─────────────────────────────────────────────────────────────┤
│                   Layer 2: 结构化记忆                         │
│                                                              │
│  ├── facts.json      Agent 独立事实存储                       │
│  ├── profiles/       用户/Agent 档案                          │
│  └── events/         重要事件记录                              │
├─────────────────────────────────────────────────────────────┤
│                    Layer 1: 工作记忆                          │
│                                                              │
│  • 最近 3 天的对话、任务                                       │
│  • 自动加载，按重要性排序                                      │
│  • 自动衰减，低重要性记忆逐渐遗忘                               │
└─────────────────────────────────────────────────────────────┘
```

### 核心特性

| 特性 | 说明 |
|------|------|
| **Agent 隔离** | 每个 Agent 拥有独立的事实存储 |
| **智能去重** | 自动合并相似内容，LLM 精炼优化 |
| **一键迁移** | 导出/导入 JSON 格式，方便备份和迁移 |
| **置信度管理** | 每条事实带置信度，支持自动衰减 |
| **分类管理** | 5 种分类：偏好、知识、背景、行为、目标 |

---

## 快速开始

### 添加事实

```bash
# 命令行方式
[dev] > /fact add 我精通Python和C++

# LLM 工具调用
[dev] > 记住我的项目路径是 /home/user/my-project
[dev] > 用add_fact记录我的时区是 Asia/Shanghai
```

### 查看事实

```bash
[dev] > /fact list

📋 事实列表 (3 条)

当前 Agent: dev

1. [知识 | 90%] 我是精通 Go 语言的开发者
2. [偏好 | 85%] 我喜欢用VSCode编辑器
3. [知识 | 70%] 精通 C++ 和 Python 开发

操作: /fact add|search|edit|delete|export|import|help
```

### 切换 Agent

```bash
[dev] > @pybro

┌─────────────────────────────────────┐
│  🤖 正在与 Py哥 对话  │
└─────────────────────────────────────┘

[pybro] > /fact list

📋 事实列表 (0 条)

当前 Agent: pybro

暂无事实记录
```

> 每个 Agent 的事实完全独立，切换 Agent 后看到的是该 Agent 自己的事实。

---

## 事实管理

### 分类说明

| 分类 | 英文 | 说明 | 示例 |
|------|------|------|------|
| 偏好 | `preference` | 用户偏好、习惯、风格 | 我喜欢用中文交流 |
| 知识 | `knowledge` | 技能、经验、专业知识 | 我精通 Python |
| 背景 | `context` | 工作环境、项目信息 | 我在字节跳动工作 |
| 行为 | `behavior` | 工作模式、沟通方式 | 我偏好小步提交 |
| 目标 | `goal` | 目标、计划、愿望 | 我计划学习 Rust |

### 置信度指南

| 置信度 | 场景 |
|--------|------|
| **95%** | 明确陈述的事实（我是、我的、我在） |
| **85%** | 表达偏好（我喜欢、我偏好） |
| **80%** | 计划或目标（我计划、我想） |
| **70%** | 从对话推断 |

### 智能推断

系统会根据内容自动推断分类和置信度：

```
输入: 我是Python开发者
推断: category=knowledge, confidence=0.9

输入: 我喜欢用VSCode
推断: category=preference, confidence=0.85

输入: 我计划学习Rust
推断: category=goal, confidence=0.8
```

---

## 命令参考

### /fact list - 列出事实

```bash
/fact list              # 列出所有事实
/fact list knowledge    # 按分类筛选
/fact list preference   # 只看偏好
```

### /fact add - 添加事实

```bash
/fact add 我精通Python
/fact add 我喜欢用中文交流 preference 0.9
```

### /fact search - 搜索事实

```bash
/fact search Python

🔍 搜索结果 (2 条)

关键词: "Python"

1. [知识 | 90%] 我是精通 Go 语言的开发者
2. [知识 | 70%] 精通 C++ 和 Python 开发
```

### /fact edit - 编辑事实

```bash
/fact edit 1 新的内容
/fact edit 3 我精通 Python 和 Go
```

### /fact delete - 删除事实

```bash
/fact delete 1          # 按序号
/fact delete fact_xxx    # 按 ID
```

### /fact clean - 清理重复

```bash
/fact clean             # 默认清理置信度 < 0.7
/fact clean 0.8         # 清理置信度 < 0.8
```

清理时会：
1. 分组相似事实（共享关键词）
2. 调用 LLM 合并
3. 删除低置信度记录

### /fact export - 导出事实

```bash
/fact export                    # 导出到当前目录
/fact export ~/backup/dev.json  # 指定路径
```

导出格式：
```json
{
  "version": "1.0",
  "agentId": "dev",
  "exportedAt": "2026-03-30T12:00:00Z",
  "facts": [
    {
      "id": "fact_xxx",
      "content": "我是精通 Go 语言的开发者",
      "category": "knowledge",
      "confidence": 0.9,
      "source": "manual"
    }
  ]
}
```

### /fact import - 导入事实

```bash
/fact import ~/backup/dev.json

✓ 导入完成
  导入: 5 条
  跳过: 2 条（已存在）
  当前: 7 条
```

---

## 数据结构

### 存储位置

```
~/.securebot/memory/
├── profiles/
│   ├── facts.json      # Agent 独立事实（新格式）
│   └── user.json       # 用户档案（兼容）
├── daily/              # 每日笔记
├── events/             # 事件记录
└── summaries/          # 记忆摘要
```

### facts.json 结构

```json
{
  "version": "1.0",
  "agentFacts": {
    "dev": [
      {
        "id": "fact_xxx",
        "content": "我是精通 Go 语言的开发者",
        "category": "knowledge",
        "confidence": 0.9,
        "createdAt": "2026-03-30T12:00:00Z",
        "source": "manual"
      }
    ],
    "pybro": [
      {
        "id": "fact_yyy",
        "content": "我是精通 Python 的开发者",
        "category": "knowledge",
        "confidence": 0.9,
        "createdAt": "2026-03-30T12:00:00Z",
        "source": "manual"
      }
    ]
  },
  "updatedAt": "2026-03-30T12:00:00Z"
}
```

### MemoryFact 接口

```typescript
interface MemoryFact {
  id: string;           // 唯一标识
  content: string;      // 事实内容
  category: 'preference' | 'knowledge' | 'context' | 'behavior' | 'goal';
  confidence: number;   // 置信度 0-1
  createdAt: string;    // 创建时间
  source?: string;      // 来源（manual/import/工具名）
  tags?: string[];      // 标签
}
```

---

## 迁移指南

### 从旧格式迁移

如果你之前使用 `set_user_info` 工具（keyInfo 格式），可以迁移到新格式：

```bash
npm run migrate:keyinfo
```

迁移脚本会：
1. 读取 `user.json` 中的 `keyInfo`
2. 转换为 `facts` 格式
3. 保存到 `facts.json`
4. 清空 `keyInfo`（保留字段）

### 手动迁移

```bash
# 1. 导出旧格式
cat ~/.securebot/memory/profiles/user.json | jq '.keyInfo'

# 2. 手动添加到新格式
/fact add key: value

# 3. 清理旧数据
# 编辑 user.json，清空 keyInfo 字段
```

---

## 高级用法

### 批量导入

```bash
# 准备 JSON 文件
cat > facts.json << 'EOF'
{
  "version": "1.0",
  "facts": [
    {"content": "我精通 Python", "category": "knowledge", "confidence": 0.9},
    {"content": "我喜欢用 VSCode", "category": "preference", "confidence": 0.85}
  ]
}
EOF

# 导入
/fact import facts.json
```

### Agent 间共享

```bash
# 导出 dev 的事实
@dev
/fact export dev_facts.json

# 导入到 pybro
@pybro
/fact import dev_facts.json
```

### 定期备份

```bash
# 添加到 crontab
0 0 * * * cd ~/.securebot/memory/profiles && cp facts.json facts.json.bak.$(date +\%Y\%m\%d)
```

---

## 常见问题

### Q: 切换 Agent 后事实消失了？

A: 这是正常的。每个 Agent 的事实是独立的。如果你想共享事实，使用导出/导入功能。

### Q: 如何删除所有事实？

```bash
# 方法1: 逐个删除
/fact delete 1
/fact delete 2
...

# 方法2: 直接编辑文件
vim ~/.securebot/memory/profiles/facts.json
```

### Q: 事实太多，LLM 上下文放不下？

A: 系统会自动：
1. 按置信度排序
2. 只注入前 10 条最高置信度的事实
3. 按分类分组显示

### Q: 如何查看哪些事实被注入了对话？

A: 使用 `/memory stats` 查看注入统计。

### Q: 导入时提示"已存在"？

A: 系统会自动跳过内容相同的事实。如果你想覆盖，先删除旧事实再导入。

---

## LLM 工具

除了 `/fact` 命令，还可以通过 LLM 工具操作事实：

### add_fact

```
用add_fact记录我是Python开发者，分类knowledge，置信度0.9
```

### get_facts

```
用get_facts查看所有知识类事实
```

### delete_fact

```
用delete_fact删除 ID 为 fact_xxx 的事实
```

### set_user_info (已废弃)

> ⚠️ 此工具已废弃，请使用 `add_fact` 或 `/fact add`

```
用set_user_info记录 skills = Python, C++
```

---

## 相关文档

- [技能系统](./SKILLS.md)
- [RAG 知识库](../README.md#rag-知识库)
- [安全机制](../assets/SECURITY.md)