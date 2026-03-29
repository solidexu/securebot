# Agent 沙箱隔离方案

## 1. 设计目标

- **安全隔离**：每个 agent 运行在独立沙箱中，限制文件系统访问
- **灵活配置**：支持用户自定义允许访问的目录
- **透明可控**：访问新目录时需要用户确认
- **易于使用**：默认安全，无需复杂配置

## 2. 沙箱架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Host System                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    SecureBot Core                        ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      ││
│  │  │   Agent 1   │  │   Agent 2   │  │   Agent 3   │      ││
│  │  │  (Sandbox)  │  │  (Sandbox)  │  │  (Sandbox)  │      ││
│  │  │  ┌───────┐  │  │  ┌───────┐  │  │  ┌───────┐  │      ││
│  │  │  │workspace│ │  │  │workspace│ │  │  │workspace│ │      ││
│  │  │  └───────┘  │  │  └───────┘  │  │  └───────┘  │      ││
│  │  │  ┌───────┐  │  │  ┌───────┐  │  │  ┌───────┐  │      ││
│  │  │  │allowed │  │  │  │allowed │  │  │  │allowed │  │      ││
│  │  │  │  dirs  │  │  │  │  dirs  │  │  │  │  dirs  │  │      ││
│  │  │  └───────┘  │  │  └───────┘  │  │  └───────┘  │      ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘      ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## 3. 沙箱类型

### 3.1 推荐方案：Docker 容器（默认）

**优点**：
- 完整隔离，安全性最高
- 资源限制（CPU、内存、磁盘）
- 环境一致性
- 行业标准

**缺点**：
- 需要 Docker 环境
- 启动稍慢
- 资源开销

### 3.2 备选方案：bubblewrap（轻量级）

**优点**：
- 轻量级，启动快
- 无需 root 权限
- 低资源开销

**缺点**：
- 仅支持 Linux
- 隔离性不如 Docker

### 3.3 最小方案：路径白名单（无沙箱）

**优点**：
- 无依赖
- 零开销

**缺点**：
- 仅路径检查，非真正隔离
- 安全性最低

## 4. 配置结构

```typescript
interface SandboxConfig {
  /** 沙箱类型 */
  type: 'docker' | 'bubblewrap' | 'path-filter';
  
  /** 是否启用沙箱 */
  enabled: boolean;
  
  /** 工作区（自动挂载） */
  workspace: string;
  
  /** 允许访问的额外目录 */
  allowedDirs: AllowedDir[];
  
  /** 拒绝访问的目录（黑名单） */
  deniedDirs: string[];
  
  /** 资源限制 */
  resources?: {
    memory?: string;      // e.g., "512m"
    cpu?: number;         // CPU 核心数
    disk?: string;        // 磁盘限制
  };
  
  /** 网络配置 */
  network?: {
    enabled: boolean;
    allowedHosts?: string[];
  };
  
  /** 环境变量 */
  env?: Record<string, string>;
}

interface AllowedDir {
  /** 目录路径 */
  path: string;
  /** 访问模式 */
  mode: 'readonly' | 'readwrite';
  /** 授权时间 */
  authorizedAt: string;
  /** 授权原因 */
  reason?: string;
}
```

## 5. 工作流程

### 5.1 Agent 启动流程

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 用户启动请求  │ ──▶ │ 检查沙箱配置  │ ──▶ │ 配置存在？   │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                    ┌─────────────────────────────┴─────┐
                    │                                   │
                    ▼ 是                                ▼ 否
           ┌──────────────┐                    ┌──────────────┐
           │ 加载已有配置  │                    │ 创建默认沙箱  │
           └──────┬───────┘                    └──────┬───────┘
                  │                                   │
                  └─────────────┬─────────────────────┘
                                │
                                ▼
                       ┌──────────────┐
                       │ 启动沙箱容器  │
                       └──────┬───────┘
                              │
                              ▼
                       ┌──────────────┐
                       │ Agent 就绪   │
                       └──────────────┘
```

### 5.2 目录访问请求流程

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 工具请求路径  │ ──▶ │ 沙箱路径检查  │ ──▶ │ 在白名单？   │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                    ┌─────────────────────────────┴─────┐
                    │ 是                                │ 否
                    ▼                                   ▼
           ┌──────────────┐                    ┌──────────────┐
           │ 允许访问     │                    │ 请求用户授权  │
           └──────────────┘                    └──────┬───────┘
                                                      │
                              ┌───────────────────────┴─────┐
                              │                             │
                              ▼ 允许                        ▼ 拒绝
                     ┌──────────────┐              ┌──────────────┐
                     │ 添加到白名单  │              │ 拒绝访问     │
                     │ 继续执行     │              │ 返回错误     │
                     └──────────────┘              └──────────────┘
```

