# Plan 状态机设计 v2

## 其他产品调研

### Cursor Plan Mode
```markdown
# Plan: 实现计算器

## Progress
- [x] 创建项目目录
- [ ] 实现计算器类
- [ ] 编写测试
```
- **持久化**：Markdown 文件存储计划
- **进度**：Checkbox 标记完成状态
- **恢复**：`/plan resume` 继续执行
- **简单可靠**：不依赖模型输出，只检查 checkbox

### Windsurf/Cascade
- **任务文件**：`.windsurf/tasks/task-xxx.md`
- **快照**：每步完成后 git commit
- **回滚**：失败时 `git reset --hard`

### Devin
- **子任务**：大任务分解为子任务
- **隔离执行**：每个子任务独立上下文
- **状态持久化**：数据库存储任务状态

### Aider
- **简单列表**：TODO.md 文件
- **Git 集成**：通过 git diff 检测变化
- **测试验证**：运行测试验证代码

---

## 设计原则

| 原则 | 说明 | 参考 |
|------|------|------|
| 持久化 | 状态存储在文件，不依赖内存 | Cursor |
| 简单性 | 用 checkbox 标记进度，不复杂状态机 | Cursor |
| 可追踪 | 每步记录调用的工具和文件变化 | Aider |
| 可恢复 | 中断后可从文件恢复 | Cursor |
| 可验证 | 通过工具调用记录验证，不依赖模型输出 | Devin |

---

## 核心设计

### 1. 计划文件格式

```markdown
# Plan: 实现光流算法

**状态**: in_progress
**创建时间**: 2026-03-25 23:00
**更新时间**: 2026-03-25 23:30

## 步骤

### 1. 创建项目目录 ✅
- **状态**: completed
- **工具**: exec (mkdir -p optical_flow/{core,utils,tests})
- **输出**: 创建目录成功
- **完成时间**: 2026-03-25 23:01

### 2. 实现光流算法核心 🔄
- **状态**: in_progress
- **工具**: write (optical_flow/core/flow.py)
- **开始时间**: 2026-03-25 23:02

### 3. 编写测试 ⬜
- **状态**: pending

### 4. 创建示例 ⬜
- **状态**: pending
```

### 2. 步骤状态

只保留 4 个状态：
- `pending` ⬜ - 等待执行
- `in_progress` 🔄 - 执行中
- `completed` ✅ - 已完成
- `failed` ❌ - 执行失败

### 3. 工具追踪

每个步骤记录：
1. **调用的工具**：哪些工具被调用
2. **文件变化**：哪些文件被创建/修改
3. **执行结果**：成功/失败

```typescript
interface TrackedStep {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  
  // 工具追踪
  toolCalls: Array<{
    tool: string;
    args: Record<string, unknown>;
    result: 'success' | 'failed';
    timestamp: Date;
  }>;
  
  // 文件追踪
  fileChanges: Array<{
    path: string;
    action: 'create' | 'modify' | 'delete';
  }>;
  
  // 时间追踪
  startedAt?: Date;
  completedAt?: Date;
}
```

---

## 关键改进

### 问题：依赖模型输出检测完成

**之前**：
```typescript
// 检测模型是否说"已完成"
const modelSaysCompleted = /已完成/.test(content);
```

**问题**：模型幻觉、记错、输出错误

**改进：工具追踪验证**

```typescript
// 检查步骤是否有成功的工具调用
function isStepComplete(step: TrackedStep): boolean {
  // 必须有至少一个成功的工具调用
  const hasToolCall = step.toolCalls.some(c => c.result === 'success');
  if (!hasToolCall) return false;
  
  // 根据步骤类型验证
  if (step.description.includes('创建目录')) {
    // 必须有 mkdir 调用
    return step.toolCalls.some(c => 
      c.tool === 'exec' && c.args.command?.includes('mkdir')
    );
  }
  
  if (step.description.includes('创建文件') || step.description.includes('编写')) {
    // 必须有 write 调用
    return step.toolCalls.some(c => c.tool === 'write');
  }
  
  // 默认：有工具调用就算完成
  return true;
}
```

### 问题：步骤推进混乱

