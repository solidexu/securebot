---
name: basic-research
description: |
  简化版研究技能，作为深度研究技能的 fallback。
  当 full_stack 工具集不可用时自动激活。
keywords:
  - 研究
  - 简化
  - fallback
version: "1.0.0"

# Hermes 条件配置
metadata:
  hermes:
    fallback_for_toolsets: [full_stack]
    requires_toolsets: [web]
---

# Basic Research 技能（Fallback）

当 full_stack 工具集不可用时，此技能作为深度研究的简化版替代方案。

## 概述

这是一个 fallback 技能：
- 当 Agent 配置了 full_stack 工具集时，此技能会被隐藏（使用更强大的深度研究技能）
- 当 Agent 未配置 full_stack 工具集时，此技能会被激活（提供基础研究能力）

## 何时使用

- Agent 配置为 standard 或 basic 工具集
- 需要基础研究功能，但不需要多步骤、多工具的复杂研究

## 工作流

### 简化研究流程

1. 使用 web_search 进行基础搜索
2. 总结搜索结果片段（不获取完整内容）
3. 提供简短摘要

## 条件激活说明

```yaml
fallback_for_toolsets: [full_stack]  # full_stack 可用时隐藏
requires_toolsets: [web]             # 需要 web 工具集
```

激活逻辑：
- full_stack 可用 + web 可用 → 隐藏（使用 deep-research）
- full_stack 不可用 + web 可用 → 显示（使用 basic-research）
- web 不可用 → 隐藏（无法使用任何研究技能）
