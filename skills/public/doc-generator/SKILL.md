---
name: doc-generator
description: 当用户需要生成文档、API 文档、README、CHANGELOG 或其他技术文档时使用。提供各种文档类型的模板和最佳实践。
---

# 文档生成技能

## 概述

此技能帮助用户生成高质量的技术文档。

## 何时使用

- 用户需要创建 README 文档
- 用户需要生成 API 文档
- 用户需要编写 CHANGELOG
- 用户需要创建用户指南或开发者文档

## 文档类型

### 1. README 文档

标准 README 结构：

```markdown
# 项目名称

简短描述项目做什么。

## 功能特性

- 特性 1
- 特性 2
- 特性 3

## 快速开始

### 安装

\`\`\`bash
npm install package-name
\`\`\`

### 使用

\`\`\`javascript
import { foo } from 'package-name';
foo();
\`\`\`

## 文档

详细文档请参阅 [docs/](./docs/)

## 贡献

欢迎贡献！请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)

## 许可证

MIT
```

### 2. API 文档

#### RESTful API 文档

```markdown
# API 文档

## 认证

所有 API 请求需要在 Header 中携带 Bearer Token：

\`\`\`
Authorization: Bearer <token>
\`\`\`

## 用户接口

### 获取用户列表

\`\`\`http
GET /api/v1/users
\`\`\`

**查询参数**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| page | int | 否 | 页码，默认 1 |
| limit | int | 否 | 每页数量，默认 20 |

**响应**

\`\`\`json
{
  "data": [
    { "id": 1, "name": "Alice", "email": "alice@example.com" }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
\`\`\`

**状态码**

| 状态码 | 描述 |
|--------|------|
| 200 | 成功 |
| 401 | 未授权 |
| 500 | 服务器错误 |
```

#### OpenAPI/Swagger 格式

```yaml
openapi: 3.0.0
info:
  title: API 文档
  version: 1.0.0
paths:
  /users:
    get:
      summary: 获取用户列表
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
      responses:
        '200':
          description: 成功
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserList'
```

### 3. CHANGELOG

遵循 [Keep a Changelog](https://keepachangelog.com/) 格式：

```markdown
# Changelog

本项目的所有重要变更都将记录在此文件中。

## [Unreleased]

### Added
- 新功能描述

### Changed
- 变更描述

### Fixed
- 修复描述

## [1.0.0] - 2024-01-15

### Added
- 初始版本
- 用户认证功能
- 基础 API 接口
```

### 4. 架构文档

```markdown
# 系统架构

## 概述

简要描述系统架构和设计决策。

## 架构图

\`\`\`
┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Server    │
└─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Database   │
                    └─────────────┘
\`\`\`

## 组件说明

### Client
- 技术栈：React + TypeScript
- 职责：用户界面渲染和交互

### Server
- 技术栈：Node.js + Express
- 职责：业务逻辑处理和 API 服务

### Database
- 技术栈：PostgreSQL
- 职责：数据持久化存储

## 设计决策

### 为什么选择 PostgreSQL？
- 支持 JSON 类型，灵活性高
- 成熟的开源方案，社区活跃
- 适合复杂查询场景
```

## 文档最佳实践

### 写作原则

1. **简洁明了**：用最少的文字传达最多的信息
2. **结构清晰**：使用标题、列表、表格组织内容
3. **示例丰富**：代码示例比文字描述更直观
4. **及时更新**：代码变更时同步更新文档

### 文档风格

```markdown
<!-- ❌ 不好的写法 -->
这个函数用来处理用户的请求并且返回响应。

<!-- ✅ 好的写法 -->
处理用户请求并返回响应。

<!-- ❌ 不好的写法 -->
点击这个按钮

<!-- ✅ 好的写法 -->
1. 点击 **提交** 按钮
2. 等待响应
3. 查看结果
```

### 代码示例

```markdown
<!-- ❌ 不完整的示例 -->
\`\`\`javascript
fetch('/api/users')
\`\`\`

<!-- ✅ 完整的示例 -->
\`\`\`javascript
// 获取用户列表
const response = await fetch('/api/users', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
const users = await response.json();
console.log(users);
\`\`\`
```

## 文档工具推荐

| 工具 | 用途 |
|------|------|
| JSDoc / TSDoc | JavaScript/TypeScript 注释文档 |
| Swagger / OpenAPI | RESTful API 文档 |
| TypeDoc | TypeScript API 文档生成 |
| MkDocs | 静态文档站点 |
| Docusaurus | React 技术栈文档站点 |

## 文档模板

### 函数文档

```typescript
/**
 * 计算两个日期之间的天数差
 * 
 * @param startDate - 开始日期
 * @param endDate - 结束日期
 * @returns 天数差（可为负数）
 * 
 * @example
 * \`\`\`ts
 * const days = daysBetween(new Date('2024-01-01'), new Date('2024-01-10'));
 * console.log(days); // 9
 * \`\`\`
 */
function daysBetween(startDate: Date, endDate: Date): number {
  const diff = endDate.getTime() - startDate.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
```

### 组件文档

```typescript
/**
 * 用户头像组件
 * 
 * @component
 * @example
 * <Avatar 
 *   src="https://example.com/avatar.jpg" 
 *   name="Alice" 
 *   size="large" 
 * />
 */
interface AvatarProps {
  /** 头像图片地址 */
  src?: string;
  /** 用户名（用于显示首字母） */
  name: string;
  /** 头像大小 */
  size?: 'small' | 'medium' | 'large';
}
```