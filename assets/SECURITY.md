# SecureBot 公司级数据安全实现

## 安全架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                      SecureBot 安全架构                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ 敏感操作确认 │  │  审计日志   │  │ 权限策略    │         │
│  │ confirmation │  │   audit     │  │  policy     │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┼────────────────┘                 │
│                          ▼                                   │
│              ┌───────────────────────┐                      │
│              │    工具执行层          │                      │
│              │  read/write/exec/...  │                      │
│              └───────────────────────┘                      │
│                          │                                   │
│                          ▼                                   │
│              ┌───────────────────────┐                      │
│              │    工作空间隔离        │                      │
│              │  workspace sandbox    │                      │
│              └───────────────────────┘                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. 敏感操作确认系统 (`src/core/confirmation.ts`)

### 敏感级别

| 级别 | 说明 | 示例操作 |
|------|------|---------|
| `safe` | 安全，无需确认 | read (普通文件), rag_search |
| `low` | 低风险，可选确认 | rag_index |
| `medium` | 中风险，建议确认 | write, edit |
| `high` | 高风险，必须确认 | exec (命令执行) |
| `critical` | 关键操作，必须确认 | 敏感文件操作 |

### 操作类别

```typescript
type OperationCategory =
  | 'read'      // 读取操作
  | 'write'     // 写入操作
  | 'delete'    // 删除操作
  | 'execute'   // 命令执行
  | 'network'   // 网络请求
  | 'system'    // 系统操作
  | 'sensitive' // 敏感数据操作
```

### 预定义敏感操作

```typescript
SENSITIVE_OPERATIONS = [
  // 文件写入
  { tool: 'write', level: 'medium', risk: '将写入或覆盖文件内容' },
  
  // 文件编辑
  { tool: 'edit', level: 'medium', risk: '将修改文件内容' },
  
  // 命令执行
  { tool: 'exec', level: 'high', risk: '将执行系统命令' },
  
  // 敏感文件读取
  { tool: 'read', level: 'high', 
    check: (params) => {
      // .env, secret, password, .pem 等敏感文件
      return SENSITIVE_PATTERNS.test(params.path);
    }
  },
];
```

### 确认策略

```typescript
interface ConfirmationPolicy {
  mode: 'always' | 'on-risk' | 'off';
  minLevel: SensitivityLevel;
  skipTools: string[];
  alwaysConfirm: string[];
}
```

### 授权记忆（分级）

```typescript
type RememberScope = 
  | 'once'    // 仅本次（不记住）
  | 'tool'    // 记住整个工具的所有操作
  | 'pattern' // 记住特定模式（如目录前缀）
```

用户选择授权后，可记住到不同级别，避免重复询问。

---

## 2. 审计日志系统 (`src/core/audit.ts`)

### 日志条目

```typescript
interface AuditEntry {
  timestamp: string;      // 时间戳
  agentId: string;        // Agent ID
  sessionKey: string;     // 会话 Key
  tool: string;           // 工具名称
  category: 'read' | 'write' | 'execute' | 'network' | 'other';
  params: Record<string, unknown>;  // 参数摘要
  result: 'success' | 'failure' | 'cancelled';
  error?: string;         // 错误信息
  duration?: number;      // 执行时长 (ms)
}
```

### 敏感参数过滤

```typescript
sanitizeParams(params) {
  // password, token, secret, key, credential → ***REDACTED***
  // 长字符串 → truncated
}
```

### 日志功能

| 功能 | 说明 |
|------|------|
| `log()` | 记录审计日志 |
| `readRecent()` | 读取最近日志 |
| `search()` | 按条件搜索 |
| `getStats()` | 获取统计信息 |

---

## 3. 工具权限策略 (`src/core/types.ts`)

### 工具策略配置

```typescript
interface ToolPolicy {
  profile?: 'minimal' | 'coding' | 'messaging' | 'full';
  allow?: string[];   // 允许的工具
  deny?: string[];    // 禁止的工具（优先级最高）
  exec?: ExecPolicy;  // 命令执行策略
}
```

### 命令执行策略