**之前**：多个地方检测步骤完成，逻辑分散

**改进：集中式状态管理**

```typescript
class PlanTracker {
  private planFile: string;
  private plan: Plan;
  
  constructor(planFile: string) {
    this.planFile = planFile;
    this.plan = this.loadPlan();
  }
  
  // 唯一的推进入口
  recordToolCall(tool: string, args: any, result: 'success' | 'failed'): void {
    const currentStep = this.getCurrentStep();
    if (!currentStep) return;
    
    // 记录工具调用
    currentStep.toolCalls.push({
      tool, args, result, timestamp: new Date()
    });
    
    // 检查是否可以推进
    if (result === 'success' && this.shouldAdvance(currentStep)) {
      this.advanceStep();
    }
    
    // 持久化
    this.savePlan();
  }
  
  // 检查是否应该推进
  private shouldAdvance(step: TrackedStep): boolean {
    // 根据步骤类型验证
    return isStepComplete(step);
  }
  
  // 推进到下一步
  private advanceStep(): void {
    const currentStep = this.getCurrentStep();
    if (currentStep) {
      currentStep.status = 'completed';
      currentStep.completedAt = new Date();
    }
    
    const nextStep = this.getNextPendingStep();
    if (nextStep) {
      nextStep.status = 'in_progress';
      nextStep.startedAt = new Date();
    }
  }
}
```

---

## 实现方案

### Phase 1: 计划文件管理

```typescript
// src/plan/plan-file.ts

export class PlanFile {
  private path: string;
  
  async create(title: string, steps: string[]): Promise<void> {
    const content = this.renderPlan({
      title,
      status: 'pending',
      steps: steps.map((desc, i) => ({
        id: `step-${i + 1}`,
        description: desc,
        status: 'pending',
        toolCalls: [],
        fileChanges: [],
      })),
    });
    await fs.writeFile(this.path, content);
  }
  
  async load(): Promise<Plan> {
    const content = await fs.readFile(this.path, 'utf-8');
    return this.parsePlan(content);
  }
  
  async update(step: TrackedStep): Promise<void> {
    const plan = await this.load();
    const idx = plan.steps.findIndex(s => s.id === step.id);
    if (idx >= 0) {
      plan.steps[idx] = step;
    }
    await fs.writeFile(this.path, this.renderPlan(plan));
  }
  
  private renderPlan(plan: Plan): string {
    const statusEmoji = {
      pending: '⬜',
      in_progress: '🔄',
      completed: '✅',
      failed: '❌',
    };
    
    let md = `# Plan: ${plan.title}\n\n`;
    md += `**状态**: ${plan.status}\n\n`;
    md += `## 步骤\n\n`;
    
    for (const step of plan.steps) {
      const emoji = statusEmoji[step.status];
      md += `### ${step.id}. ${step.description} ${emoji}\n`;
      md += `- **状态**: ${step.status}\n`;
      
      if (step.toolCalls.length > 0) {
        md += `- **工具**: ${step.toolCalls.map(c => c.tool).join(', ')}\n`;
      }
      
      if (step.completedAt) {
        md += `- **完成时间**: ${step.completedAt.toISOString()}\n`;
      }
      
      md += '\n';
    }
    
    return md;
  }
}
```

### Phase 2: 工具追踪集成

```typescript
// src/cli/repl-message.ts

// 在工具执行循环中
const planTracker = new PlanTracker(planFile);

for (const toolCall of result.toolCalls) {
  const toolResult = await executeToolCall(toolCall);
  
  // 记录到计划追踪器
  planTracker.recordToolCall(
    toolCall.name,
    toolCall.arguments,
    toolResult.success ? 'success' : 'failed'
  );
  
  // 检查是否推进了步骤
  const currentStep = planTracker.getCurrentStep();
  if (currentStep?.status === 'completed') {
    const nextStep = planTracker.getNextPendingStep();
    if (nextStep) {
      console.log(chalk.cyan(`\n📍 下一步: ${nextStep.description}`));
    } else {
      console.log(chalk.green('\n✓ 所有步骤已完成'));
    }
  }
}
```

### Phase 3: 恢复支持

```typescript
// src/cli/commands/resume.ts

