# Plan 状态机 v3 实施计划

> 基于 `docs/plan-state-machine-v3.md` 方案

---

## 开发任务

### Phase 1: 类型扩展 (smart-task.ts)

**目标**: 扩展 TaskStep 类型，添加工具调用追踪

#### 1.1 扩展类型定义

```typescript
// src/core/smart-task.ts

export interface TaskStep {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: string;
  dependencies?: string[];
  estimatedMinutes?: number;
  priority?: 'low' | 'medium' | 'high';
  
  // ★ 新增: 工具调用追踪
  toolCalls?: Array<{
    tool: string;
    args: Record<string, unknown>;
    result: 'success' | 'failed';
    error?: string;
    timestamp: string;
  }>;
  
  // ★ 新增: 引导追踪
  guidanceCount?: number;
  lastGuidance?: string;
}
```

#### 1.2 添加工具调用记录函数

```typescript
export function recordToolCall(
  plan: TaskPlan,
  stepId: string,
  tool: string,
  args: Record<string, unknown>,
  result: 'success' | 'failed',
  error?: string
): void { ... }
```

#### 1.3 添加步骤完成检查函数

```typescript
export interface StepCheckResult {
  complete: boolean;
  errorType?: 'no_tool_call' | 'irrelevant_tool' | 'wrong_step' | 'tool_failed';
  diagnosis: string;
  guidance: string;
}

export function checkStepCompletion(
  step: TaskStep,
  modelOutput: string,
  toolCalls: TaskStep['toolCalls']
): StepCheckResult { ... }
```

#### 1.4 添加引导消息生成函数

```typescript
function buildGuidance(
  errorType: StepCheckResult['errorType'],
  step: TaskStep,
  context: Record<string, any>
): string { ... }

function suggestToolsForStep(stepDescription: string): string[] { ... }
```

#### 1.5 添加工具相关性判断函数

```typescript
function filterRelevantCalls(
  stepDescription: string,
  calls: NonNullable<TaskStep['toolCalls']>
): NonNullable<TaskStep['toolCalls']> { ... }
```

---

### Phase 2: 集成到执行循环 (repl-message.ts)

**目标**: 在工具执行循环中记录调用、检测错误、引导纠正

#### 2.1 记录工具调用

位置: 工具执行循环内

```typescript
// 在 for (const toolCall of result.toolCalls) 循环中
const toolResult = await executeToolCall(toolCall);

// ★ 记录工具调用
if (currentPlan) {
  const currentStep = currentPlan.steps.find(s => s.status === 'in_progress');
  if (currentStep) {
    recordToolCall(
      currentPlan,
      currentStep.id,
      toolCall.name,
      toolCall.arguments,
      toolResult.success ? 'success' : 'failed',
      toolResult.error
    );
    savePlanToSession(session, currentPlan);
  }
}
```

#### 2.2 步骤完成检查与引导

位置: 工具执行循环结束后

```typescript
// 检查步骤完成
if (currentPlan) {
  const currentStep = currentPlan.steps.find(s => s.status === 'in_progress');
  
  if (currentStep) {
    const toolCalls = currentStep.toolCalls || [];
    const modelOutput = result.content || '';
    
    const checkResult = checkStepCompletion(currentStep, modelOutput, toolCalls);
    
    console.log(chalk.gray(`[DEBUG] ${checkResult.diagnosis}`));
    
    if (checkResult.complete) {
      // 验证通过，推进步骤
      const nextStep = advanceToNextStep(currentPlan, session);
      // ... 显示进度 ...
    } else {
      // 有问题，添加引导消息
      const guidanceCount = (currentStep.guidanceCount || 0) + 1;
      currentStep.guidanceCount = guidanceCount;
      
      if (guidanceCount > 3) {
        // 多次引导无效，让用户介入
        // ... 显示选项 ...
      } else {
        console.log(chalk.yellow(`\n引导模型纠正 (第 ${guidanceCount} 次)...`));
        addUserMessage(session, checkResult.guidance);
      }
      
      savePlanToSession(session, currentPlan);
    }
  }
}
```

---

### Phase 3: 测试

#### 3.1 单元测试 (smart-task.test.ts)

- [ ] `recordToolCall` 记录工具调用
- [ ] `checkStepCompletion` 检测各种错误类型
- [ ] `buildGuidance` 生成引导消息
- [ ] `filterRelevantCalls` 工具相关性判断

#### 3.2 集成测试

- [ ] 模型只说不做 → 自动引导
- [ ] 模型做错事 → 自动引导
- [ ] 引导超过3次 → 让用户选择
- [ ] 正常完成 → 推进步骤

---

## 文件修改清单

| 文件 | 修改内容 |
|------|---------|
| `src/core/smart-task.ts` | 扩展类型、添加检查函数 |
| `src/cli/repl-message.ts` | 集成错误检测和引导 |
| `src/core/smart-task.test.ts` | 单元测试 |

---

## 实施顺序

```
1. smart-task.ts
   ├── 扩展 TaskStep 类型
   ├── recordToolCall 函数
   ├── checkStepCompletion 函数
   ├── buildGuidance 函数
   └── filterRelevantCalls 函数

2. repl-message.ts
   ├── 工具执行循环中记录调用
   └── 步骤完成检查与引导

3. 测试
   ├── 单元测试
   └── 手动集成测试
```

---

## 预期效果

### Before

```
模型: "已完成：创建目录"
系统: (无检测，直接推进) ❌
```

### After

```
模型: "已完成：创建目录"
系统检测: 没有工具调用
系统引导: "你说'已完成'但没有调用任何工具，请调用 exec 工具"
模型: 调用 exec (mkdir -p project)
系统: 验证通过，推进步骤 ✅
```

---

## 开始实施

准备修改 `src/core/smart-task.ts`？