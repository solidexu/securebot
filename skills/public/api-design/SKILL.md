---
name: api-design
description: 当用户需要设计 API、定义接口规范或创建 API 架构时使用。提供 RESTful API、GraphQL API 的设计最佳实践和模式。
keywords:
  - API
  - REST
  - GraphQL
  - 接口
  - 端点
  - endpoint
  - API设计
  - 接口设计
---

# API 设计技能

## 概述

此技能帮助用户设计高质量的 API 接口。

## 何时使用

- 用户需要设计新的 API
- 用户需要定义 API 规范
- 用户需要重构现有 API
- 用户问关于 API 设计的问题

## RESTful API 设计

### 资源命名规范

```
# ✅ 好的设计（名词复数）
GET    /users          # 获取用户列表
GET    /users/{id}     # 获取单个用户
POST   /users          # 创建用户
PUT    /users/{id}     # 更新用户
DELETE /users/{id}     # 删除用户

# 嵌套资源
GET    /users/{id}/orders        # 用户的订单列表
GET    /users/{id}/orders/{oid}  # 用户的特定订单

# ❌ 不好的设计（动词）
GET    /getUsers
POST   /createUser
DELETE /deleteUser
```

### HTTP 方法

| 方法 | 用途 | 是否幂等 |
|------|------|---------|
| GET | 获取资源 | 是 |
| POST | 创建资源 | 否 |
| PUT | 完整更新资源 | 是 |
| PATCH | 部分更新资源 | 是 |
| DELETE | 删除资源 | 是 |

### 状态码使用

| 状态码 | 含义 | 使用场景 |
|--------|------|---------|
| 200 | OK | 成功响应 |
| 201 | Created | 资源创建成功 |
| 204 | No Content | 删除成功，无返回内容 |
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 未认证 |
| 403 | Forbidden | 无权限 |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 资源冲突 |
| 422 | Unprocessable Entity | 验证失败 |
| 500 | Internal Server Error | 服务器错误 |

### 请求与响应

#### 分页

```json
// 请求
GET /users?page=1&limit=20&sort=created_at:desc

// 响应
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "total_pages": 5
  }
}
```

#### 过滤与搜索

```
GET /users?status=active&role=admin
GET /users?q=john&fields=id,name,email
```

#### 错误响应

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数验证失败",
    "details": [
      {
        "field": "email",
        "message": "邮箱格式不正确"
      }
    ]
  }
}
```

### 版本控制

```
# URL 路径版本
/api/v1/users
/api/v2/users

# Header 版本
Accept: application/vnd.myapi.v1+json
```

## API 安全

### 认证方式

#### Bearer Token

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

#### API Key

```
X-API-Key: your-api-key
```

#### OAuth 2.0

```
Authorization: Bearer <access_token>
```

### 安全最佳实践

1. **HTTPS**：所有 API 必须使用 HTTPS
2. **输入验证**：验证所有用户输入
3. **速率限制**：防止滥用
4. **敏感数据**：不在 URL 中传递敏感数据
5. **CORS**：正确配置跨域访问

## GraphQL API 设计

### Schema 设计

```graphql
type User {
  id: ID!
  name: String!
  email: String!
  posts: [Post!]!
  createdAt: DateTime!
}

type Post {
  id: ID!
  title: String!
  content: String!
  author: User!
  comments: [Comment!]!
}

type Query {
  user(id: ID!): User
  users(filter: UserFilter, page: Int, limit: Int): UserConnection!
  post(id: ID!): Post
}

type Mutation {
  createUser(input: CreateUserInput!): User!
  updateUser(id: ID!, input: UpdateUserInput!): User!
  deleteUser(id: ID!): Boolean!
}

input CreateUserInput {
  name: String!
  email: String!
}

input UserFilter {
  name: String
  email: String
}
```

### 最佳实践

1. **命名规范**：使用 camelCase
2. **非空标记**：合理使用 `!`
3. **分页**：使用 Relay 风格的连接模式
4. **批量查询**：支持 DataLoader 防止 N+1

## API 文档示例

```yaml
openapi: 3.0.0
info:
  title: 用户管理 API
  version: 1.0.0
  description: 用户管理系统的 RESTful API

servers:
  - url: https://api.example.com/v1

paths:
  /users:
    get:
      summary: 获取用户列表
      tags: [Users]
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
      responses:
        '200':
          description: 成功
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserList'
        '401':
          $ref: '#/components/responses/Unauthorized'

components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        email:
          type: string
      required: [id, name, email]
    
    UserList:
      type: object
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/User'
        pagination:
          $ref: '#/components/schemas/Pagination'
```

## 设计检查清单

### 功能性
- [ ] 资源命名是否清晰
- [ ] HTTP 方法使用是否正确
- [ ] 状态码使用是否恰当
- [ ] 错误处理是否完善

### 安全性
- [ ] 认证机制是否完善
- [ ] 权限控制是否合理
- [ ] 敏感数据是否加密
- [ ] 是否有速率限制

### 可用性
- [ ] API 文档是否完整
- [ ] 是否有使用示例
- [ ] 错误信息是否清晰
- [ ] 版本策略是否明确

### 性能
- [ ] 是否支持分页
- [ ] 是否支持过滤
- [ ] 是否有缓存策略
- [ ] N+1 问题是否处理