# 错误分级处理

SecureBot 实现了智能的错误分级处理系统，自动识别错误类型并采取相应策略。

## 概述

错误处理系统提供：
- 自动错误分类
- 智能重试策略
- 降级方案
- 用户介入点

## CLI 命令

### 查看错误统计

```bash
/errors
```

显示：
- 总错误数
- 按类型分类统计
- 按严重程度统计
- 最近错误列表

### 清除错误日志

```bash
/errors clear
```

## 错误类型

| 类型 | 说明 | 典型错误 |
|------|------|---------|
| network | 网络错误 | ECONNREFUSED, ETIMEDOUT |
| timeout | 超时错误 | 请求超时 |
| permission | 权限错误 | EACCES, EPERM |
| resource | 资源错误 | ENOENT, 文件不存在 |
| validation | 验证错误 | 参数无效 |
| logic | 逻辑错误 | TypeError, ReferenceError |
| rate_limit | 速率限制 | 429 Too Many Requests |
| service | 服务错误 | 500, 503 |
| unknown | 未知错误 | 无法分类的错误 |

## 错误严重程度

| 级别 | 说明 | 处理策略 |
|------|------|---------|
| low | 低风险 | 自动重试或跳过 |
| medium | 中风险 | 降级或询问用户 |
| high | 高风险 | 询问用户或中止 |
| critical | 致命 | 立即中止 |

## 处理策略

### 重试 (retry)

适用于可恢复的临时错误：
- 网络错误
- 超时错误
- 速率限制
- 服务暂时不可用

**重试策略**：
- 最大重试次数: 3
- 初始延迟: 1秒
- 指数退避: 2倍
- 最大延迟: 30秒

### 降级 (fallback)

主工具失败时使用备用方案：
- `web_fetch` → `web_search`
- `exec` → `read/write`
- `browser` → `web_fetch`

### 跳过 (skip)

低风险错误，可以安全忽略。

### 询问用户 (ask_user)

需要用户决策：
- 高风险操作
- 多个可选方案
- 权限问题

### 中止 (abort)

无法继续执行：
- 致命错误
- 用户取消

## 编程接口

### 错误处理

```typescript
import { getErrorHandler, RetryExecutor } from './core/error-handler.js';

const errorHandler = getErrorHandler();

// 处理错误
const result = await errorHandler.handle(error, {
  tool: 'web_fetch',
  params: { url: 'https://example.com' },
});

console.log(result.strategy);  // 'retry' | 'fallback' | 'skip' | 'ask_user' | 'abort'
```

### 带重试执行

```typescript
const executor = new RetryExecutor(errorHandler);

const result = await executor.execute(
  async () => {
    // 可能失败的操作
    return await fetchData();
  },
  {
    tool: 'fetch',
    onRetry: (attempt, delay) => {
      console.log(`重试 ${attempt}，延迟 ${delay}ms`);
    },
  }
);
```

### 自定义用户介入

```typescript
errorHandler.setUserInterventionHandler(async (prompt, options) => {
  // 自定义用户交互
  const choice = await askUser(prompt, options);
  return choice;
});
```

## 配置

在 `~/.securebot/config.json` 中配置：

```json5
{
  errorHandler: {
    retry: {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      retryableTypes: ['network', 'timeout', 'rate_limit', 'service'],
    },
    fallback: {
      toolFallbacks: {
        'web_fetch': ['web_search', 'cached_content'],
        'exec': ['read', 'write'],
      },
    },
    enableLogging: true,
  },
}
```

## 错误日志

所有错误都会记录到日志：

```bash
~/.securebot/logs/errors.log
```

日志格式：
```json
{
  "id": "err-1710123456789-abcd",
  "type": "network",
  "severity": "low",
  "message": "ECONNREFUSED",
  "tool": "web_fetch",
  "timestamp": 1710123456789,
  "retryCount": 2
}
```

## 最佳实践

1. **区分错误类型** - 网络错误重试，逻辑错误上报
2. **合理设置重试** - 避免无限重试
3. **提供降级方案** - 关键功能要有备用
4. **用户友好提示** - 遇到错误给出清晰建议