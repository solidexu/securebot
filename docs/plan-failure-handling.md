# Plan 状态机 - 失败处理流程

## 状态定义

```typescript
type StepStatus = 
  | 'pending'      // 等待执行
  | 'in_progress'  // 执行中
  | 'verifying'    // 验证中
  | 'completed'    // 已完成
  | 'failed'       // 执行失败
  | 'skipped'      // 已跳过
```

---

## 失败场景

### 1. 工具执行失败

**触发条件**：工具返回错误

```
步骤: 创建项目目录
工具: exec (mkdir -p /root/project)
结果: mkdir: permission denied
状态: in_progress → failed
```

### 2. 验证失败

**触发条件**：工具执行成功但结果不符合预期

```
步骤: 创建 README.md 文件
工具: write (README.md, "Hello")
验证: 文件是否存在？
结果: 文件未找到（可能是路径错误）
状态: verifying → in_progress (重试)
```

### 3. 用户取消

**触发条件**：用户拒绝执行敏感操作

```
步骤: 删除旧代码
工具: exec (rm -rf old_code)
确认: 用户点击"取消"
状态: in_progress → pending
```

---

## 失败处理流程

### 流程图

```
                    工具执行失败
                         │
                         ▼
              ┌─────────────────────┐
              │   标记为 failed     │
              │   记录失败原因      │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  失败次数 < 3 ?     │
              └──────────┬──────────┘
                    │           │
                   Yes          No
                    │           │
                    ▼           ▼
         ┌──────────────┐  ┌──────────────┐
         │ 自动重试     │  │ 询问用户     │
         │ 重置状态为   │  │ 1. 重试      │
         │ in_progress  │  │ 2. 跳过      │
         └──────────────┘  │ 3. 停止      │
                           └──────────────┘
```

### 代码实现

```typescript
class PlanTracker {
  private maxRetries = 3;
  private failureCount = new Map<string, number>();
  
  /** 记录工具执行失败 */
  recordToolFailure(stepId: string, error: string): FailureResult {
    const step = this.getStep(stepId);
    
    // 记录工具调用失败
    step.toolCalls.push({
      tool: 'unknown',
      args: {},
      result: 'failed',
      error,
      timestamp: new Date(),
    });
    
    // 增加失败计数
    const failures = (this.failureCount.get(stepId) || 0) + 1;
    this.failureCount.set(stepId, failures);
    
    // 判断是否自动重试
    if (failures < this.maxRetries) {
      // 自动重试：保持 in_progress
      console.log(chalk.yellow(`步骤失败 (第 ${failures} 次)，自动重试...`));
      return { action: 'retry', reason: error };
    } else {
      // 失败次数过多，标记为 failed
      step.status = 'failed';
      step.error = error;
      this.savePlan();
      
      return { action: 'ask_user', reason: `已连续失败 ${failures} 次` };
    }
  }
  
  /** 用户选择处理 */
  async handleUserChoice(stepId: string, choice: 'retry' | 'skip' | 'stop'): Promise<void> {
    const step = this.getStep(stepId);
    
    switch (choice) {
      case 'retry':
        // 重试：重置状态和计数
        step.status = 'in_progress';
        this.failureCount.set(stepId, 0);
        break;
        
      case 'skip':
        // 跳过：标记为 skipped
        step.status = 'skipped';
        step.skippedAt = new Date();
        step.skipReason = '用户选择跳过';
        // 推进到下一步
        this.advanceToNextStep();
        break;
        
      case 'stop':
        // 停止：保持 failed 状态，保存进度
        step.status = 'failed';
        break;
    }
    
    this.savePlan();
  }
  
  /** 推进到下一步 */
  private advanceToNextStep(): void {
    const nextStep = this.plan.steps.find(s => s.status === 'pending');
    if (nextStep) {
      nextStep.status = 'in_progress';
      nextStep.startedAt = new Date();
    }
  }
}
```

---

## 验证失败处理

验证失败与工具执行失败不同：

| 类型 | 触发 | 状态变化 |
|------|------|----------|
| 工具执行失败 | 工具返回错误 | `in_progress → failed` |
| 验证失败 | 工具成功但结果不对 | `verifying → in_progress` |

### 验证失败流程

