# Plan 状态机设计 v2

## 其他产品调研

### Cursor Plan Mode
- **持久化**：使用 `.cursor/plans/` 目录存储计划文件
- **进度追踪**：每个步骤用 checkbox `- [ ]` / `- [x]` 标记
- **执行方式**：逐步执行，每步完成后更新 plan 文件
- **恢复机制**：支持 `/plan resume` 继续未完成的计划

### Windsurf/Cascade
- **状态持久化**：任务状态存储在 `.windsurf/tasks/`
- **快照机制**：每完成一步创建文件快照
- **回滚支持**：失败时可以回滚到上一个快照

### Devin
- **子任务分解**：大任务分解为独立的子任务
- **执行环境隔离**：每个子任务有独立的执行上下文
- **错误恢复**：子任务失败可以重试，不影响其他任务
- **状态机**：pending → running → success/failed

### Aider
- **简单列表**：任务列表存储在项目根目录
- **文件变化检测**：通过 git diff 检测文件变化
- **验证机制**：运行测试验证代码正确性

---

## 设计原则（参考业界最佳实践）

### 1. 持久化优先
- 所有状态持久化到文件，不依赖内存
- 支持进程重启后恢复

### 2. 原子性操作
- 每个步骤要么完全成功，要么完全失败
- 不存在中间状态

### 3. 可验证性
- 步骤完成后必须验证
- 验证失败不推进

### 4. 可恢复性
- 支持中断后恢复
- 支持失败后重试

### 5. 可观察性
- 清晰的进度显示
- 详细的日志记录

---

## 问题分析

### 当前问题

| 问题 | 根因 | 影响 |
|------|------|------|
| 步骤虚假完成 | 依赖模型输出文本检测 | 任务未完成就推进 |
| 模型幻觉 | 模型说"已完成"但内容不匹配 | 步骤执行混乱 |
| 自动重试后状态丢失 | 步骤状态设为 pending | 找不到当前步骤 |
| 进度条不更新 | 推进时缺少显示逻辑 | 用户体验差 |
| 工具成功但内容不相关 | 没有验证工具输出 | 步骤虚假完成 |

### 根本问题

**当前实现依赖模型输出文本检测步骤完成**：
- 检测"已完成：xxx"关键词
- 模型可能幻觉、记错、输出错误内容
- 没有结构性验证

---

## 状态机设计

### 核心思想

1. **步骤有明确状态**：不依赖文本检测
2. **转换有严格条件**：必须验证才能转换
3. **失败有处理路径**：自动重试/跳过/停止

### 步骤状态

```
pending    - 等待执行
in_progress - 执行中
verifying  - 验证中（新增）
completed  - 已完成
failed     - 执行失败
skipped    - 已跳过
```

### 状态转换图

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
┌─────────┐  start  ┌─────────────┐  success  ┌───────────┐  │
│ pending │ ───────►│ in_progress │ ─────────►│ verifying │  │
└─────────┘         └─────────────┘           └───────────┘  │
    ▲                    │ │                       │ │        │
    │                    │ │                       │ │        │
    │              retry │ │ fail                  │ │ pass   │
    │                    │ │                       │ │        │
    │                    ▼ ▼                       ▼ ▼        │
    │               ┌─────────┐             ┌───────────┐     │
    │               │  failed │             │ completed │     │
    │               └─────────┘             └───────────┘     │
    │                    │                                       │
    │               skip │                                       │
    │                    ▼                                       │
    │              ┌─────────┐                                   │
    └──────────────│ skipped │◄──────────────────────────────────┘
                   └─────────┘
```

### 转换条件

| 转换 | 条件 | 验证 |
|------|------|------|
| pending → in_progress | 用户确认计划 | 无 |
| in_progress → verifying | 工具执行成功 | 无 |
| in_progress → failed | 工具执行失败 | 无 |
| verifying → completed | 验证通过 | **关键** |
| verifying → in_progress | 验证失败，重试 | 无 |
| failed → in_progress | 用户选择重试 | 无 |
| failed → skipped | 用户选择跳过 | 无 |

---

## 验证机制设计

### 步骤验证接口

```typescript
interface StepValidator {
  /** 验证步骤是否真正完成 */
  validate(step: TaskStep, context: ValidationContext): Promise<ValidationResult>;
}

interface ValidationContext {
  /** 工具调用结果 */
  toolResults: ToolResult[];
  /** 文件系统变化 */
  fileChanges?: FileChange[];
  /** 模型输出 */
  modelOutput?: string;
}

interface ValidationResult {
  passed: boolean;
  reason?: string;
  suggestions?: string[];
}
```

### 验证策略

#### 1. 文件验证器
- 检查文件是否创建/修改
- 检查文件内容是否合理
- 示例：步骤"创建 README.md"→ 验证文件是否存在

#### 2. 目录验证器
- 检查目录结构
- 示例：步骤"创建项目目录"→ 验证目录是否存在

#### 3. 代码验证器
- 检查语法正确性
- 检查导入是否有效
- 示例：步骤"实现计算器类"→ 验证文件语法

#### 4. 测试验证器
- 运行测试
- 示例：步骤"编写单元测试"→ 运行测试

### 验证器匹配规则

根据步骤描述自动匹配验证器：

```typescript
const validatorRules = [
  { pattern: /创建.*目录/, validator: 'directory' },
  { pattern: /创建.*文件|编写.*文件/, validator: 'file' },
  { pattern: /实现.*类|实现.*模块/, validator: 'code' },
  { pattern: /编写.*测试|单元测试/, validator: 'test' },
  { pattern: /安装.*依赖|配置.*环境/, validator: 'command' },
];
```

---

## 实现方案

### 1. 状态机类

```typescript
class PlanStateMachine {
  private plan: TaskPlan;
  private session: Session;
  private validators: Map<string, StepValidator>;
  