```typescript
interface ExecPolicy {
  security: 'deny' | 'allowlist' | 'full';
  ask: 'off' | 'on-miss' | 'always';
  allowlist?: string[];
}
```

| 安全模式 | 说明 |
|---------|------|
| `deny` | 全部禁止执行命令 |
| `allowlist` | 仅白名单命令可执行 |
| `full` | 允许执行任意命令 |

| 确认模式 | 说明 |
|---------|------|
| `off` | 不确认 |
| `on-miss` | 白名单外需确认 |
| `always` | 总是确认 |

---

## 4. 工作空间隔离 (`src/tools/fs.ts`)

### 路径验证

```typescript
function validatePath(path: string, workspace: string) {
  const resolved = resolve(workspace, path);
  const relativePath = relative(workspace, resolved);
  
  // 检查是否在 workspace 内
  const isWithinWorkspace = 
    !relativePath.startsWith('..') && 
    !relativePath.startsWith('/');
  
  if (!isWithinWorkspace) {
    return { error: '路径超出 workspace 范围' };
  }
}
```

### 效果

```
workspace: /home/user/project

✅ 允许: /home/user/project/src/file.ts
✅ 允许: src/file.ts
❌ 禁止: /etc/passwd
❌ 禁止: ../secret.env
```

---

## 5. 安全命令白名单

```typescript
SAFE_COMMAND_PATTERNS = [
  // 文件浏览（只读）
  /^ls(\s|$)/,
  /^cat\s/,
  /^head\s/,
  /^tail\s/,
  
  // 系统信息（只读）
  /^whoami$/,
  /^date(\s|$)/,
  /^uname(\s|$)/,
  
  // Git 只读
  /^git\s+status/,
  /^git\s+log/,
  /^git\s+diff/,
  
  // Node 项目信息
  /^npm\s+list/,
  /^node\s+--version/,
];
```

### 效果

```
✅ ls -la          → 无需确认
✅ cat file.txt    → 无需确认
❌ rm -rf /        → 必须确认
❌ npm publish     → 必须确认
```

---

## 6. 多 Agent 隔离

### Agent 配置示例

```yaml
agents:
  dev:
    workspace: /workspace/dev
    tools:
      profile: coding
      exec:
        security: allowlist
        allowlist: [npm, git, node]
  
  support:
    workspace: /workspace/support
    tools:
      profile: minimal
      deny: [exec, write]
```

### 隔离效果

```
dev Agent:
  ✅ workspace: /workspace/dev
  ✅ 执行命令: npm, git, node
  ❌ 访问: /workspace/support

support Agent:
  ✅ workspace: /workspace/support
  ❌ 禁止执行命令
  ❌ 禁止写入文件
```

---

## 7. 安全配置示例

```json
{
  "agentId": "dev",
  "workspace": "/workspace/dev",
  "tools": {
    "profile": "coding",
    "exec": {
      "security": "allowlist",
      "ask": "on-miss",
      "allowlist": [
        "npm run *",
        "npm test",
        "git status",
        "git diff",
        "git log",
        "node --version"
      ]
    }
  },
  "confirmation": {
    "mode": "on-risk",
    "minLevel": "medium"
  },
  "audit": {
    "enabled": true,
    "logParams": true,
    "retentionDays": 30
  }
}
```

---

## 8. 安全检查流程

```
工具调用请求
    │
    ▼
┌───────────────────┐
│ 权限策略检查       │
│ - profile?        │
│ - deny 列表?      │
│ - allow 列表?     │
└─────────┬─────────┘
          │
          ▼ 通过
┌───────────────────┐
│ 敏感级别评估       │
│ - 操作类型        │
│ - 参数内容        │
│ - 文件路径        │
└─────────┬─────────┘
          │
          ▼ 级别 >= minLevel
┌───────────────────┐
│ 用户确认          │
│ - 显示风险        │
│ - 可记忆选择      │
└─────────┬─────────┘
          │
          ▼ 确认
┌───────────────────┐
│ 执行工具          │
│ - 路径验证        │
│ - 工作空间隔离    │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 记录审计日志       │
│ - 时间戳          │
│ - 参数(脱敏)      │
│ - 结果            │
└───────────────────┘
```

