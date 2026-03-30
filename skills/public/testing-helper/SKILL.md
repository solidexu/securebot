---
name: testing-helper
description: |
  当用户需要编写测试、设计测试用例或改进测试覆盖率时使用。
  即使用户没有明确说"测试"，只要提到"写测试"、"单元测试"、"测试用例"、"测试覆盖率"、"pytest"、"jest"等相关请求，都应该使用此技能。
  提供单元测试、集成测试、E2E 测试的编写指导和最佳实践。
version: "1.0.0"
keywords:
  - 测试
  - 单元测试
  - 集成测试
  - E2E测试
  - pytest
  - jest
  - 测试覆盖率
metadata:
  openclaw:
    emoji: "🧪"
    requires:
      bins: [python3, npm]
---

# 测试助手技能

提供测试编写的最佳实践和指导，帮助用户编写高质量的测试代码。

## 何时使用

- 用户需要编写单元测试
- 用户想提高测试覆盖率
- 用户需要设计测试用例
- 用户遇到测试问题需要帮助

## 测试类型

### 1. 单元测试

```python
def test_user_creation():
    user = User(name="Alice", email="alice@example.com")
    assert user.name == "Alice"
    assert user.is_valid() == True
```

### 2. 集成测试

```typescript
describe('API Integration', () => {
  it('should create and retrieve user', async () => {
    const res = await request(app).post('/api/users').send({ name: 'Alice' });
    expect(res.status).toBe(201);
  });
});
```

## 测试原则 (FIRST)

| 原则 | 说明 |
|------|------|
| **F**ast | 测试应该快速执行 |
| **I**ndependent | 测试之间不应有依赖 |
| **R**epeatable | 测试应该可重复执行 |
| **S**elf-validating | 测试应该自动验证结果 |
| **T**imely | 测试应该及时编写 |

## 测试覆盖维度

| 维度 | 示例 |
|------|------|
| 正常路径 | 输入有效数据，期望成功 |
| 边界条件 | 空输入、最大值、最小值 |
| 异常情况 | 无效输入、网络错误 |

## 最佳实践

1. **测试行为，而非实现**
2. **一个测试一个断言**
3. **有意义的测试名称**
4. **保持测试简单**