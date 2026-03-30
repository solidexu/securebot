---
name: api-design
description: |
  当用户需要设计 API、定义接口规范或创建 API 架构时使用。
  即使用户没有明确说"API设计"，只要提到"设计接口"、"API"、"REST"、"GraphQL"、"端点"、"endpoint"等相关请求，都应该使用此技能。
  提供 RESTful API、GraphQL API 的设计最佳实践和模式。
version: "1.0.0"
keywords:
  - API
  - REST
  - GraphQL
  - 接口
  - 端点
  - endpoint
metadata:
  openclaw:
    emoji: "🔌"
---

# API 设计技能

帮助用户设计高质量的 API 接口。

## 何时使用

- 用户需要设计新的 API
- 用户需要定义 API 规范
- 用户需要重构现有 API

## RESTful API 设计

### 资源命名规范

```
# ✅ 好的设计
GET    /users          # 获取用户列表
GET    /users/{id}     # 获取单个用户
POST   /users          # 创建用户
PUT    /users/{id}     # 更新用户
DELETE /users/{id}     # 删除用户

# ❌ 不好的设计
GET    /getUsers
POST   /createUser
```

### HTTP 方法

| 方法 | 用途 | 是否幂等 |
|------|------|---------|
| GET | 获取资源 | 是 |
| POST | 创建资源 | 否 |
| PUT | 完整更新 | 是 |
| PATCH | 部分更新 | 是 |
| DELETE | 删除资源 | 是 |

### 状态码

| 状态码 | 含义 | 使用场景 |
|--------|------|---------|
| 200 | OK | 成功响应 |
| 201 | Created | 资源创建成功 |
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 未认证 |
| 404 | Not Found | 资源不存在 |
| 500 | Server Error | 服务器错误 |

## 分页与过滤

```
GET /users?page=1&limit=20&sort=created_at:desc
GET /users?status=active&role=admin
```

## 错误响应格式

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数验证失败",
    "details": [{ "field": "email", "message": "邮箱格式不正确" }]
  }
}
```

## 设计检查清单

- [ ] 资源命名是否清晰
- [ ] HTTP 方法使用是否正确
- [ ] 状态码使用是否恰当
- [ ] 错误处理是否完善
- [ ] 认证机制是否完善
- [ ] 是否支持分页