---

## 9. 公司级安全优势

| 安全特性 | 说明 | 价值 |
|---------|------|------|
| 多 Agent 隔离 | 不同用途独立 Agent | 职责分离 |
| 工作空间隔离 | 路径验证防越权 | 数据隔离 |
| 敏感操作确认 | 风险操作需确认 | 防误操作 |
| 审计日志 | 所有操作可追溯 | 合规审计 |
| 命令白名单 | 只允许安全命令 | 防恶意命令 |
| 敏感文件保护 | 敏感文件需确认 | 防泄露 |
| 本地模型 | 数据不出本机 | 数据隐私 |
| 会话持久化 | 本地存储 | 数据可控 |

---

## 10. 与 OpenClaw 的安全对比

| 特性 | SecureBot | OpenClaw |
|------|-----------|----------|
| **网络访问** | 默认禁用 | 默认启用 |
| **命令执行** | 白名单模式 | 允许列表 |
| **确认系统** | 五级敏感度 | 简单确认 |
| **审计日志** | 内置完整审计 | 无 |
| **Agent 隔离** | 工作空间隔离 | 共享工作空间 |
| **授权记忆** | 三级记忆 (once/tool/pattern) | 单一记忆 |
| **敏感文件** | 自动检测敏感文件 | 无特殊处理 |
| **路径验证** | 严格工作空间隔离 | 相对宽松 |
| **数据流向** | 完全本地 | 支持云端模型 |

### 适用场景

| 场景 | 推荐 |
|------|------|
| 企业内部开发 | SecureBot |
| 敏感数据处理 | SecureBot |
| 个人项目 | OpenClaw |
| 需要网络访问 | OpenClaw |
| 合规审计要求 | SecureBot |
| 多团队协作 | SecureBot |

---

## 11. 最佳实践建议

### 企业部署

1. **配置严格的工具策略**
   ```json
   {
     "tools": {
       "profile": "minimal",
       "deny": ["exec", "browser"],
       "exec": { "security": "deny" }
     }
   }
   ```

2. **启用审计日志**
   ```json
   {
     "audit": {
       "enabled": true,
       "logParams": true,
       "retentionDays": 90
     }
   }
   ```

3. **设置敏感操作确认**
   ```json
   {
     "confirmation": {
       "mode": "on-risk",
       "minLevel": "low"
     }
   }
   ```

### 个人使用

1. 使用 `profile: coding` 获得开发工具支持
2. 设置 `ask: on-miss` 平衡安全与效率
3. 定期查看审计日志了解使用情况

---

## 12. 安全配置模板

### 严格模式（金融/医疗）

```json
{
  "confirmation": { "mode": "always", "minLevel": "low" },
  "audit": { "enabled": true, "logParams": true, "retentionDays": 365 },
  "tools": { 
    "profile": "minimal",
    "deny": ["exec", "browser", "web_fetch"]
  }
}
```

### 开发模式（技术团队）

```json
{
  "confirmation": { "mode": "on-risk", "minLevel": "medium" },
  "audit": { "enabled": true, "logParams": false, "retentionDays": 30 },
  "tools": {
    "profile": "coding",
    "exec": { 
      "security": "allowlist",
      "ask": "on-miss",
      "allowlist": ["npm", "git", "node", "python"]
    }
  }
}
```

### 支持模式（客服团队）

```json
{
  "confirmation": { "mode": "on-risk", "minLevel": "medium" },
  "audit": { "enabled": true, "logParams": true, "retentionDays": 90 },
  "tools": { 
    "profile": "messaging",
    "deny": ["exec", "write", "edit"]
  }
}
```

---

## 总结

SecureBot 通过多层安全机制，实现了企业级的数据安全保障：

1. **预防**：权限策略、工作空间隔离、命令白名单
2. **控制**：敏感操作确认、分级授权记忆
3. **追溯**：完整审计日志、参数脱敏
4. **隔离**：多 Agent 独立工作空间

相比 OpenClaw，SecureBot 更适合对数据安全有严格要求的企业环境。