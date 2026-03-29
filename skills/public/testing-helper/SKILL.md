---
name: testing-helper
description: 当用户需要编写测试、设计测试用例或改进测试覆盖率时使用。提供单元测试、集成测试、E2E 测试的编写指导和最佳实践。
---

# 测试助手技能

## 概述

此技能提供测试编写的最佳实践和指导，帮助用户编写高质量的测试代码。

## 何时使用

- 用户需要编写单元测试
- 用户想提高测试覆盖率
- 用户需要设计测试用例
- 用户遇到测试问题需要帮助

## 测试类型

### 1. 单元测试 (Unit Test)

测试单个函数或类的行为。

```python
# Python (pytest)
def test_user_creation():
    user = User(name="Alice", email="alice@example.com")
    assert user.name == "Alice"
    assert user.is_valid() == True
```

```typescript
// TypeScript (Jest)
describe('UserService', () => {
  it('should create user with valid data', () => {
    const user = new User('Alice', 'alice@example.com');
    expect(user.name).toBe('Alice');
    expect(user.isValid()).toBe(true);
  });
});
```

### 2. 集成测试 (Integration Test)

测试多个组件之间的交互。

```typescript
describe('API Integration', () => {
  it('should create and retrieve user', async () => {
    // 创建用户
    const createRes = await request(app)
      .post('/api/users')
      .send({ name: 'Alice', email: 'alice@example.com' });
    expect(createRes.status).toBe(201);

    // 获取用户
    const getRes = await request(app)
      .get(`/api/users/${createRes.body.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.name).toBe('Alice');
  });
});
```

### 3. E2E 测试 (End-to-End Test)

测试完整的用户流程。

```typescript
// Playwright
test('user can login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name="email"]', 'alice@example.com');
  await page.fill('[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  
  await expect(page).toHaveURL('/dashboard');
  await expect(page.locator('.welcome')).toContainText('Alice');
});
```

## 测试模式

### AAA 模式 (Arrange-Act-Assert)

```typescript
it('should calculate total price', () => {
  // Arrange - 准备测试数据
  const cart = new Cart();
  cart.add({ name: 'Apple', price: 1.5, quantity: 2 });
  cart.add({ name: 'Banana', price: 0.8, quantity: 3 });

  // Act - 执行被测试的操作
  const total = cart.calculateTotal();

  // Assert - 验证结果
  expect(total).toBe(5.4);
});
```

### Given-When-Then 模式

```typescript
describe('User Registration', () => {
  it('should register new user with valid data', () => {
    // Given - 用户在注册页面
    const formData = { email: 'test@example.com', password: 'Password123!' };

    // When - 提交注册表单
    const result = registerUser(formData);

    // Then - 应该成功注册
    expect(result.success).toBe(true);
    expect(result.user.email).toBe('test@example.com');
  });
});
```

## 测试原则

### FIRST 原则

| 原则 | 说明 |
|------|------|
| **F**ast | 测试应该快速执行 |
| **I**ndependent | 测试之间不应有依赖 |
| **R**epeatable | 测试应该可重复执行 |
| **S**elf-validating | 测试应该自动验证结果 |
| **T**imely | 测试应该及时编写 |

### 测试覆盖维度

| 维度 | 示例 |
|------|------|
| 正常路径 | 输入有效数据，期望成功 |
| 边界条件 | 空输入、最大值、最小值 |
| 异常情况 | 无效输入、网络错误、权限不足 |
| 并发场景 | 多用户同时操作 |

## Mock 和 Stub

### Mock 函数

```typescript
// Jest
const mockCallback = jest.fn(x => 42 + x);
forEach([0, 1], mockCallback);

expect(mockCallback.mock.calls.length).toBe(2);
expect(mockCallback.mock.calls[0][0]).toBe(0);
```

### Mock 模块

```typescript
// Mock 整个模块
jest.mock('../api/client');
import { apiClient } from '../api/client';

(apiClient.get as jest.Mock).mockResolvedValue({ data: 'mocked' });
```

### Spy

```typescript
// 监视函数调用但不改变行为
const spy = jest.spyOn(console, 'log');
doSomething();
expect(spy).toHaveBeenCalledWith('expected message');
spy.mockRestore();
```

## 测试夹具 (Fixtures)

### 工厂函数

```typescript
function createTestUser(overrides = {}) {
  return {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    ...overrides,
  };
}

// 使用
const user1 = createTestUser();
const user2 = createTestUser({ name: 'Custom Name' });
```

### 测试数据

```typescript
// fixtures/users.ts
export const testUsers = {
  valid: { name: 'Alice', email: 'alice@example.com' },
  invalidEmail: { name: 'Bob', email: 'invalid-email' },
  missingName: { name: '', email: 'charlie@example.com' },
};
```

## 测试覆盖率

### 配置

```json
// jest.config.js
{
  "collectCoverage": true,
  "coverageThreshold": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    }
  }
}
```

### 报告

```bash
# 运行测试并生成覆盖率报告
jest --coverage

# 输出示例
----------|---------|----------|---------|---------|
File      | % Stmts | % Branch | % Funcs | % Lines |
----------|---------|----------|---------|---------|
All files |   85.71 |    78.26 |   90.00 |   85.71 |
 utils.js |   95.00 |    88.89 |  100.00 |   95.00 |
 api.js   |   76.47 |    66.67 |   80.00 |   76.47 |
----------|---------|----------|---------|---------|
```

## 常见测试场景

### 异步测试

```typescript
// Promise
it('should fetch user', async () => {
  const user = await fetchUser(1);
  expect(user.name).toBe('Alice');
});

// Callback
it('should call callback', (done) => {
  fetchData((result) => {
    expect(result).toBe('data');
    done();
  });
});
```

### 错误测试

```typescript
it('should throw error for invalid input', () => {
  expect(() => parseJSON('invalid')).toThrow();
  expect(() => divide(1, 0)).toThrow('Division by zero');
});

it('should reject promise', async () => {
  await expect(fetchInvalidUser()).rejects.toThrow('User not found');
});
```

### 参数化测试

```typescript
// Jest
test.each([
  [1, 1, 2],
  [1, 2, 3],
  [2, 2, 4],
])('add(%i, %i) = %i', (a, b, expected) => {
  expect(add(a, b)).toBe(expected);
});
```

## 最佳实践

1. **测试行为，而非实现**：关注输入输出，而非内部实现
2. **一个测试一个断言**：每个测试只验证一个行为
3. **有意义的测试名称**：描述测试的场景和期望
4. **保持测试简单**：避免在测试中使用复杂逻辑
5. **及时修复失败的测试**：失败测试意味着代码有问题
6. **定期运行测试**：在 CI/CD 中自动运行