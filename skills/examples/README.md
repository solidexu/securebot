# 示例技能目录

本目录包含用于演示和测试的示例技能，**不参与生产环境激活**。

## 示例技能列表

### web-research
- **用途**：演示 `requires_toolsets: [web]` 条件激活
- **场景**：web 工具集可用时显示

### basic-research
- **用途**：演示 `fallback_for_toolsets: [full_stack]` 反向依赖
- **场景**：full_stack 工具集不可用时显示（fallback）

### browser-automation
- **用途**：演示 `requires_toolsets: [browser]` + `platforms` 条件
- **场景**：browser 工具集可用 + macOS/Linux 平台时显示

## 测试验证

这些技能用于验证技能条件激活功能，可通过以下方式测试：

```bash
# 运行条件激活测试
npm test -- src/core/skills/skill-conditions.test.ts

# 运行两阶段激活测试
npm test -- src/core/skills/two-stage-activation.test.ts
```

## 注意事项

- 示例技能**不会**在生产环境中被自动激活
- 仅用于文档说明和测试验证
- 如需在生产环境使用，请移到 `skills/public/` 目录

