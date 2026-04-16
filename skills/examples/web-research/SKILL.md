---
name: web-research
description: |
  使用 web 工具集进行轻量级网络研究。
  当 full_stack 工具集不可用时的基础研究技能。
keywords:
  - 研究
  - web
  - 搜索
  - research
version: "1.0.0"

# Hermes 条件配置
metadata:
  hermes:
    requires_toolsets: [web]
    platforms: [macos, linux, windows]
---

# Web Research 技能

使用 web 工具集（web_search + web_fetch）进行轻量级网络研究。

## 概述

这是一个基础的 Web 研究技能，只需要 web 工具集即可使用。当 Agent 配置中启用了 web 工具集时，此技能会被激活。

## 何时使用

- Agent 仅配置了 web 工具集
- 需要快速搜索和获取网页内容
- 不需要复杂的多步骤研究

## 工作流

### 步骤 1：搜索
```bash
web_search "查询关键词"
```

### 步骤 2：获取内容
```bash
web_fetch "重要结果URL"
```

### 步骤 3：总结
综合搜索结果，生成摘要。

## 条件激活说明

此技能通过 Hermes 条件配置实现智能激活：

```yaml
requires_toolsets: [web]  # 需要 web 工具集可用
```

当 Agent 的 toolsets.enabled 包含 web 时，此技能会被包含在系统提示中。
