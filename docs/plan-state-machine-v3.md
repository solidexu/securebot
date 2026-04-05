# Plan 状态机设计

核心理念：检测错误 → 引导纠正 → 验证完成

## 核心洞察

### 模型会犯错

| 错误类型 | 表现 | 例子 |
|---------|------|------|
| **空口说完成** | 说"已完成"但没有工具调用 | "已完成：创建目录"（实际没调用 mkdir） |
| **只说不做** | 输出一堆内容但没有行动 | "让我来创建目录..."（然后就没有了） |
| **做了错事** | 调用了不相关的工具 | 步骤是"实现算法"，却调用了 `write readme.md` |
| **张冠李戴** | 记错了当前步骤 | 当前是"编写测试"，却说"已完成：实现算法" |

### 状态机的价值

**不仅是检测完成，更重要的是引导纠正**。

```
模型行为 → 检测错误 → 生成引导 → 模型纠正 → 验证完成
```

---

## 错误检测与引导策略

### 完整的错误检测逻辑

```typescript
interface StepCheckResult {
  /** 是否完成 */
  complete: boolean;
  /** 错误类型 */
  errorType?: 'no_tool_call' | 'irrelevant_tool' | 'wrong_step' | 'tool_failed';
  /** 诊断信息 */
  diagnosis: string;
  /** 引导消息 */
  guidance: string;
}

function checkStepCompletion(
  step: TaskStep,
  modelOutput: string,
  toolCalls: ToolCallRecord[]
): StepCheckResult {
  
  // ═══════════════════════════════════════════
  // 错误类型 1：没有工具调用
  // ═══════════════════════════════════════════
  const successCalls = toolCalls.filter(c => c.result === 'success');
  
  if (successCalls.length === 0) {
    // 检查模型是否说"已完成"
    if (/已完成[：:]/.test(modelOutput)) {
      return {
        complete: false,
        errorType: 'no_tool_call',
        diagnosis: '模型说"已完成"但没有调用任何工具',
        guidance: buildGuidance('no_tool_call', step, { modelSaidComplete: true }),
      };
    }
    
    // 检查是否有失败的工具调用
    const failedCalls = toolCalls.filter(c => c.result === 'failed');
    if (failedCalls.length > 0) {
      return {
        complete: false,
        errorType: 'tool_failed',
        diagnosis: `工具调用失败: ${failedCalls.map(c => c.tool).join(', ')}`,
        guidance: buildGuidance('tool_failed', step, { 
          failedTools: failedCalls.map(c => ({ tool: c.tool, error: c.error }))
        }),
      };
    }
    
    // 模型在说话但没行动
    return {
      complete: false,
      errorType: 'no_tool_call',
      diagnosis: '模型没有调用工具',
      guidance: buildGuidance('no_tool_call', step, { modelSaidComplete: false }),
    };
  }
  
  // ═══════════════════════════════════════════
  // 错误类型 2：工具调用不相关
  // ═══════════════════════════════════════════
  const relevantCalls = filterRelevantCalls(step.description, successCalls);
  
  if (relevantCalls.length === 0) {
    return {
      complete: false,
      errorType: 'irrelevant_tool',
      diagnosis: `工具调用与步骤不相关: ${successCalls.map(c => c.tool).join(', ')}`,
      guidance: buildGuidance('irrelevant_tool', step, {
        calledTools: successCalls.map(c => ({ tool: c.tool, args: c.args })),
      }),
    };
  }
  
  // ═══════════════════════════════════════════
  // 错误类型 3：步骤不匹配
  // ═══════════════════════════════════════════
  const mentionedStep = extractMentionedStep(modelOutput);
  
  if (mentionedStep && !isSimilarDescription(mentionedStep, step.description)) {
    return {
      complete: false,
      errorType: 'wrong_step',
      diagnosis: `模型提到步骤"${mentionedStep}"，但当前步骤是"${step.description}"`,
      guidance: buildGuidance('wrong_step', step, { mentionedStep }),
    };
  }
  
  // ═══════════════════════════════════════════
  // 验证通过
  // ═══════════════════════════════════════════
  if (/已完成[：:]/.test(modelOutput)) {
    return {
      complete: true,
      diagnosis: '验证通过',
      guidance: '',
    };
  }
  
  // 有正确的工具调用，但模型还没说完成
  return {
    complete: false,
    errorType: undefined,
    diagnosis: '工具调用正确，等待模型确认完成',
    guidance: `工具调用成功。如果步骤已完成，请说"已完成：${step.description}"。`,
  };
}
```

