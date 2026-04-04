# 委托协作完整流程设计

## 目标

确保委托者和被委托者之间的协作能够稳定执行，支持多轮迭代，每个环节提供足够的信息供下一个环节使用。

## 核心原则

1. **信息完整性**：每个环节都有明确的输入和输出
2. **可追溯性**：所有历史记录完整保存
3. **迭代支持**：支持多轮反馈和改进
4. **状态清晰**：每个状态转换都有明确的意义

## 完整流程

### 阶段1：委托者发起任务

**状态**：`pending`

**输入**：
- 任务描述（task）
- 验收标准（acceptanceCriteria）
- 期望交付物（expectedDeliverables）
- 上下文信息（context）
- 截止时间（deadline，可选）
- 优先级（priority）

**输出**：
- 委派记录创建
- 通知被委托者

**数据结构**：
```typescript
{
  id: "delegation-xxx",
  delegator: "dev",
  delegatee: "py",
  task: "实现光流算法并进行充分测试",
  acceptanceCriteria: [
    "代码可运行",
    "测试覆盖率 > 80%",
    "有完整的文档"
  ],
  expectedDeliverables: [
    "optical_flow.py - 核心算法实现",
    "test_optical_flow.py - 单元测试",
    "README.md - 使用文档"
  ],
  context: "项目路径: /workspace/optical-flow",
  deadline: 1234567890,
  priority: "normal",
  status: "pending"
}
```

### 阶段2：被委托者接受任务

**状态**：`pending` → `accepted`

**输入**：
- 委派记录
- 工作空间信息
- 可用资源

**输出**：
- 接受确认
- 理解确认（可选）

**交互**：
```
被委托者看到：
  任务：实现光流算法并进行充分测试
  验收标准：
    1. 代码可运行
    2. 测试覆盖率 > 80%
    3. 有完整的文档
  期望交付物：
    - optical_flow.py
    - test_optical_flow.py
    - README.md
  工作空间：/workspace/optical-flow
  
  是否接受？(y/n)
```

### 阶段3：执行任务

**状态**：`accepted` → `in_progress` → `pending_review`

**输入**：
- 任务描述
- 验收标准
- 期望交付物
- 工作空间
- 历史反馈（如果是迭代）

**输出**：
- 执行摘要
- 交付物清单
- 测试结果
- 执行日志
- 自评报告

**数据结构**：
```typescript
{
  executionRound: 1,
  startedAt: 1234567890,
  completedAt: 1234567900,
  workspace: "/workspace/optical-flow",
  
  deliverables: {
    files: [
      {
        path: "/workspace/optical-flow/optical_flow.py",
        type: "created",
        description: "光流算法核心实现",
        linesOfCode: 150,
        testCoverage: 85
      },
      {
        path: "/workspace/optical-flow/test_optical_flow.py",
        type: "created",
        description: "单元测试",
        testCount: 12,
        passedCount: 12
      }
    ],
    commands: [
      {
        command: "python -m pytest test_optical_flow.py -v",
        result: "passed",
        output: "12 passed in 2.3s"
      }
    ]
  },
  
  selfAssessment: {
    acceptanceCriteria: [
      { criteria: "代码可运行", met: true, evidence: "测试全部通过" },
      { criteria: "测试覆盖率 > 80%", met: true, evidence: "覆盖率 85%" },
      { criteria: "有完整的文档", met: true, evidence: "README.md 已创建" }
    ],
    completionRate: 100,
    notes: "所有验收标准已满足，测试覆盖充分"
  },
  
  executionLog: "详细执行日志..."
}
```

### 阶段4：委托者验收

**状态**：`pending_review` → `completed` 或 `accepted`（重新执行）

**输入**：
- 执行摘要
- 交付物清单
- 测试结果
- 自评报告
- 历史验收记录（如果有）

**输出**：
- 验收结果（通过/驳回）
- 详细反馈
- 问题清单

