# SecureBot 记忆系统优化计划

基于 claude-mem 调研，优化记忆系统。

## 背景

claude-mem (https://github.com/thedotmack/claude-mem) 提供了以下可借鉴特性：

| 特性 | 实现方式 |
|-----|---------|
| **Progressive Disclosure** | 3 层检索：search → timeline → get_observations，节省 ~10x tokens |
| **Hook 生命周期** | 6 个 Hook 捕获完整 Session |
| **AI 压缩** | Claude Agent SDK 自动提取结构化 learnings |
| **混合检索** | FTS5 全文 + ChromaDB 向量 |
| **Citations** | 每条 observation 有 ID，可溯源 |

## Phase 1: Progressive Disclosure 检索（当前）

**目标**：实现 3 层检索模式，节省 ~2,000 tokens/session

### 任务清单

- [x] 1.1 定义检索层级接口 - SearchResultCompact 类型
- [x] 1.2 改造 memory_search - 返回 compact 结果
- [x] 1.3 新增 memory_timeline - 根据 ID 获取时间线上下文
- [x] 1.4 新增 memory_get - 根据 ID 批量获取完整内容
- [x] 1.5 测试 + 文档

### 检索层级设计

```
用户查询 → search(compact) → timeline(context) → get(full)
           ~50 tokens/条     ~100 tokens/条      ~500 tokens/条
```

**流程**：
1. `memory_search(query, mode='compact')` 返回 ID + 摘要列表
2. 用户选择感兴趣的 ID，调用 `memory_timeline(id)` 获取上下文
3. 确认后调用 `memory_get(ids)` 获取完整内容

### 类型定义

```typescript
// Compact 搜索结果
interface SearchResultCompact {
  id: string;
  summary: string;      // ~50 字摘要
  type: MemoryType;
  timestamp: string;
  confidence?: number;
}

// Timeline 结果
interface TimelineResult {
  center: SearchResultCompact;
  before: SearchResultCompact[];
  after: SearchResultCompact[];
}

// Get 结果
interface MemoryDetail {
  id: string;
  content: string;      // 完整内容
  type: MemoryType;
  timestamp: string;
  confidence: number;
  source?: string;
  tags?: string[];
}
```

---

## Phase 2: Citations + ID 溯源（待定）

**目标**：每条记忆可引用，便于验证和跨 session 关联

---

## Phase 3: Hook 生命周期捕获（待定）

**目标**：自动捕获 session 关键事件

---

## Phase 4: Web Viewer UI（可选）

**目标**：实时记忆流可视化

---

## 参考文档

- claude-mem: https://github.com/thedotmack/claude-mem
- claude-mem 架构: https://docs.claude-mem.ai/architecture/overview
- securebot 记忆: docs/MEMORY.md

---

## Phase 2: Citations + ID 溯源（当前）

**目标**：每条记忆可引用，便于验证和跨 session 关联

### 任务清单

- [x] 2.1 搜索结果带 Citation 格式 `[Source: #abc123]`
- [x] 2.2 新增 memory_lookup 工具（单条溯源）
- [x] 2.3 去重逻辑调整（ID 作为唯一标识）
- [x] 2.4 测试 + 文档更新

### Citation 格式设计

```
搜索结果输出格式：
1. [#mem_abc1] [2026-04-17] [knowledge] 我是Python开发者...

溯源调用：
memory_lookup({ memory_id: "mem_abc1" })
返回：完整内容 + 来源 + 创建时间 + 相关标签
```

### 去重逻辑调整

**已完成**：
- MemoryEntry.id 作为唯一标识
- remember() 方法自动生成 ID
- getByIds() 使用 ID 匹配而非内容匹配

**影响**：
- 相同内容会生成不同 ID（保留历史）
- cleanFactsTool 仍使用内容去重（保留行为）

---

## Phase 3: Hook 生命周期捕获（当前）

**目标**：自动捕获 session 关键事件，无需手动 remember

### 任务清单

- [x] 3.1 设计 Session Hook 接口
- [x] 3.2 实现 SessionStart Hook（注入上下文）
- [x] 3.3 实现 UserPrompt Hook（记录用户输入）
- [x] 3.4 实现 Stop Hook（生成 session summary）
- [x] 3.5 实现 End Hook（标记完成 + RAG 同步）
- [x] 3.6 测试 + 集成

### Hook 设计

```typescript
interface SessionHook {
  name: string;
  trigger: 'start' | 'prompt' | 'stop' | 'end';
  execute(context: HookContext): Promise<void>;
}

interface HookContext {
  agentId: string;
  sessionId: string;
  prompt?: string;        // UserPrompt Hook
  response?: string;      // Stop Hook
  toolsUsed?: string[];   // Stop Hook
}
```

### Hook 触发点

| Hook | 触发时机 | 功能 |
|------|---------|------|
| SessionStart | Session 创建时 | 注入历史上下文 |
| UserPrompt | 用户输入时 | 记录 prompt 到 daily memory |
| Stop | 响应完成时 | 生成 summary |
| End | Session 结束时 | 标记完成，触发 RAG 同步 |