### 引导消息生成

```typescript
function buildGuidance(
  errorType: 'no_tool_call' | 'irrelevant_tool' | 'wrong_step' | 'tool_failed',
  step: TaskStep,
  context: Record<string, any>
): string {
  const lines: string[] = [];
  
  lines.push('## ⚠️ 步骤执行问题');
  lines.push('');
  lines.push(`**当前步骤**: ${step.description}`);
  lines.push('');
  
  switch (errorType) {
    // ───────────────────────────────────────
    // 错误 1：没有工具调用
    // ───────────────────────────────────────
    case 'no_tool_call':
      if (context.modelSaidComplete) {
        lines.push('**问题**: 你说"已完成"，但没有调用任何工具。');
        lines.push('');
        lines.push('**提醒**: 步骤完成需要实际执行操作，不能只说完成。');
      } else {
        lines.push('**问题**: 你在说话但没有调用工具。');
        lines.push('');
        lines.push('**提醒**: 请使用工具来执行操作。');
      }
      lines.push('');
      lines.push('**建议的工具**:');
      
      const suggestions = suggestToolsForStep(step.description);
      for (const s of suggestions) {
        lines.push(`- ${s}`);
      }
      lines.push('');
      lines.push('请直接调用工具完成这个步骤。');
      break;
    
    // ───────────────────────────────────────
    // 错误 2：工具不相关
    // ───────────────────────────────────────
    case 'irrelevant_tool':
      lines.push('**问题**: 你调用的工具与当前步骤不相关。');
      lines.push('');
      lines.push('**你调用的工具**:');
      for (const call of context.calledTools) {
        lines.push(`- ${call.tool}: ${JSON.stringify(call.args).slice(0, 50)}`);
      }
      lines.push('');
      lines.push('**这个步骤需要的操作**:');
      
      const needed = analyzeStepNeeds(step.description);
      lines.push(`- ${needed}`);
      lines.push('');
      lines.push('请调用正确的工具完成步骤。');
      break;
    
    // ───────────────────────────────────────
    // 错误 3：步骤不匹配
    // ───────────────────────────────────────
    case 'wrong_step':
      lines.push('**问题**: 你提到了错误的步骤。');
      lines.push('');
      lines.push(`**你说的**: ${context.mentionedStep}`);
      lines.push(`**实际当前步骤**: ${step.description}`);
      lines.push('');
      lines.push('请专注于当前步骤，完成后说: "已完成：' + step.description + '"');
      break;
    
    // ───────────────────────────────────────
    // 错误 4：工具失败
    // ───────────────────────────────────────
    case 'tool_failed':
      lines.push('**问题**: 工具调用失败。');
      lines.push('');
      lines.push('**失败的调用**:');
      for (const fail of context.failedTools) {
        lines.push(`- ${fail.tool}: ${fail.error?.slice(0, 100)}`);
      }
      lines.push('');
      lines.push('**建议**:');
      lines.push('- 检查参数是否正确');
      lines.push('- 尝试不同的方法');
      lines.push('- 如果无法解决，可以说"跳过此步骤"');
      break;
  }
  
  return lines.join('\n');
}

/**
 * 根据步骤描述建议工具
 */
function suggestToolsForStep(stepDescription: string): string[] {
  const suggestions: string[] = [];
  const desc = stepDescription.toLowerCase();
  
  if (desc.includes('目录') || desc.includes('文件夹')) {
    suggestions.push('`exec`: `mkdir -p <目录名>`');
  }
  
  if (desc.includes('创建') || desc.includes('编写') || desc.includes('实现')) {
    const fileMatch = stepDescription.match(/(\w+\.(ts|js|py|go|java|md|json))/i);
    if (fileMatch) {
      suggestions.push(`\`write\`: 创建文件 \`${fileMatch[1]}\``);
    } else {
      suggestions.push('`write`: 创建相关文件');
    }
  }
  
  if (desc.includes('测试')) {
    suggestions.push('`write`: 编写测试文件');
    suggestions.push('`exec`: 运行测试命令');
  }
  
  if (desc.includes('安装') || desc.includes('配置')) {
    suggestions.push('`exec`: 执行安装/配置命令');
  }
  
  if (desc.includes('读取') || desc.includes('查看') || desc.includes('检查')) {
    suggestions.push('`read`: 读取文件内容');
  }
  
  if (suggestions.length === 0) {
    suggestions.push('`write`: 创建或修改文件');
    suggestions.push('`exec`: 执行命令');
    suggestions.push('`read`: 读取文件');
  }
  
  return suggestions;
}

