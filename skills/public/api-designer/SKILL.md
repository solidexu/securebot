---
name: api-designer
description: Use this skill when you need to design, review, or document REST/GraphQL APIs. Triggers on API design requests, endpoint creation, or API architecture discussions.
version: "1.0.0"
license: MIT
keywords:
  - api-design
  - rest-api
  - graphql
  - endpoints
  - api-architecture
tools:
  - read
  - write
  - edit
---

# API Designer

## Purpose

Design clean, consistent, and developer-friendly APIs following industry best practices.

## When to Use

- Designing new API endpoints
- Reviewing existing API designs
- Creating API specifications
- Planning API versioning strategy
- Documenting API contracts

## Design Principles

### RESTful Best Practices

1. **Use Nouns for Resources**
   - Good: `GET /users`, `GET /users/{id}`
   - Bad: `GET /getUsers`

2. **Use Proper HTTP Methods**
   - GET: Retrieve resources
   - POST: Create resources
   - PUT/PATCH: Update resources
   - DELETE: Remove resources

3. **Use Plural Nouns**
   - Good: `/users`, `/products`
   - Bad: `/user`, `/product`

4. **Nesting for Relationships**
   - `GET /users/{id}/orders`
   - Limit nesting to 2 levels

### Response Format

```json
{
  "data": {},
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  },
  "errors": []
}
```

### Error Handling

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": []
  }
}
```

## Checklist

- [ ] Consistent naming conventions
- [ ] Proper HTTP status codes
- [ ] Pagination for list endpoints
- [ ] Filtering and sorting support
- [ ] Authentication requirements
- [ ] Rate limiting headers
- [ ] Versioning strategy
- [ ] Comprehensive error messages

## Output Format

Provide OpenAPI/Swagger-compatible specifications when possible.