```typescript
/** 验证步骤是否真正完成 */
async validateStep(stepId: string): Promise<ValidationResult> {
  const step = this.getStep(stepId);
  
  // 进入验证状态
  step.status = 'verifying';
  this.savePlan();
  
  // 执行验证
  const validator = this.getValidator(step);
  const result = await validator.validate(step);
  
  if (result.passed) {
    // 验证通过
    step.status = 'completed';
    step.completedAt = new Date();
    this.savePlan();
    
    return { success: true };
  } else {
    // 验证失败：回到 in_progress，让模型重试
    step.status = 'in_progress';
    this.savePlan();
    
    return { 
      success: false, 
      reason: result.reason,
      suggestions: result.suggestions,
    };
  }
}
```

---

## 完整状态流转表

| 当前状态 | 事件 | 目标状态 | 说明 |
|----------|------|----------|------|
| pending | start | in_progress | 开始执行 |
| in_progress | tool_success | verifying | 进入验证 |
| in_progress | tool_fail (retry < 3) | in_progress | 自动重试 |
| in_progress | tool_fail (retry >= 3) | failed | 询问用户 |
| in_progress | user_cancel | pending | 用户取消 |
| verifying | validate_pass | completed | 验证通过 |
| verifying | validate_fail | in_progress | 验证失败重试 |
| failed | user_retry | in_progress | 用户重试 |
| failed | user_skip | skipped | 用户跳过 |
| failed | user_stop | failed | 停止任务 |
| skipped | - | - | 最终状态 |

---

## 用户交互

失败次数过多时，显示选项：

```
⚠️ 步骤执行失败

步骤: 创建项目目录
原因: mkdir: permission denied
已尝试: 3 次

请选择:
  [r] 重试 - 重置计数，重新执行
  [s] 跳过 - 跳过此步骤，继续下一步
  [q] 停止 - 保存进度，停止任务
```

---

## 计划文件示例

### 失败状态

```markdown
### 2. 实现核心算法 ❌
- **状态**: failed
- **错误**: SyntaxError: Unexpected token
- **失败次数**: 3
- **最后尝试**: 2026-03-25 23:50:00
```

### 跳过状态

```markdown
### 3. 编写单元测试 ⏭️
- **状态**: skipped
- **跳过原因**: 用户选择跳过
- **跳过时间**: 2026-03-25 23:55:00
```

---

## 关键设计决策

### 1. 自动重试限制

**问题**：为什么限制 3 次？

**原因**：
- 防止无限循环
- 3 次失败通常意味着根本性问题
- 让用户参与决策

### 2. 验证失败 vs 工具失败

**区别**：
- 工具失败：外部错误（权限、网络等）
- 验证失败：逻辑错误（文件内容不对）

**处理**：
- 工具失败 → 计入重试次数
- 验证失败 → 不计入重试次数，给模型修正机会

### 3. 跳过后如何继续？

**问题**：跳过步骤后，后续步骤可能依赖它

**解决**：
1. 跳过时警告用户
2. 记录依赖关系
3. 后续步骤失败时提示可能原因

---

## 代码集成

```typescript
// src/cli/repl-message.ts

async function handleToolFailure(
  planTracker: PlanTracker,
  stepId: string,
  error: string
): Promise<void> {
  const result = planTracker.recordToolFailure(stepId, error);
  
  if (result.action === 'retry') {
    // 自动重试
    addUserMessage(session, 
      `步骤执行失败：${result.reason}\n\n请分析错误并尝试修复。`
    );
    continue;
  } else {
    // 询问用户
    console.log(chalk.red(`\n⚠️ 步骤执行失败`));
    console.log(chalk.yellow(`原因: ${result.reason}`));
    console.log();
    console.log(chalk.cyan('请选择:'));
    console.log(chalk.gray('  [r] 重试'));
    console.log(chalk.gray('  [s] 跳过'));
    console.log(chalk.gray('  [q] 停止'));
    
    const answer = await question('请选择 [r/s/q]: ');
    
    await planTracker.handleUserChoice(
      stepId, 
      answer as 'retry' | 'skip' | 'stop'
    );
    
    if (answer === 'r') {
      continue; // 重试
    } else if (answer === 's') {
      // 跳过，继续下一步
      const nextStep = planTracker.getNextStep();
      if (nextStep) {
        addUserMessage(session, 
          `已跳过失败步骤。继续执行：${nextStep.description}`
        );
      }
      continue;
    } else {
      // 停止
      console.log(chalk.green('✓ 进度已保存'));
      return;
    }
  }
}
```

---

## 总结

失败处理的关键：

1. **自动重试**：小错误自动恢复
2. **用户参与**：大问题让用户决策
3. **状态持久化**：每次状态变化都保存
4. **清晰反馈**：告诉用户发生了什么
5. **可恢复**：停止后可以继续