/**
 * 分析步骤需要什么操作
 */
function analyzeStepNeeds(stepDescription: string): string {
  const desc = stepDescription.toLowerCase();
  
  if (desc.includes('目录')) return '创建目录结构';
  if (desc.includes('创建') || desc.includes('编写')) return '创建或修改文件';
  if (desc.includes('测试')) return '编写或运行测试';
  if (desc.includes('安装')) return '执行安装命令';
  if (desc.includes('读取')) return '读取文件内容';
  
  return '执行相关操作';
}
```

---

## 工具调用追踪

### 扩展 TaskStep 类型

```typescript
export interface TaskStep {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: string;
  dependencies?: string[];
  estimatedMinutes?: number;
  priority?: 'low' | 'medium' | 'high';
  
  // ★ 工具调用追踪
  toolCalls?: Array<{
    tool: string;
    args: Record<string, unknown>;
    result: 'success' | 'failed';
    error?: string;
    timestamp: string;
  }>;
  
  // ★ 引导追踪
  guidanceCount?: number;
  lastGuidance?: string;
}
```

### 记录工具调用

```typescript
export function recordToolCall(
  plan: TaskPlan,
  stepId: string,
  tool: string,
  args: Record<string, unknown>,
  result: 'success' | 'failed',
  error?: string
): void {
  const step = plan.steps.find(s => s.id === stepId);
  if (!step) return;
  
  if (!step.toolCalls) {
    step.toolCalls = [];
  }
  
  step.toolCalls.push({
    tool,
    args,
    result,
    error,
    timestamp: new Date().toISOString(),
  });
  
  plan.updatedAt = new Date();
}
```

---

## 完整流程

### 在 repl-message.ts 中集成

```typescript
// 工具执行循环
for (const toolCall of result.toolCalls) {
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
    }
  }
  
  // ... 失败处理 ...
}

// ★ 步骤完成检查与引导
if (currentPlan) {
  const currentStep = currentPlan.steps.find(s => s.status === 'in_progress');
  
  if (currentStep) {
    const toolCalls = currentStep.toolCalls || [];
    const modelOutput = result.content || '';
    
    // 检查步骤完成
    const checkResult = checkStepCompletion(currentStep, modelOutput, toolCalls);
    
    console.log(chalk.gray(`[DEBUG] ${checkResult.diagnosis}`));
    
    if (checkResult.complete) {
      // 验证通过，推进步骤
      const nextStep = advanceToNextStep(currentPlan, session);
      
      if (nextStep) {
        console.log(chalk.green(`\n✓ 步骤完成: ${currentStep.description}`));
        console.log(chalk.cyan(`📍 下一步: ${nextStep.description}`));
        
        addUserMessage(session, 
          `步骤完成。继续执行: ${nextStep.description}\n\n` +
          `完成后说"已完成：${nextStep.description}"。`
        );
      } else {
        console.log(chalk.green('\n✓ 所有步骤已完成'));
      }
      
    } else {
      // ★ 有问题，添加引导消息
      console.log(chalk.yellow(`\n${checkResult.diagnosis}`));
      
      // 检查引导次数
      const guidanceCount = (currentStep.guidanceCount || 0) + 1;
      currentStep.guidanceCount = guidanceCount;
      currentStep.lastGuidance = checkResult.guidance;
      
      if (guidanceCount > 3) {
        // 引导次数过多，停下来问用户
        console.log(chalk.red('\n⚠️ 多次引导后仍未完成此步骤'));
        console.log(chalk.cyan('请选择:'));
        console.log(chalk.gray('  1. 手动描述如何执行'));
        console.log(chalk.gray('  2. 跳过此步骤 (s)'));
        console.log(chalk.gray('  3. 停止任务 (q)'));
        
        const answer = await interruptibleQuestion(chalk.cyan('\n请选择: '));
        
        if (answer === 's') {
          // 跳过
          const nextStep = skipAndAdvance(currentPlan, session, currentStep.id);
          // ...
        } else if (answer === 'q') {
          // 停止
          return;
        } else {
          // 用户手动指导
          addUserMessage(session, `用户指导: ${answer}`);
        }
      } else {
        // 添加引导消息
        console.log(chalk.gray(`\n引导模型纠正 (第 ${guidanceCount} 次)...`));
        addUserMessage(session, checkResult.guidance);
      }
      
      savePlanToSession(session, currentPlan);
    }
  }
}
```

---

## 效果示例

### 场景1：空口说完成

```
步骤: 创建项目目录
模型输出: "已完成：创建项目目录"
工具调用: (无)