export async function resumePlan(planFile: string): Promise<void> {
  const plan = await PlanFile.load(planFile);
  
  // 找到当前步骤
  const currentStep = plan.steps.find(s => s.status === 'in_progress');
  if (currentStep) {
    console.log(`继续执行: ${currentStep.description}`);
    // 引导模型继续执行
  } else {
    const nextStep = plan.steps.find(s => s.status === 'pending');
    if (nextStep) {
      console.log(`下一步: ${nextStep.description}`);
    } else {
      console.log('所有步骤已完成');
    }
  }
}
```

---

## 与当前实现对比

| 方面 | 当前实现 | 新设计 |
|------|----------|--------|
| 状态存储 | 内存 + session | 文件持久化 |
| 完成检测 | 模型输出文本 | 工具调用追踪 |
| 恢复支持 | 需要手动 | 自动从文件恢复 |
| 可观察性 | 内存中 | Markdown 文件可见 |
| 调试 | 需要日志 | 直接查看文件 |

---

## 文件结构

```
.agents/
└── {agent-id}/
    └── plans/
        ├── plan-20260325-230001.md
        ├── plan-20260325-233001.md
        └── ...
```

---

## 实施计划

### Phase 1: 计划文件管理 (1天)
- [ ] PlanFile 类实现
- [ ] Markdown 格式解析和渲染
- [ ] 文件读写测试

### Phase 2: 工具追踪 (1天)
- [ ] PlanTracker 类实现
- [ ] 工具调用记录
- [ ] 步骤推进逻辑

### Phase 3: 集成 (1天)
- [ ] 集成到 repl-message.ts
- [ ] 进度显示优化
- [ ] 恢复命令实现

### Phase 4: 测试和优化 (1天)
- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能优化

---

## 关键代码

### 步骤完成判断

```typescript
function isStepComplete(step: TrackedStep): boolean {
  if (step.toolCalls.length === 0) return false;
  
  // 必须有至少一个成功的工具调用
  const successCalls = step.toolCalls.filter(c => c.result === 'success');
  if (successCalls.length === 0) return false;
  
  // 根据步骤描述验证工具调用
  const desc = step.description.toLowerCase();
  
  // 目录相关
  if (desc.includes('目录')) {
    return successCalls.some(c => 
      c.tool === 'exec' && 
      String(c.args.command).includes('mkdir')
    );
  }
  
  // 文件相关
  if (desc.includes('文件') || desc.includes('编写') || desc.includes('创建')) {
    return successCalls.some(c => c.tool === 'write' || c.tool === 'read');
  }
  
  // 安装相关
  if (desc.includes('安装') || desc.includes('配置')) {
    return successCalls.some(c => c.tool === 'exec');
  }
  
  // 测试相关
  if (desc.includes('测试')) {
    return successCalls.some(c => 
      c.tool === 'exec' || c.tool === 'write'
    );
  }
  
  // 默认：有成功的工具调用就算完成
  return true;
}
```

### 推进逻辑

```typescript
class PlanTracker {
  advanceStep(): boolean {
    const current = this.getCurrentStep();
    if (!current) return false;
    
    // 验证当前步骤是否真的完成
    if (!isStepComplete(current)) {
      console.log(`步骤未完成，缺少必要的工具调用`);
      return false;
    }
    
    // 标记完成
    current.status = 'completed';
    current.completedAt = new Date();
    
    // 找下一步
    const next = this.getNextPendingStep();
    if (next) {
      next.status = 'in_progress';
      next.startedAt = new Date();
      return true;
    }
    
    return false;
  }
}
```

---

## 优势

1. **不依赖模型输出**：通过工具调用追踪判断完成
2. **持久化可靠**：文件存储，支持恢复
3. **简单直观**：Markdown 格式，可读可编辑
4. **可追溯**：每步记录工具调用和文件变化
5. **易于调试**：直接查看计划文件

---

## 后续优化

1. **智能验证**：根据步骤描述自动匹配验证规则
2. **回滚支持**：失败时恢复到上一个快照
3. **并行执行**：独立步骤并行执行
4. **依赖管理**：步骤间依赖关系