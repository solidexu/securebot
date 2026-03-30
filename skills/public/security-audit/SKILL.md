---
name: security-audit
description: |
  当用户需要进行安全审计、检查代码安全漏洞或评估系统安全性时使用。
  即使用户没有明确说"安全审计"，只要提到漏洞、SQL注入、XSS、CSRF、密码安全、权限检查、加密、认证、授权等相关话题，都应该使用此技能。
  提供 OWASP Top 10 检查清单和修复建议。
version: "1.0.0"
keywords:
  - 安全
  - 漏洞
  - 审计
  - SQL注入
  - XSS
  - CSRF
  - security
  - vulnerability
metadata:
  openclaw:
    emoji: "🔒"
    requires:
      bins: [grep, find]
---

# 安全审计技能

帮助用户进行代码和系统的安全审计，检查常见安全漏洞。

## 何时使用

- 用户需要进行安全审计
- 用户想检查代码中的安全漏洞
- 用户需要评估系统安全性
- 用户问关于安全最佳实践的问题
- 代码中涉及认证、授权、加密、输入验证

## 安全检查清单

### 1. 注入攻击

#### SQL 注入

```typescript
// ❌ 有漏洞
const query = `SELECT * FROM users WHERE id = ${userId}`;

// ✅ 安全（参数化查询）
const query = 'SELECT * FROM users WHERE id = ?';
db.query(query, [userId]);
```

#### XSS (跨站脚本)

```typescript
// ❌ 有漏洞
element.innerHTML = userInput;

// ✅ 安全
element.textContent = userInput;
```

### 2. 认证与授权

- 密码是否安全存储（哈希）
- Session 配置是否安全
- JWT 是否正确验证
- 权限检查是否完整

### 3. 敏感数据

- 是否加密存储敏感数据
- 日志是否包含敏感信息
- 响应是否泄露敏感字段

### 4. 访问控制

- 是否验证权限
- 是否有越权风险

## OWASP Top 10 检查

| 风险 | 检查项 |
|------|--------|
| A01: Broken Access Control | 权限验证是否完整 |
| A02: Cryptographic Failures | 加密是否使用强算法 |
| A03: Injection | 是否使用参数化查询 |
| A04: Insecure Design | 架构是否考虑安全 |
| A05: Security Misconfiguration | 配置是否安全 |
| A06: Vulnerable Components | 依赖是否有漏洞 |
| A07: Auth Failures | 认证是否安全 |

## 输出格式

```markdown
# 安全审计报告

## 发现的问题

### 严重 (Critical)
1. **[漏洞名称]**
   - 位置：file.py:123
   - 描述：[详细描述]
   - 建议：[修复建议]

## 安全建议
1. [整体建议]
```

## 参考资料

> 详见 `references/owasp-top10.md`