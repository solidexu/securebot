---
name: security-audit
description: 当用户需要进行安全审计、检查代码安全漏洞或评估系统安全性时使用。提供常见安全问题的检查清单和修复建议。
keywords:
  - 安全
  - 漏洞
  - 审计
  - SQL注入
  - XSS
  - CSRF
  - security
  - vulnerability
  - 安全检查
  - 安全审计
---

# 安全审计技能

## 概述

此技能帮助用户进行代码和系统的安全审计。

## 何时使用

- 用户需要进行安全审计
- 用户想检查代码中的安全漏洞
- 用户需要评估系统安全性
- 用户问关于安全最佳实践的问题

## 安全检查清单

### 1. 注入攻击

#### SQL 注入

```typescript
// ❌ 有漏洞
const query = `SELECT * FROM users WHERE id = ${userId}`;

// ✅ 安全（参数化查询）
const query = 'SELECT * FROM users WHERE id = ?';
db.query(query, [userId]);

// ✅ 安全（ORM）
const user = await User.findByPk(userId);
```

#### 命令注入

```typescript
// ❌ 有漏洞
exec(`ls ${userInput}`);

// ✅ 安全（输入验证 + 转义）
exec('ls', [sanitizePath(userInput)]);

// ✅ 更安全（避免 shell）
fs.readdirSync(userInput);
```

#### XSS (跨站脚本)

```typescript
// ❌ 有漏洞
element.innerHTML = userInput;

// ✅ 安全
element.textContent = userInput;

// ✅ 使用框架自动转义
<div>{userInput}</div>
```

### 2. 认证与授权

#### 密码安全

```typescript
// ❌ 明文存储
await db.query('INSERT INTO users (password) VALUES (?)', [password]);

// ✅ 哈希存储
const hashedPassword = await bcrypt.hash(password, 12);
await db.query('INSERT INTO users (password) VALUES (?)', [hashedPassword]);

// ✅ 验证
const isValid = await bcrypt.compare(password, storedHash);
```

#### Session 安全

```typescript
// ✅ 安全的 Session 配置
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,      // 防止 XSS 窃取
    secure: true,        // 仅 HTTPS
    sameSite: 'strict',  // 防止 CSRF
    maxAge: 3600000,     // 1 小时过期
  },
}));
```

#### JWT 安全

```typescript
// ✅ 安全的 JWT 配置
const token = jwt.sign(
  { userId: user.id },
  process.env.JWT_SECRET,
  {
    expiresIn: '1h',
    algorithm: 'HS256',
  }
);

// ✅ 验证
try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
} catch (err) {
  // 处理过期或无效 token
}
```

### 3. 敏感数据

#### 数据加密

```typescript
// ✅ 使用强加密算法
const crypto = require('crypto');

const algorithm = 'aes-256-gcm';
const key = crypto.scryptSync(secret, 'salt', 32);

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return { iv: iv.toString('hex'), encrypted, authTag: authTag.toString('hex') };
}
```

#### 敏感数据处理

```typescript
// ❌ 日志中包含敏感数据
console.log(`User login: ${email}, password: ${password}`);

// ✅ 避免记录敏感数据
console.log(`User login: ${maskEmail(email)}`);

// ✅ 响应中移除敏感字段
const { password, ...safeUser } = user;
return safeUser;
```

### 4. 访问控制

#### 权限检查

```typescript
// ✅ 每个操作都检查权限
app.delete('/api/users/:id', auth, async (req, res) => {
  // 检查是否是本人或管理员
  if (req.user.id !== req.params.id && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  await User.delete(req.params.id);
  res.status(204).send();
});
```

#### RBAC (基于角色的访问控制)

```typescript
// ✅ RBAC 中间件
function checkPermission(requiredPermission) {
  return (req, res, next) => {
    const userPermissions = getRolePermissions(req.user.role);
    
    if (!userPermissions.includes(requiredPermission)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    next();
  };
}

// 使用
app.post('/api/admin/users', auth, checkPermission('user:create'), createUser);
```

### 5. CSRF 防护

```typescript
// ✅ 使用 CSRF Token
const csrf = require('csurf');
app.use(csrf({ cookie: true }));

// 在表单中包含 token
<input type="hidden" name="_csrf" value="<%= csrfToken %>">

// 在 API header 中
res.locals.csrfToken = req.csrfToken();
```

### 6. 文件上传

```typescript
// ✅ 安全的文件上传
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type'), false);
    }
    
    // 验证扩展名
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif'];
    if (!allowedExts.includes(ext)) {
      return cb(new Error('Invalid file extension'), false);
    }
    
    cb(null, true);
  },
});
```

### 7. 依赖安全

```bash
# 检查已知漏洞
npm audit

# 自动修复
npm audit fix

# 使用安全工具
npx snyk test
```

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
| A08: Software/Data Integrity | 数据完整性是否保证 |
| A09: Security Logging | 安全日志是否完善 |
| A10: SSRF | 是否有 SSRF 漏洞 |

## 安全审计报告模板

```markdown
# 安全审计报告

## 概述
- 审计时间：YYYY-MM-DD
- 审计范围：[项目/模块]
- 审计人员：[姓名]

## 发现的问题

### 严重 (Critical)
1. **[漏洞名称]**
   - 位置：file.py:123
   - 描述：[详细描述]
   - 影响：[潜在影响]
   - 建议：[修复建议]

### 高危 (High)
...

### 中危 (Medium)
...

### 低危 (Low)
...

## 安全建议

1. [整体建议]
2. [整体建议]

## 合规检查

| 检查项 | 状态 | 备注 |
|--------|------|------|
| HTTPS | ✅ | 已启用 |
| 输入验证 | ⚠️ | 部分缺失 |
| 日志记录 | ❌ | 未实现 |
```

## 安全最佳实践

1. **最小权限原则**：只授予必要的权限
2. **纵深防御**：多层安全措施
3. **安全默认**：默认配置应该是安全的
4. **输入验证**：验证所有用户输入
5. **输出编码**：编码所有输出
6. **日志记录**：记录安全相关事件
7. **定期审计**：定期进行安全审计
8. **保持更新**：及时更新依赖库