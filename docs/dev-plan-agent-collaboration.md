# SecureBot Agent 协作模式开发计划

> 分支: `multi`
> 基于: `dev` (commit: `661481e`)
> 日期: 2026-04-01

---

## 一、开发目标

在 SecureBot 中实现完整的 Agent 协作系统，支持：
- 图结构管理 Agent 关系
- 轻量级与 LangGraph 双模式
- 云服务监控
- Human-in-the-loop
- 心跳管理

---

## 二、目录结构

```
src/
├── core/
│   ├── collaboration.ts          # 现有：基础协作（保留）
│   ├── collaboration/            # 新增：图协作模块
│   │   ├── index.ts              # 导出
│   │   ├── types.ts              # 类型定义
│   │   ├── graph.ts              # 图结构
│   │   ├── builder.ts            # 图构建器
│   │   ├── executor.ts           # 图执行器
│   │   ├── orchestrator.ts       # 统一协调器
│   │   ├── langgraph-adapter.ts  # LangGraph 适配器
│   │   ├── loader.ts             # YAML 加载器
│   │   └── manager.ts            # 图管理器
│   ├── heartbeat/                # 新增：心跳模块
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── manager.ts
│   │   └── client.ts
│   └── monitoring/               # 新增：监控模块
│       ├── index.ts
│       ├── types.ts
│       ├── broadcaster.ts
│       ├── collector.ts
│       └── alert.ts
├── tools/
│   └── graph-tool.ts             # 新增：图操作工具
├── cli/
│   └── commands/
│       └── graph.ts              # 新增：图 CLI 命令
└── workflows/                    # 新增：工作流配置
    └── examples/
        ├── model-training.yaml
        └── code-review.yaml
```

---

## 三、开发阶段

### Phase 1: 图结构核心 (3 天)

**目标**: 实现图结构和构建器

**任务**:

| 任务 | 文件 | 说明 |
|------|------|------|
| 1.1 类型定义 | `collaboration/types.ts` | AgentGraph, AgentNode, GraphEdge |
| 1.2 图结构 | `collaboration/graph.ts` | 基础图数据结构 |
| 1.3 图构建器 | `collaboration/builder.ts` | 流式 API 构建 |
| 1.4 单元测试 | `collaboration/graph.test.ts` | 图结构测试 |
| 1.5 YAML 加载 | `collaboration/loader.ts` | YAML → Graph |

**交付物**:
- ✅ 完整的图类型定义
- ✅ GraphBuilder 流式 API
- ✅ YAML 配置加载

---

### Phase 2: 图执行引擎 (3 天)

**目标**: 实现图执行器

**任务**:

| 任务 | 文件 | 说明 |
|------|------|------|
| 2.1 执行器核心 | `collaboration/executor.ts` | 图遍历执行 |
| 2.2 节点执行 | `collaboration/executor.ts` | Agent 节点调用 LLM |
| 2.3 Handoff 工具 | `collaboration/executor.ts` | 自动生成切换工具 |
| 2.4 条件路由 | `collaboration/executor.ts` | 条件边判断 |
| 2.5 单元测试 | `collaboration/executor.test.ts` | 执行器测试 |

**交付物**:
- ✅ GraphExecutor 实现
- ✅ Handoff 自动生成
- ✅ 条件路由判断

---

### Phase 3: LangGraph 兼容 (3 天)

**目标**: 实现 LangGraph 适配器

**任务**:

| 任务 | 文件 | 说明 |
|------|------|------|
| 3.1 适配器核心 | `collaboration/langgraph-adapter.ts` | YAML → StateGraph |
| 3.2 State Schema | `collaboration/langgraph-adapter.ts` | 状态定义转换 |
| 3.3 检查点集成 | `collaboration/langgraph-adapter.ts` | Checkpoint 支持 |
| 3.4 中断支持 | `collaboration/langgraph-adapter.ts` | Human-in-the-loop |
| 3.5 统一协调器 | `collaboration/orchestrator.ts` | 双模式切换 |

**依赖**: `@langchain/langgraph`

**交付物**:
- ✅ LangGraphAdapter 实现
- ✅ UnifiedOrchestrator 实现
- ✅ 持久化支持

---

### Phase 4: 心跳管理 (2 天)

**目标**: 实现 Agent 心跳检测

**任务**:

| 任务 | 文件 | 说明 |
|------|------|------|
| 4.1 类型定义 | `heartbeat/types.ts` | HeartbeatConfig, AgentState |
| 4.2 心跳管理器 | `heartbeat/manager.ts` | 接收、检查、告警 |
| 4.3 心跳客户端 | `heartbeat/client.ts` | Agent 端发送 |
| 4.4 超时策略 | `heartbeat/manager.ts` | 离线处理 |
| 4.5 单元测试 | `heartbeat/manager.test.ts` | 心跳测试 |

**交付物**:
- ✅ HeartbeatManager 实现
- ✅ 超时检测
- ✅ 离线告警

---

### Phase 5: 云服务监控 (3 天)

**目标**: 实现实时监控

**任务**:

| 任务 | 文件 | 说明 |
|------|------|------|
| 5.1 事件类型 | `monitoring/types.ts` | AgentEvent 定义 |
| 5.2 事件广播 | `monitoring/broadcaster.ts` | WebSocket 推送 |
| 5.3 可观测执行器 | `collaboration/executor.ts` | 自动发射事件 |
| 5.4 指标收集 | `monitoring/collector.ts` | 统计指标 |
| 5.5 告警系统 | `monitoring/alert.ts` | 飞书告警 |

