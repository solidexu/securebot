---
name: doc-generator
description: |
  当用户需要生成文档、API 文档、README、CHANGELOG 或其他技术文档时使用。
  即使用户没有明确说"文档"，只要提到"README"、"API文档"、"写个说明"、"文档生成"等相关请求，都应该使用此技能。
  提供各种文档类型的模板和最佳实践。
version: "1.0.0"
keywords:
  - 文档
  - README
  - API文档
  - CHANGELOG
  - 使用说明
  - documentation
metadata:
  openclaw:
    emoji: "📝"
---

# 文档生成技能

帮助用户生成高质量的技术文档。

## 何时使用

- 用户需要创建 README 文档
- 用户需要生成 API 文档
- 用户需要编写 CHANGELOG
- 用户需要创建用户指南

## 文档类型

### 1. README 文档

```markdown
# 项目名称

简短描述项目做什么。

## 快速开始

### 安装
npm install package-name

### 使用
import { foo } from 'package-name';
```

### 2. API 文档

```markdown
## 用户接口

### 获取用户列表

GET /api/v1/users

**响应**
{
  "data": [{ "id": 1, "name": "Alice" }]
}
```

### 3. CHANGELOG

```markdown
## [1.0.0] - 2024-01-15

### Added
- 初始版本
- 用户认证功能
```

## 写作原则

1. **简洁明了**：用最少的文字传达最多的信息
2. **结构清晰**：使用标题、列表、表格组织内容
3. **示例丰富**：代码示例比文字描述更直观
4. **及时更新**：代码变更时同步更新文档