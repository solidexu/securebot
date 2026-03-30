---
name: api-designer
description: |
  当用户需要设计、审查或文档化 REST/GraphQL API 时使用。
  即使用户没有明确说"API设计"，只要提到"设计接口"、"创建端点"、"API架构"、"REST规范"等相关请求，都应该使用此技能。
  遵循行业最佳实践设计清晰、一致、开发者友好的 API。
version: "1.0.0"
keywords:
  - api-design
  - rest-api
  - graphql
  - endpoints
  - api-architecture
metadata:
  openclaw:
    emoji: "🔌"
---

# API 设计师

设计清晰、一致、开发者友好的 API。

## 何时使用

- 设计新的 API 端点
- 审查现有 API 设计
- 创建 API 规范
- 规划 API 版本策略

## 设计原则

### RESTful 最佳实践

1. **使用名词表示资源**
   - ✅ `GET /users`, `GET /users/{id}`
   - ❌ `GET /getUsers`

2. **使用正确的 HTTP 方法**
   - GET: 获取资源
   - POST: 创建资源
   - PUT/PATCH: 更新资源
   - DELETE: 删除资源

3. **使用复数名词**
   - ✅ `/users`, `/products`
   - ❌ `/user`, `/product`

### 响应格式

```json
{
  "data": {},
  "meta": { "page": 1, "limit": 20, "total": 100 }
}
```

### 错误处理

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": []
  }
}
```

## 检查清单

- [ ] 一致的命名规范
- [ ] 正确的 HTTP 状态码
- [ ] 列表端点分页
- [ ] 过滤和排序支持
- [ ] 认证要求
- [ ] 版本策略