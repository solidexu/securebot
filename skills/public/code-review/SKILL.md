---
id: code-review
name: 代码审查
version: 1.0.0
author: securebot
keywords:
  - review
  - 审查
  - 检查代码
  - 代码质量
  - 优化代码
  - 代码问题
tools:
  - read
  - edit
trigger:
  type: auto
  confidence: 0.6
---

# Code Review Skill

## Overview

专业的代码审查技能，帮助发现代码问题和改进建议。

## When to Use

- 用户说 "帮我审查代码"
- 用户说 "review 一下"
- 用户请求代码质量检查
- 用户提供了代码文件

## Workflow

### Step 1: Read Code

使用 `read` 工具读取目标代码：

```
read(path: string) -> content
```

### Step 2: Analyze Structure

识别代码结构：

- 函数/方法定义
- 类和接口
- 依赖关系
- 关键逻辑

### Step 3: Check Issues

检查常见问题：

| 类别 | 检查项 |
|------|--------|
| 安全性 | SQL 注入、XSS、敏感数据暴露 |
| 性能 | 循环优化、内存泄漏、N+1 查询 |
| 可读性 | 命名规范、注释完整性、代码复杂度 |
| 错误处理 | 异常捕获、边界条件、错误传播 |

### Step 4: Generate Report

生成结构化报告：

```markdown
## 代码审查报告

### 🔴 严重问题
- [问题描述]
  - 位置：文件名:行号
  - 建议：[修复建议]

### 🟡 一般问题
- [问题描述]

### 🟢 优秀实践
- [值得肯定的代码]

### 📊 统计
- 总行数：xxx
- 问题数：xxx
- 评分：xx/100
```

## Best Practices

1. **优先级排序**：安全问题 > 性能问题 > 可读性问题 > 代码风格
2. **具体建议**：指出具体的问题位置，而非笼统批评
3. **建设性反馈**：提供可执行的改进建议
4. **平衡批评与肯定**：也要指出优秀的代码

## Examples

### Example 1: Simple Review

**User**: 帮我审查一下 app.py

**Assistant**: 
我来审查一下 app.py 文件。

[使用 read 工具读取文件]

## 代码审查报告

### 🟡 一般问题
1. **缺少错误处理** (第 45 行)
   - `fetch_data()` 没有处理网络错误
   - 建议：添加 try-except 块

2. **硬编码配置** (第 12 行)
   - API URL 直接写在代码中
   - 建议：使用环境变量

### 🟢 优秀实践
- 函数命名清晰
- 有适当的注释

### 📊 评分：75/100

## Resources

- [审查检查清单](./templates/checklist.md)
- [复杂度分析脚本](./scripts/analyze.py)