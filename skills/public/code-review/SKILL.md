---
id: code-review
name: 代码审查
version: "1.0.0"
author: securebot
keywords:
  - review
  - 审查
  - code
  - 代码
  - quality
  - 质量
tools:
  - read
  - edit
trigger:
  type: auto
  confidence: 0.6
---

# 代码审查

专业的代码审查技能，帮助发现代码中的问题并提供改进建议。

## Overview

这是一个专业的代码审查技能，可以帮助开发者审查代码质量、发现潜在问题、提供改进建议。

## When to Use

- 用户说 "帮我审查代码"
- 用户说 "review this code"
- 用户请求代码审查
- 用户想要检查代码质量

## Workflow

### Step 1: Read Code

读取用户指定的代码文件，理解代码结构和功能。

### Step 2: Analyze Code

分析代码质量，包括：
- 代码风格和规范
- 潜在的 bug 和安全漏洞
- 性能问题
- 可维护性

### Step 3: Provide Feedback

提供详细的审查报告，包括：
- 问题列表（按优先级排序）
- 具体的改进建议
- 最佳实践建议

## Best Practices

1. **优先级排序**：按严重程度排序问题（Critical > High > Medium > Low）
2. **具体建议**：给出具体的代码改进建议，而不是模糊的建议
3. **保持礼貌**：以建设性的方式提出问题
4. **关注重点**：关注最重要的改进点，不要列出太多小问题

## Examples

### Example 1: Simple Review

**User**: 帮我审查 app.py

**Assistant**: 我来审查 app.py 文件...

### Example 2: Security Review

**User**: 检查 auth.py 的安全问题

**Assistant**: 我来检查 auth.py 的安全漏洞...

## Resources

- [检查清单](./templates/checklist.md)
- [分析脚本](./scripts/analyze.py)