  /** 开始执行步骤 */
  async startStep(stepId: string): Promise<void> {
    const step = this.plan.steps.find(s => s.id === stepId);
    if (step.status !== 'pending') {
      throw new Error(`Cannot start step with status ${step.status}`);
    }
    this.updateStepStatus(stepId, 'in_progress');
  }
  
  /** 工具执行成功，进入验证 */
  async toolSuccess(stepId: string, results: ToolResult[]): Promise<StepTransitionResult> {
    const step = this.plan.steps.find(s => s.id === stepId);
    if (step.status !== 'in_progress') {
      throw new Error(`Invalid state: ${step.status}`);
    }
    
    // 进入验证状态
    this.updateStepStatus(stepId, 'verifying');
    
    // 执行验证
    const validator = this.getValidator(step);
    const validation = await validator.validate(step, { toolResults: results });
    
    if (validation.passed) {
      this.updateStepStatus(stepId, 'completed');
      return { success: true, nextStep: this.getNextStep() };
    } else {
      // 验证失败，回到 in_progress
      this.updateStepStatus(stepId, 'in_progress');
      return { success: false, reason: validation.reason, retry: true };
    }
  }
  
  /** 工具执行失败 */
  async toolFailed(stepId: string, error: string): Promise<StepTransitionResult> {
    this.updateStepStatus(stepId, 'failed');
    return { success: false, reason: error, retry: false };
  }
  
  /** 获取下一步 */
  private getNextStep(): TaskStep | null {
    return this.plan.steps.find(s => s.status === 'pending') || null;
  }
}
```

### 2. 验证器实现

```typescript
// 文件验证器
const fileValidator: StepValidator = {
  async validate(step, context) {
    // 从步骤描述提取文件名
    const fileMatch = step.description.match(/创建\s*(.+\.py|.+\.js|.+\.ts)/);
    if (!fileMatch) {
      return { passed: true }; // 无法提取，默认通过
    }
    
    const fileName = fileMatch[1];
    
    // 检查工具结果中是否有写入该文件
    const writeResult = context.toolResults.find(r => 
      r.toolName === 'write' && r.args?.path?.includes(fileName)
    );
    
    if (!writeResult) {
      return { 
        passed: false, 
        reason: `步骤要求创建 ${fileName}，但没有调用 write 工具` 
      };
    }
    
    return { passed: true };
  }
};

// 目录验证器
const directoryValidator: StepValidator = {
  async validate(step, context) {
    const dirMatch = step.description.match(/创建.*目录/);
    if (!dirMatch) {
      return { passed: true };
    }
    
    // 检查是否有 mkdir 或 exec 调用
    const hasMkdir = context.toolResults.some(r => 
      r.toolName === 'exec' && r.args?.command?.includes('mkdir')
    );
    
    if (!hasMkdir) {
      return { 
        passed: false, 
        reason: '步骤要求创建目录，但没有执行 mkdir 命令' 
      };
    }
    
    return { passed: true };
  }
};
```

### 3. 集成到 repl-message.ts

```typescript
// 在工具执行成功后
if (currentPlan && toolResult?.success) {
  const stateMachine = new PlanStateMachine(currentPlan, session);
  
  // 获取当前步骤
  const currentStep = currentPlan.steps.find(s => s.status === 'in_progress');
  
  if (currentStep) {
    // 调用状态机处理
    const result = await stateMachine.toolSuccess(currentStep.id, [toolResult]);
    
    if (result.success) {
      // 验证通过，推进到下一步
      if (result.nextStep) {
        await stateMachine.startStep(result.nextStep.id);
        console.log(chalk.cyan(`\n📍 下一步: ${result.nextStep.description}`));
      } else {
        console.log(chalk.green('\n✓ 所有步骤已完成'));
      }
    } else {
      // 验证失败，告诉模型重试
      addUserMessage(session, 
        `验证失败：${result.reason}\n\n请重新执行这一步。`
      );
      continue;
    }
  }
}
```

---

## 优势

| 方面 | 当前实现 | 状态机 |
|------|----------|--------|
| 步骤完成判断 | 依赖模型输出文本 | 验证器验证 |
| 模型幻觉 | 无法防止 | 验证器过滤 |
| 状态丢失 | 手动管理 | 状态机保证 |
| 失败处理 | 分散逻辑 | 统一处理 |
| 可测试性 | 难以测试 | 状态机可单独测试 |

---

## 实施计划

### Phase 1: 状态机核心（1-2天）
- [ ] 实现 PlanStateMachine 类
- [ ] 实现基础验证器（文件、目录）
- [ ] 集成到 repl-message.ts

### Phase 2: 高级验证器（1天）
- [ ] 代码验证器
- [ ] 测试验证器
- [ ] 命令验证器

### Phase 3: 错误处理（1天）
- [ ] 失败重试逻辑
- [ ] 用户选择（重试/跳过/停止）
- [ ] 进度保存/恢复

### Phase 4: 测试和优化（1天）
- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能优化

---

## 文件结构

```
src/
├── plan/
│   ├── state-machine.ts      # 状态机核心
│   ├── validators/
│   │   ├── index.ts          # 验证器注册
│   │   ├── file.ts           # 文件验证器
│   │   ├── directory.ts      # 目录验证器
│   │   ├── code.ts           # 代码验证器
│   │   └── test.ts           # 测试验证器
│   └── types.ts              # 类型定义
└── cli/
    └── repl-message.ts       # 集成点
```