## 6. CLI 命令

```bash
# 查看沙箱状态
securebot sandbox status <agent-id>

# 列出允许的目录
securebot sandbox list <agent-id>

# 添加允许目录
securebot sandbox allow <agent-id> <path> [--readonly]

# 移除允许目录
securebot sandbox deny <agent-id> <path>

# 重置沙箱
securebot sandbox reset <agent-id>

# 进入沙箱 shell
securebot sandbox shell <agent-id>

# 查看沙箱日志
securebot sandbox logs <agent-id>
```

## 7. 示例配置

### 7.1 基础配置

```json
{
  "agents": {
    "pybro": {
      "sandbox": {
        "type": "docker",
        "enabled": true,
        "workspace": "/disk0/repo/openclaw/data/agents/py",
        "allowedDirs": [
          {
            "path": "/home/user/.cache/pip",
            "mode": "readwrite",
            "reason": "Python 包缓存"
          }
        ],
        "resources": {
          "memory": "1g",
          "cpu": 2
        }
      }
    }
  }
}
```

### 7.2 多项目配置

```json
{
  "agents": {
    "webdev": {
      "sandbox": {
        "type": "docker",
        "enabled": true,
        "workspace": "/projects/webapp",
        "allowedDirs": [
          {
            "path": "/projects/shared-lib",
            "mode": "readonly",
            "reason": "共享库"
          },
          {
            "path": "/home/user/.npm",
            "mode": "readwrite",
            "reason": "NPM 缓存"
          }
        ],
        "network": {
          "enabled": true,
          "allowedHosts": ["registry.npmjs.org", "github.com"]
        }
      }
    }
  }
}
```

## 8. 安全措施

### 8.1 默认安全策略

1. **最小权限原则**：默认只允许访问工作区
2. **路径规范化**：防止 `..` 跳转攻击
3. **符号链接检查**：防止通过软链接逃逸
4. **敏感目录保护**：自动拒绝 `/etc`, `/root`, `~/.ssh` 等

### 8.2 危险操作检测

```typescript
const DANGEROUS_PATHS = [
  '/etc/passwd',
  '/etc/shadow',
  '/root',
  '/.ssh',
  '/.gnupg',
  '/.config/credentials',
  '/var/log',
  '/proc',
  '/sys',
];

const DANGEROUS_COMMANDS = [
  'rm -rf /',
  'dd if=',
  'mkfs',
  'fdisk',
  ':(){ :|:& };:',  // fork bomb
];
```

### 8.3 审计日志

```
[SANDBOX] 2024-03-29 10:30:15 | pybro | ACCESS_ALLOWED | /workspace/src
[SANDBOX] 2024-03-29 10:30:20 | pybro | ACCESS_DENIED  | /etc/passwd
[SANDBOX] 2024-03-29 10:30:25 | pybro | ACCESS_REQUEST | /home/user/.cache
[SANDBOX] 2024-03-29 10:30:30 | USER   | ACCESS_GRANTED | /home/user/.cache
```

## 9. 实现优先级

| 阶段 | 内容 | 优先级 |
|------|------|--------|
| P0 | 路径白名单检查（无容器） | 高 |
| P0 | 目录授权请求流程 | 高 |
| P1 | Docker 容器集成 | 中 |
| P1 | 资源限制配置 | 中 |
| P2 | 网络隔离 | 低 |
| P2 | bubblewrap 支持 | 低 |

## 10. 用户交互示例

### 10.1 首次访问新目录

```
⚠️ 沙箱安全提示

Agent "pybro" 请求访问工作区以外的目录：
  📁 /home/user/.cache/pip

原因：安装 Python 包需要访问缓存目录

请选择：
  [a] 允许（读写）
  [r] 允许（只读）
  [d] 拒绝
  [A] 总是允许（记住此选择）

您的选择: a
✓ 已授权访问: /home/user/.cache/pip (读写)
```

### 10.2 危险操作警告

```
🚨 安全警告

Agent "pybro" 尝试访问敏感路径：
  📁 /etc/passwd

此操作已被自动拒绝。

如果您确实需要此访问，请：
  1. 使用 /sandbox allow pybro /etc/passwd --readonly
  2. 或修改配置文件手动授权
```