**交付物**:
- ✅ EventBroadcaster 实现
- ✅ WebSocket 实时推送
- ✅ 飞书告警集成

---

### Phase 6: CLI 与 API (2 天)

**目标**: 实现命令行和 API

**任务**:

| 任务 | 文件 | 说明 |
|------|------|------|
| 6.1 图命令 | `cli/commands/graph.ts` | load/run/status |
| 6.2 工具集成 | `tools/graph-tool.ts` | Agent 内部调用 |
| 6.3 REST API | `core/api.ts` | HTTP 接口 |
| 6.4 文档 | `docs/collaboration-v2.md` | 使用文档 |

**交付物**:
- ✅ CLI 命令实现
- ✅ REST API
- ✅ 使用文档

---

### Phase 7: 集成测试 (2 天)

**目标**: 完整测试

**任务**:

| 任务 | 说明 |
|------|------|
| 7.1 模型训练场景 | 完整流程测试 |
| 7.2 代码审查场景 | 轻量级模式测试 |
| 7.3 中断恢复测试 | LangGraph 模式 |
| 7.4 性能测试 | 并发、内存 |

**交付物**:
- ✅ 完整测试用例
- ✅ 示例工作流

---

## 四、详细任务清单

### Phase 1: 图结构核心

```markdown
- [ ] 1.1 创建 `src/core/collaboration/` 目录
- [ ] 1.2 实现 `types.ts` - 定义 AgentGraph, AgentNode, GraphEdge
- [ ] 1.3 实现 `graph.ts` - 图基础操作
- [ ] 1.4 实现 `builder.ts` - GraphBuilder 流式 API
- [ ] 1.5 实现 `loader.ts` - YAML 配置加载
- [ ] 1.6 编写 `graph.test.ts` - 单元测试
- [ ] 1.7 创建 `workflows/examples/` 目录
- [ ] 1.8 添加示例 YAML 配置
```

### Phase 2: 图执行引擎

```markdown
- [ ] 2.1 实现 `executor.ts` - GraphExecutor 核心逻辑
- [ ] 2.2 实现节点执行 - 调用 LLM 并处理响应
- [ ] 2.3 实现 Handoff 工具生成
- [ ] 2.4 实现条件路由判断
- [ ] 2.5 实现执行日志
- [ ] 2.6 编写 `executor.test.ts`
```

### Phase 3: LangGraph 兼容

```markdown
- [ ] 3.1 安装 @langchain/langgraph 依赖
- [ ] 3.2 实现 `langgraph-adapter.ts`
- [ ] 3.3 实现 State Schema 转换
- [ ] 3.4 实现 Checkpoint 集成
- [ ] 3.5 实现中断支持
- [ ] 3.6 实现 `orchestrator.ts` - UnifiedOrchestrator
- [ ] 3.7 编写适配器测试
```

### Phase 4: 心跳管理

```markdown
- [ ] 4.1 创建 `src/core/heartbeat/` 目录
- [ ] 4.2 实现 `types.ts`
- [ ] 4.3 实现 `manager.ts` - HeartbeatManager
- [ ] 4.4 实现 `client.ts` - AgentHeartbeatClient
- [ ] 4.5 实现超时检测和告警
- [ ] 4.6 编写心跳测试
```

### Phase 5: 云服务监控

```markdown
- [ ] 5.1 创建 `src/core/monitoring/` 目录
- [ ] 5.2 实现 `types.ts` - AgentEvent
- [ ] 5.3 实现 `broadcaster.ts` - EventBroadcaster
- [ ] 5.4 集成到 GraphExecutor
- [ ] 5.5 实现指标收集
- [ ] 5.6 实现飞书告警
```

### Phase 6: CLI 与 API

```markdown
- [ ] 6.1 实现 `cli/commands/graph.ts`
- [ ] 6.2 实现工具 `tools/graph-tool.ts`
- [ ] 6.3 实现 REST API
- [ ] 6.4 编写文档 `docs/collaboration-v2.md`
```

### Phase 7: 集成测试

```markdown
- [ ] 7.1 模型训练场景测试
- [ ] 7.2 代码审查场景测试
- [ ] 7.3 中断恢复测试
- [ ] 7.4 性能测试
- [ ] 7.5 文档完善
```

---

## 五、依赖项

```json
{
  "dependencies": {
    "@langchain/langgraph": "^0.2.0",
    "@langchain/langgraph-checkpoint-sqlite": "^0.1.0",
    "js-yaml": "^4.1.0",
    "ws": "^8.16.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.10",
    "@types/js-yaml": "^4.0.9"
  }
}
```

---

## 六、里程碑

| 里程碑 | 时间 | 交付 |
|--------|------|------|
| M1: 图结构 | Day 3 | GraphBuilder + YAML |
| M2: 执行引擎 | Day 6 | GraphExecutor |
| M3: LangGraph | Day 9 | 适配器 + 持久化 |
| M4: 心跳 | Day 11 | 心跳检测 |
| M5: 监控 | Day 14 | WebSocket + 告警 |
| M6: CLI | Day 16 | 命令行 |
| M7: 测试 | Day 18 | 完整测试 |

---

## 七、风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| LangGraph API 变化 | 锁定版本，关注更新 |
| WebSocket 稳定性 | 自动重连、心跳检测 |
| 性能问题 | 异步执行、流式处理 |
| 复杂度增加 | 模块化、文档完善 |

---

## 八、下一步行动

1. **立即**: 创建目录结构
2. **今天**: 完成 Phase 1 类型定义
3. **明天**: 实现 GraphBuilder

---

*创建日期: 2026-04-01*
*分支: multi*
*预计工期: 18 天*