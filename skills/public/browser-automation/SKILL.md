---
name: browser-automation
description: |
  使用浏览器自动化工具进行复杂交互和页面抓取。
  需要浏览器工具集支持。
keywords:
  - 浏览器
  - 自动化
  - 抓取
  - browser
  - playwright
version: "1.0.0"

# Hermes 条件配置
metadata:
  hermes:
    requires_toolsets: [browser]
    platforms: [macos, linux]  # Windows 不支持
---

# Browser Automation 技能

使用浏览器自动化工具进行复杂交互和页面抓取。

## 概述

此技能需要 browser 工具集支持，包括：
- browser_navigate
- browser_snapshot
- browser_click
- browser_type

## 何时使用

- 需要与复杂网页交互（点击、输入、滚动）
- 需要抓取 JavaScript 渲染的内容
- 需要处理登录、表单提交等交互操作

## 工作流

### 步骤 1：导航
```bash
browser_navigate "https://example.com"
```

### 步骤 2：获取页面状态
```bash
browser_snapshot
```

### 步骤 3：交互
```bash
browser_click "button-id"
browser_type "input-id" "文本内容"
```

### 步骤 4：提取数据
从 snapshot 中提取所需数据。

## 条件激活说明

```yaml
requires_toolsets: [browser]  # 需要 browser 工具集
platforms: [macos, linux]     # 仅支持 macOS 和 Linux
```

激活逻辑：
- browser 工具集可用 + 平台匹配 → 显示
- browser 工具集不可用 → 隐藏
- Windows 平台 → 隐藏
