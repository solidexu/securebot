# SecureBot 技能系统

SecureBot 使用纯 Markdown 格式的技能系统，遵循 ClawHub 和 Deer-Flow 标准。

## 目录

- [快速开始](#快速开始)
- [技能格式](#技能格式)
- [内置技能](#内置技能)
- [CLI 命令](#cli-命令)
- [版本管理](#版本管理)
- [打包和分发](#打包和分发)
- [远程发现](#远程发现)
- [开发自定义技能](#开发自定义技能)

---

## 快速开始

### 查看可用技能

```bash
securebot skill list
```

### 在对话中使用技能

技能会根据你的请求自动触发：

```
[开发助手] > 检查代码有没有安全漏洞
🎯 激活技能: 安全审计
🎯 [技能: 安全审计]

[开发助手] > 研究一下什么是RAG
🎯 激活技能: 深度研究
🎯 [技能: 深度研究]
```

### 创建自定义技能

```bash
securebot skill create
```

---

## 技能格式

### 目录结构

```
skills/
└── public/                    # 公共技能
    ├── security-audit/
    │   ├── SKILL.md          # 技能定义（必需）
    │   ├── scripts/          # 可执行脚本（可选）
    │   ├── references/       # 参考文档（可选）
    │   └── assets/           # 静态资源（可选）
    ├── code-review/
    └── ...

~/.securebot/
└── agents/{agentId}/skills/  # 个人技能
```

### SKILL.md 格式

```markdown
---
name: security-audit
description: |
  当用户需要进行安全审计、检查代码安全漏洞时使用。
  即使用户没有明确说"安全审计"，只要提到漏洞、SQL注入、XSS等，
  都应该使用此技能。
version: "1.0.0"
keywords:
  - 安全
  - 漏洞
  - SQL注入
  - XSS
metadata:
  openclaw:
    emoji: "🔒"
    requires:
      bins: [grep, find]
---

# 安全审计技能

帮助用户进行代码和系统的安全审计。

## 何时使用

- 用户需要进行安全审计
- 用户想检查代码中的安全漏洞
...

## 工作流程

1. 分析代码结构
2. 检查常见漏洞
3. 生成报告
```

### YAML Frontmatter 字段

| 字段 | 必需 | 说明 |
|------|------|------|
| `name` | ✅ | 技能名称（URL安全，小写） |
| `description` | ✅ | 触发描述（详细说明何时使用） |
| `version` | 推荐 | 版本号（SemVer） |
| `keywords` | 可选 | 触发关键词列表 |
| `metadata.openclaw.emoji` | 可选 | 显示图标 |
| `metadata.openclaw.requires.env` | 可选 | 需要的环境变量 |
| `metadata.openclaw.requires.bins` | 可选 | 需要的二进制程序 |

---

## 内置技能

| 技能 | 触发场景 | 说明 |
|------|---------|------|
| `security-audit` | 安全漏洞、SQL注入、XSS | 代码安全审计 |
| `deep-research` | 研究XX、什么是XX | 深度网络研究 |
| `debugger` | 报错、bug、异常 | 问题定位与分析 |
| `code-review` | 审查代码、review | 代码审查 |
| `testing-helper` | 写测试、测试用例 | 测试编写指导 |
| `doc-generator` | 文档、README | 文档生成 |
| `git-workflow` | 分支、合并、冲突 | Git 操作指导 |
| `api-design` | 设计接口、API | API 设计 |
| `data-analysis` | Excel、CSV、数据分析 | 数据分析 |
| `translator` | 翻译 | 多语言翻译 |

---

## CLI 命令

### 基础管理

```bash
# 列出所有技能
securebot skill list

# 列出公共技能
securebot skill list --public

# 列出指定 Agent 的技能
securebot skill list --agent dev

# 创建技能（交互式）
securebot skill create

# 创建个人技能
securebot skill create --agent dev

# 删除技能
securebot skill delete security-audit

# 分配技能给 Agent
securebot skill assign security-audit dev

# 从 Agent 移除技能
securebot skill unassign security-audit dev
```

### 版本管理

```bash
# 保存当前版本
securebot skill save security-audit -m "初始版本"

# 查看版本历史
securebot skill versions security-audit

# 对比两个版本
securebot skill diff security-audit

# 回滚到指定版本
securebot skill rollback security-audit
```

### 打包和安装

```bash
# 打包技能为 .skill 文件
securebot skill pack security-audit -o /tmp/

# 验证技能包
securebot skill verify /tmp/security-audit-1.0.0.skill

# 查看技能包内容
securebot skill inspect /tmp/security-audit-1.0.0.skill

# 从本地文件安装
securebot skill install /tmp/security-audit-1.0.0.skill

# 从 URL 安装
securebot skill install https://example.com/skills/my-skill.skill

# 覆盖安装
securebot skill install my-skill.skill --force

# 安装到指定目录
securebot skill install my-skill.skill -d /path/to/skills

# 导出所有技能
securebot skill export-all -o /tmp/
```

### 远程发现

```bash
# 搜索远程技能
securebot skill search "api design"

# 浏览热门技能
securebot skill explore -t popular -l 20

# 浏览最新技能
securebot skill explore -t latest

# 查看远程技能详情
securebot skill show-remote my-skill
```

---

## 版本管理

### 工作原理

每次保存版本时：
1. 复制当前技能文件到版本目录
2. 计算校验和
3. 生成版本元数据

```
~/.securebot/skill-versions/
└── security-audit/
    ├── 1.0.0/
    │   ├── SKILL.md
    │   └── .version.json
    └── 1.0.1/
        ├── SKILL.md
        └── .version.json
```

### 版本号规则

- 遵循 SemVer（语义化版本）
- 自动递增 patch 版本（1.0.0 → 1.0.1）
- 如果 SKILL.md 中指定了更高版本，使用指定版本

### 版本操作流程

```bash
# 1. 修改技能文件
vim skills/public/security-audit/SKILL.md

# 2. 保存版本
securebot skill save security-audit -m "添加 OWASP 检查项"

# 3. 查看历史
securebot skill versions security-audit

# 4. 如果需要，回滚
securebot skill rollback security-audit
```

---

## 打包和分发

### .skill 文件格式

`.skill` 文件是 ZIP 格式的压缩包：

```
my-skill.skill (ZIP)
├── manifest.json    # 元数据
├── SKILL.md        # 技能定义
├── scripts/        # 脚本（可选）
├── references/     # 参考文档（可选）
└── assets/         # 静态资源（可选）
```

### manifest.json

```json
{
  "name": "security-audit",
  "version": "1.0.0",
  "description": "代码安全审计技能",
  "createdAt": "2026-03-30T10:00:00Z",
  "checksum": "54bdb83ed5f1007c",
  "files": ["SKILL.md"],
  "size": 2398
}
```

### 安全验证

安装时会自动检查：
- 路径遍历攻击
- 绝对路径
- 文件类型限制
- 文件大小限制（50MB）

### 分发流程

```bash
# 1. 打包技能
securebot skill pack my-skill -o ./

# 2. 上传到服务器或 ClawHub

# 3. 其他人安装
securebot skill install https://clawhub.ai/skills/my-skill/download
```

---

## 远程发现

### 搜索技能

```bash
securebot skill search "api design"

🔍 搜索: "api design"

找到 5 个技能

  api-design v1.0.0 - RESTful API 设计最佳实践
  api-designer v1.0.0 - API 设计和文档化
  openapi-helper v1.2.0 - OpenAPI 规范工具
  ...
```

### 浏览热门/最新

```bash
# 热门技能
securebot skill explore -t popular -l 10

# 最新技能
securebot skill explore -t latest -l 10
```

### 查看详情

```bash
securebot skill show-remote api-design

📋 api-design

名称: API Design
版本: 1.0.0
描述: RESTful API 设计最佳实践
下载: 1234
星标: 56

安装: securebot skill install https://clawhub.ai/skills/api-design/download
```

---

## 开发自定义技能

### 创建步骤

1. **创建目录**

```bash
mkdir -p skills/public/my-skill
```

2. **创建 SKILL.md**

```markdown
---
name: my-skill
description: |
  当用户需要...时使用。
  触发场景：...
version: "1.0.0"
keywords:
  - 关键词1
  - 关键词2
metadata:
  openclaw:
    emoji: "🚀"
---

# 我的技能

## 概述

技能的简短描述。

## 何时使用

- 场景 1
- 场景 2

## 工作流程

1. 步骤 1
2. 步骤 2

## 最佳实践

- 建议 1
- 建议 2
```

3. **测试**

```bash
securebot skill list
securebot chat
# 输入触发关键词测试
```

### Description 写作技巧

好的 description 是触发准确的关键：

```yaml
# ✅ 好的写法
description: |
  当用户需要进行安全审计、检查代码安全漏洞时使用。
  即使用户没有明确说"安全审计"，只要提到漏洞、SQL注入、XSS、
  CSRF、密码安全、权限检查等相关话题，都应该使用此技能。

# ❌ 差的写法
description: 安全审计技能
```

**原则：**
1. 说明技能做什么
2. 列出触发场景
3. 稍微"pushy"，防止欠触发

### 添加脚本

```
my-skill/
├── SKILL.md
└── scripts/
    └── helper.py
```

在 SKILL.md 中引用：

```markdown
## 使用脚本

运行辅助脚本：

\`\`\`bash
python scripts/helper.py --input data.csv
\`\`\`
```

### 添加参考文档

```
my-skill/
├── SKILL.md
└── references/
    ├── advanced.md
    └── examples.md
```

---

## 技能触发机制

### 三层匹配

1. **意图识别** - 识别用户意图，匹配技能
2. **关键词匹配** - 快速匹配 `keywords` 字段
3. **语义匹配** - 使用 RAG embedding 理解意图

### 触发流程

```
用户输入
    ↓
┌─────────────────┐
│  意图识别        │  识别用户意图
└────────┬────────┘
         ↓
┌─────────────────┐
│  关键词匹配      │  快速匹配 keywords
└────────┬────────┘
         ↓
┌─────────────────┐
│  语义匹配        │  embedding 相似度
└────────┬────────┘
         ↓
    选择最佳技能
```

### 触发示例

```
用户: 检查代码有没有安全漏洞
系统: 关键词匹配 "安全"、"漏洞" → security-audit

用户: 这个报错怎么修
系统: 关键词匹配 "报错" → debugger

用户: 帮我研究一下 RAG 是什么
系统: 关键词匹配 "研究" → deep-research
```

---

## 常见问题

### Q: 技能没有触发？

1. 检查技能是否加载：`securebot skill list`
2. 检查关键词是否在 `keywords` 中
3. 优化 `description`，增加触发场景

### Q: 如何查看技能内容？

```bash
cat skills/public/security-audit/SKILL.md
```

### Q: 如何分享技能？

```bash
# 打包
securebot skill pack my-skill -o ./

# 分享 .skill 文件给其他人

# 其他人安装
securebot skill install my-skill-1.0.0.skill
```

### Q: 如何回滚到之前版本？

```bash
securebot skill versions my-skill
securebot skill rollback my-skill
```

---

## 相关链接

- [ClawHub](https://clawhub.ai) - 技能注册中心
- [Deer-Flow](https://github.com/deer-flow) - 技能标准参考
- [ClawHub Skill Format](https://github.com/openclaw/clawhub/blob/main/docs/skill-format.md) - 技能格式规范