系统检测:
  errorType: 'no_tool_call'
  diagnosis: "模型说'已完成'但没有调用任何工具"

引导消息:
  ## ⚠️ 步骤执行问题
  
  **当前步骤**: 创建项目目录
  **问题**: 你说"已完成"，但没有调用任何工具。
  **提醒**: 步骤完成需要实际执行操作，不能只说完成。
  
  **建议的工具**:
  - `exec`: `mkdir -p <目录名>`
  
  请直接调用工具完成这个步骤。

→ 模型重新执行:
  调用 exec (mkdir -p project/src)
  输出: "已完成：创建项目目录"

→ 验证通过，推进步骤
```

### 场景2：做了错事

```
步骤: 实现计算器类
工具调用: write (readme.md, "# Project")
模型输出: "已完成：实现计算器类"

系统检测:
  errorType: 'irrelevant_tool'
  diagnosis: "工具调用与步骤不相关: write"

引导消息:
  ## ⚠️ 步骤执行问题
  
  **当前步骤**: 实现计算器类
  **问题**: 你调用的工具与当前步骤不相关。
  
  **你调用的工具**:
  - write: {"path":"readme.md",...}
  
  **这个步骤需要的操作**:
  - 创建或修改文件
  
  请调用正确的工具完成步骤。

→ 模型重新执行:
  调用 write (calculator.py, "class Calculator...")
  输出: "已完成：实现计算器类"

→ 验证通过，推进步骤
```

### 场景3：张冠李戴

```
步骤: 编写单元测试
工具调用: write (test.py, "...")
模型输出: "已完成：实现计算器类"

系统检测:
  errorType: 'wrong_step'
  diagnosis: "模型提到步骤'实现计算器类'，但当前步骤是'编写单元测试'"

引导消息:
  ## ⚠️ 步骤执行问题
  
  **当前步骤**: 编写单元测试
  **问题**: 你提到了错误的步骤。
  
  **你说的**: 实现计算器类
  **实际当前步骤**: 编写单元测试
  
  请专注于当前步骤，完成后说: "已完成：编写单元测试"

→ 模型重新执行:
  工具调用正确，只需修正确认
  输出: "已完成：编写单元测试"

→ 验证通过，推进步骤
```

---

## 防止无限循环

| 引导次数 | 处理方式 |
|---------|---------|
| 1-3 次 | 自动添加引导消息 |
| 超过 3 次 | 停下来让用户决定 |

```typescript
if (guidanceCount > 3) {
  // 多次引导无效，让用户介入
  console.log('模型多次尝试后仍未完成，需要您帮助');
  // 让用户选择：手动指导、跳过、停止
}
```

---

## 总结

### 核心改进

| 方面 | 改进 |
|------|------|
| 检测 | 识别4种错误类型 |
| 引导 | 针对每种错误生成具体建议 |
| 追踪 | 记录工具调用，支持验证 |
| 防护 | 引导次数限制，避免无限循环 |

### 错误类型与引导

| 错误 | 检测方式 | 引导内容 |
|------|---------|---------|
| 空口说完成 | 无工具调用 + 说"已完成" | 提醒必须调用工具 |
| 只说不做 | 无工具调用 | 建议具体工具 |
| 做了错事 | 工具不相关 | 指出正确操作 |
| 张冠李戴 | 步骤描述不匹配 | 提醒当前步骤 |
| 工具失败 | 工具返回错误 | 分析错误原因 |

### 核心价值

**状态机不只是检测完成，更重要的是引导模型纠正错误**。

通过检测 → 引导 → 验证的循环，让模型有机会自我纠正，而不是直接失败。