**交互**：
```
委托者看到：

📋 执行摘要（第1轮）
────────────────────────
工作目录: /workspace/optical-flow
执行时间: 10分钟
创建文件: 3 个
测试结果: ✅ 12/12 通过

📦 交付物清单
────────────────────────
✅ optical_flow.py (150 行, 覆盖率 85%)
✅ test_optical_flow.py (12 个测试)
✅ README.md (使用文档)

🧪 测试结果
────────────────────────
pytest test_optical_flow.py -v
12 passed in 2.3s

📊 自评报告
────────────────────────
验收标准完成度: 100%
  ✅ 代码可运行 - 测试全部通过
  ✅ 测试覆盖率 > 80% - 覆盖率 85%
  ✅ 有完整的文档 - README.md 已创建

🔍 AI Review 建议
────────────────────────
代码质量良好，测试覆盖充分。
建议：可补充性能基准测试。

验收结果？(y=通过, n=驳回, v=查看详情)
```

### 阶段5：迭代改进（如果驳回）

**状态**：`accepted`（重新执行）

**输入**：
- 驳回原因
- 具体问题列表
- 改进建议

**输出**：
- 新的执行计划

**交互**：
```
被委托者收到：

⚠️ 任务验收未通过（第1轮）

问题清单：
1. 测试缺少边界场景
   - 缺少空图像输入测试
   - 缺少超大图像测试
2. 文档缺少性能说明
   - 需要补充时间复杂度分析
   - 需要补充内存使用说明

改进建议：
- 添加 test_edge_cases.py 测试边界场景
- 在 README.md 中补充性能章节

是否重新执行？(y/n)
```

## 迭代历史存档

每次迭代都完整记录，形成历史链：

```typescript
{
  id: "delegation-xxx",
  currentRound: 2,
  maxRounds: 5,
  
  history: [
    {
      round: 1,
      status: "rejected",
      executor: "py",
      executedAt: "2026-04-04 10:30:00",
      
      execution: {
        deliverables: [...],
        testResults: [...],
        selfAssessment: {...}
      },
      
      review: {
        reviewer: "dev",
        reviewedAt: "2026-04-04 10:40:00",
        result: "rejected",
        feedback: "测试缺少边界场景...",
        issues: [
          { severity: "high", description: "缺少空图像测试" },
          { severity: "medium", description: "文档不完整" }
        ]
      }
    },
    
    {
      round: 2,
      status: "completed",
      executor: "py",
      executedAt: "2026-04-04 11:00:00",
      
      execution: {
        deliverables: [...],
        testResults: [...],
        selfAssessment: {...},
        
        // 说明如何解决上一轮的问题
        issueResolution: [
          { issue: "缺少空图像测试", resolution: "已添加 test_edge_cases.py" },
          { issue: "文档不完整", resolution: "已补充性能章节" }
        ]
      },
      
      review: {
        reviewer: "dev",
        reviewedAt: "2026-04-04 11:10:00",
        result: "approved",
        feedback: "所有问题已解决，验收通过"
      }
    }
  ]
}
```

## 状态转换图

```
pending (待接受)
   ↓
accepted (已接受)
   ↓
in_progress (执行中)
   ↓
pending_review (待验收)
   ↓
   ├─→ completed (验收通过，流程结束)
   │
   └─→ accepted (驳回，重新执行)
         ↓
       in_progress (新一轮执行)
         ↓
       pending_review (待验收)
         ↓
         ... (循环直到通过或达到最大轮数)
```

## 关键改进点

### 1. 明确的验收标准
- 委托时必须指定验收标准
- 执行者知道要达成什么目标
- 验收时有明确的依据

### 2. 交付物清单
- 明确期望交付什么文件
- 执行者有清晰的目标
- 验收时逐项检查

### 3. 自评报告
- 执行者自己评估是否满足验收标准
- 提供证据支持
- 减少无效提交

### 4. 迭代历史
- 完整记录每次迭代
- 追踪问题解决过程
- 避免重复问题

### 5. 问题清单
- 驳回时提供结构化的问题列表
- 明确优先级
- 执行者知道具体要改什么

## 实现计划

1. 扩展 `DelegationRequest` 数据结构
2. 实现 `ExecutionRecord` 和 `ReviewRecord`
3. 修改委派创建流程，添加验收标准和期望交付物
4. 改进执行结果收集，生成交付物清单和自评报告
5. 增强验收流程，支持结构化反馈
6. 实现迭代历史存档