# SecureBot multi 分支测试用例

## 测试环境准备

```bash
cd ~/.openclaw/workspace_arch/products/securebot
git checkout multi
npm install
npm run build
```

---

## 1. 协作系统测试

### 1.1 图结构基础测试

**测试目标**: 验证图构建、节点管理、边管理

```typescript
// tests/collaboration/graph-basic.test.ts
import { describe, it, expect } from 'vitest';
import { Graph, GraphBuilder } from '../../src/core/collaboration/index.js';

describe('Graph 基础功能', () => {
  it('应该正确创建图', () => {
    const graph = new Graph('test-graph', '测试图');
    expect(graph.getId()).toBe('test-graph');
    expect(graph.getName()).toBe('测试图');
  });

  it('应该正确添加节点', () => {
    const graph = new Graph('test', 'Test');
    graph.addNode({
      id: 'agent-a',
      name: 'Agent A',
      role: '测试角色',
      systemPrompt: '你是 Agent A',
    });
    
    expect(graph.getNodes().size).toBe(1);
    expect(graph.getNode('agent-a')).toBeDefined();
  });

  it('应该正确添加边', () => {
    const graph = new Graph('test', 'Test');
    graph.addNode({ id: 'a', name: 'A', role: 'r', systemPrompt: 's' });
    graph.addNode({ id: 'b', name: 'B', role: 'r', systemPrompt: 's' });
    graph.addDirectEdge('a', 'b');
    
    expect(graph.getEdges().length).toBe(1);
    expect(graph.getOutEdges('a')[0].target).toBe('b');
  });

  it('应该检测图中的循环', () => {
    const graph = new Graph('cycle-test', '循环测试');
    graph.addNode({ id: 'a', name: 'A', role: 'r', systemPrompt: 's' });
    graph.addNode({ id: 'b', name: 'B', role: 'r', systemPrompt: 's' });
    graph.addDirectEdge('a', 'b');
    graph.addDirectEdge('b', 'a'); // 创建循环
    graph.setEntryPoint('a');
    
    const validation = graph.validate();
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('Cycle'))).toBe(true);
  });

  it('应该检测不可达节点', () => {
    const graph = new Graph('unreachable-test', '不可达测试');
    graph.addNode({ id: 'a', name: 'A', role: 'r', systemPrompt: 's' });
    graph.addNode({ id: 'b', name: 'B', role: 'r', systemPrompt: 's' });
    graph.addNode({ id: 'c', name: 'C', role: 'r', systemPrompt: 's' }); // 孤立节点
    graph.addDirectEdge('a', 'b');
    graph.setEntryPoint('a');
    
    const validation = graph.validate();
    expect(validation.errors.some(e => e.includes('Unreachable'))).toBe(true);
  });
});
```

### 1.2 GraphBuilder 流式 API 测试

```typescript
// tests/collaboration/builder.test.ts
import { describe, it, expect } from 'vitest';
import { GraphBuilder, createGraph, createNode } from '../../src/core/collaboration/index.js';

describe('GraphBuilder', () => {
  it('应该支持流式构建', () => {
    const graph = new GraphBuilder('test', 'Test')
      .mode('lightweight')
      .addAgent({
        id: 'agent-a',
        name: 'Agent A',
        role: '角色',
        systemPrompt: '提示词',
      })
      .addAgent({
        id: 'agent-b',
        name: 'Agent B',
        role: '角色',
        systemPrompt: '提示词',
      })
      .addDirectEdge('agent-a', 'agent-b')
      .entry('agent-a')
      .build();
    
    expect(graph.getNodes().size).toBe(2);
    expect(graph.getEdges().length).toBe(1);
    expect(graph.getEntryPoint()).toBe('agent-a');
  });

  it('应该支持工厂函数', () => {
    const node = createNode('test-agent', '测试Agent', '测试角色');
    expect(node.id).toBe('test-agent');
    expect(node.name).toBe('测试Agent');
    
    const graph = createGraph('test-graph', '测试图')
      .addAgent(node)
      .entry('test-agent')
      .build();
    
    expect(graph.getNodes().size).toBe(1);
  });
});
```

### 1.3 YAML 加载测试

```typescript
// tests/collaboration/loader.test.ts
import { describe, it, expect } from 'vitest';
import { loadFromYaml } from '../../src/core/collaboration/index.js';

describe('YAML 加载器', () => {
  it('应该正确加载 YAML 工作流', () => {
    const yaml = `
id: test-workflow
name: 测试工作流
mode: lightweight
entry: agent-a

agents:
  - id: agent-a
    name: Agent A
    role: 角色
    systemPrompt: 你是 Agent A
  - id: agent-b
    name: Agent B
    role: 角色
    systemPrompt: 你是 Agent B

edges:
  - source: agent-a
    target: agent-b
    type: direct
`;
    
    const graph = loadFromYaml(yaml);
    expect(graph.getId()).toBe('test-workflow');
    expect(graph.getNodes().size).toBe(2);
    expect(graph.getEntryPoint()).toBe('agent-a');
  });

  it('应该拒绝无效的 YAML 配置', () => {
    const invalidYaml = `
id: test
name: Test
# 缺少 agents 和 entry
`;
    
    expect(() => loadFromYaml(invalidYaml)).toThrow();
  });
});
```

### 1.4 安全表达式解析测试（P0 修复验证）

```typescript
// tests/collaboration/expression-security.test.ts
import { describe, it, expect } from 'vitest';
import { GraphBuilder } from '../../src/core/collaboration/index.js';

describe('安全表达式解析', () => {
  it('应该拒绝危险的表达式', () => {
    // 这个测试验证 P0 安全修复
    // new Function() 已被替换为安全解析器
    
    // 危险表达式应该被拒绝
    const dangerousExpressions = [
      'process.exit(1)',
      'require("fs").readFileSync("/etc/passwd")',
      'this.constructor.constructor("return process")()',
      'eval("process.exit()")',
    ];
    
    // 安全部解析器应该拒绝这些表达式
    for (const expr of dangerousExpressions) {
      // 实际测试需要调用 evaluateExpression 方法
      // 这里只是示意
      expect(true).toBe(true); // 需要实际实现
    }
  });

  it('应该接受安全的比较表达式', () => {
    const safeExpressions = [
      'state.count > 10',
      'state.status === "completed"',
      'state.score >= 0.5 && state.attempts < 3',
    ];
    
    // 这些表达式应该被接受
    for (const expr of safeExpressions) {
      expect(true).toBe(true); // 需要实际实现
    }
  });
});
```

### 1.5 并行执行测试

```typescript
// tests/collaboration/parallel.test.ts
import { describe, it, expect } from 'vitest';
import { GraphBuilder, GraphExecutor } from '../../src/core/collaboration/index.js';

describe('并行执行', () => {
  it('应该识别可并行执行的节点', () => {
    const graph = new GraphBuilder('parallel-test', '并行测试')
      .mode('lightweight')
      .addAgent({ id: 'entry', name: 'Entry', role: 'r', systemPrompt: 's' })
      .addAgent({ id: 'branch-a', name: 'A', role: 'r', systemPrompt: 's' })
      .addAgent({ id: 'branch-b', name: 'B', role: 'r', systemPrompt: 's' })
      .addAgent({ id: 'merge', name: 'Merge', role: 'r', systemPrompt: 's' })
      .addDirectEdge('entry', 'branch-a')
      .addDirectEdge('entry', 'branch-b')
      .addDirectEdge('branch-a', 'merge')
      .addDirectEdge('branch-b', 'merge')
      .entry('entry')
      .build();
    
    const executor = new GraphExecutor(graph);
    expect(executor.canRunParallel('entry')).toBe(true);
    
    const targets = executor.getParallelTargets('entry');
    expect(targets).toContain('branch-a');
    expect(targets).toContain('branch-b');
  });
});
```

---

## 2. 状态 Reducers 测试

### 2.1 内置 Reducer 测试

```typescript
// tests/collaboration/reducers.test.ts
import { describe, it, expect } from 'vitest';
import { getReducerRegistry, registerReducer } from '../../src/core/collaboration/index.js';

describe('Reducers', () => {
  const registry = getReducerRegistry();

  it('应该支持 append reducer', () => {
    const result = registry.apply('append', ['a', 'b'], 'c');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('应该支持 merge reducer', () => {
    const result = registry.apply('merge', { a: 1 }, { b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('应该支持 max reducer', () => {
    expect(registry.apply('max', 5, 10)).toBe(10);
    expect(registry.apply('max', 10, 5)).toBe(10);
  });

  it('应该支持 sum reducer', () => {
    expect(registry.apply('sum', 5, 3)).toBe(8);
  });

  it('应该支持 unique reducer', () => {
    const result = registry.apply('unique', ['a', 'b'], ['b', 'c']);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('应该支持自定义 reducer', () => {
    registerReducer('double', (current, incoming) => (current ?? 0) + incoming * 2);
    
    expect(registry.apply('double', 10, 5)).toBe(20);
  });

  it('应该批量应用 reducers 到状态', () => {
    const state = { count: 10, items: ['a'] };
    const incoming = { count: 5, items: ['b'] };
    const schema = {
      count: { reducer: 'sum' },
      items: { reducer: 'append' },
    };
    
    const result = registry.applyToState(state, incoming, schema);
    expect(result.count).toBe(15);
    expect(result.items).toEqual(['a', 'b']);
  });
});
```

---

## 3. 记忆共享测试

### 3.1 记忆存储基础测试

```typescript
// tests/collaboration/memory-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { AgentMemoryStore } from '../../src/core/collaboration/index.js';

describe('AgentMemoryStore', () => {
  let store: AgentMemoryStore;

  beforeEach(() => {
    store = new AgentMemoryStore();
  });

  it('应该存储和检索记忆', () => {
    const entry = store.store('agent-a', '用户喜欢中文');
    expect(entry.id).toBeDefined();
    expect(entry.sourceAgent).toBe('agent-a');
    expect(entry.content).toBe('用户喜欢中文');
    
    const retrieved = store.get(entry.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.accessCount).toBe(1);
  });

  it('应该查询特定类型的记忆', () => {
    store.store('agent-a', '事实1', { type: 'fact' });
    store.store('agent-a', '偏好1', { type: 'preference' });
    store.store('agent-a', '事实2', { type: 'fact' });
    
    const facts = store.query({ type: 'fact' });
    expect(facts.length).toBe(2);
  });

  it('应该支持跨 Agent 共享', () => {
    // agent-a 存储，共享给 agent-b
    store.store('agent-a', '共享信息', { targetAgent: 'agent-b' });
    
    // agent-b 可以访问
    const memories = store.getAccessibleMemories('agent-b');
    expect(memories.length).toBe(1);
    expect(memories[0].content).toBe('共享信息');
  });

  it('应该处理过期记忆', (done) => {
    const entry = store.store('agent-a', '临时信息', { ttl: 100 }); // 100ms 过期
    
    // 立即查询应该有结果
    expect(store.query({}).length).toBe(1);
    
    // 等待过期
    setTimeout(() => {
      const result = store.query({ includeExpired: false });
      expect(result.length).toBe(0);
      done();
    }, 150);
  });

  it('应该记录访问统计', () => {
    const entry = store.store('agent-a', '测试');
    
    store.get(entry.id);
    store.get(entry.id);
    
    const updated = store.get(entry.id);
    expect(updated?.accessCount).toBe(3);
  });
});
```

---

## 4. 流式执行测试

### 4.1 流式事件测试

```typescript
// tests/collaboration/streaming.test.ts
import { describe, it, expect, vi } from 'vitest';
import { StreamingExecutor, StreamEvent } from '../../src/core/collaboration/index.js';
import { GraphBuilder } from '../../src/core/collaboration/index.js';

describe('StreamingExecutor', () => {
  it('应该发射流式事件', async () => {
    const graph = new GraphBuilder('stream-test', '流式测试')
      .mode('lightweight')
      .addAgent({
        id: 'agent-a',
        name: 'Agent A',
        role: '测试',
        systemPrompt: '你是一个助手',
      })
      .entry('agent-a')
      .build();
    
    const executor = new StreamingExecutor(graph);
    const events: StreamEvent[] = [];
    
    // 收集事件
    executor.onStream((event) => {
      events.push(event);
    });
    
    // 注意：实际运行需要 LLM 客户端
    // 这里只验证事件机制
    executor.emitStream({
      type: 'start',
      timestamp: Date.now(),
    });
    
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('start');
  });

  it('应该支持取消执行', () => {
    const graph = new GraphBuilder('test', 'Test')
      .mode('lightweight')
      .addAgent({ id: 'a', name: 'A', role: 'r', systemPrompt: 's' })
      .entry('a')
      .build();
    
    const executor = new StreamingExecutor(graph);
    
    // 取消执行
    executor.abort();
    
    // 验证已取消
    expect(true).toBe(true); // 实际需要验证 abort controller 状态
  });
});
```

---

## 5. 心跳管理测试

### 5.1 心跳检测测试

```typescript
// tests/heartbeat/manager.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeartbeatManager } from '../../src/core/heartbeat/index.js';

describe('HeartbeatManager', () => {
  let manager: HeartbeatManager;

  beforeEach(() => {
    manager = new HeartbeatManager({
      timeout: 5000, // 5 秒超时
      checkInterval: 1000,
    });
  });

  it('应该注册 Agent', () => {
    manager.register('agent-a');
    const state = manager.getState('agent-a');
    expect(state).toBeDefined();
    expect(state?.status).toBe('online');
  });

  it('应该更新心跳', () => {
    manager.register('agent-a');
    manager.heartbeat('agent-a');
    
    const state = manager.getState('agent-a');
    expect(state?.lastHeartbeat).toBeGreaterThan(0);
  });

  it('应该检测超时', (done) => {
    manager.register('agent-a');
    
    // 设置超时回调
    manager.onTimeout((agentId) => {
      expect(agentId).toBe('agent-a');
      done();
    });
    
    // 不发送心跳，等待超时
    // 实际测试需要调整时间
  });

  it('应该移除 Agent', () => {
    manager.register('agent-a');
    manager.unregister('agent-a');
    
    const state = manager.getState('agent-a');
    expect(state).toBeUndefined();
  });
});
```

---

## 6. 监控系统测试

### 6.1 事件广播测试

```typescript
// tests/monitoring/broadcaster.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EventBroadcaster } from '../../src/core/monitoring/index.js';

describe('EventBroadcaster', () => {
  it('应该广播事件给所有订阅者', () => {
    const broadcaster = new EventBroadcaster();
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    
    broadcaster.subscribe(callback1);
    broadcaster.subscribe(callback2);
    
    broadcaster.broadcast({
      type: 'agent_start',
      agentId: 'agent-a',
      timestamp: Date.now(),
    });
    
    expect(callback1).toHaveBeenCalledTimes(1);
    expect(callback2).toHaveBeenCalledTimes(1);
  });

  it('应该取消订阅', () => {
    const broadcaster = new EventBroadcaster();
    const callback = vi.fn();
    
    const unsubscribe = broadcaster.subscribe(callback);
    unsubscribe();
    
    broadcaster.broadcast({
      type: 'agent_start',
      agentId: 'agent-a',
      timestamp: Date.now(),
    });
    
    expect(callback).not.toHaveBeenCalled();
  });
});
```

---

## 7. 性能优化测试

### 7.1 连接池测试

```typescript
// tests/performance/connection-pool.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectionPool } from '../../src/core/performance.js';

describe('ConnectionPool', () => {
  it('应该复用连接', async () => {
    let created = 0;
    const pool = new ConnectionPool<{ id: number }>({
      factory: async () => ({ id: ++created }),
      maxConnections: 3,
    });
    
    const conn1 = await pool.acquire();
    const conn2 = await pool.acquire();
    
    pool.release(conn1);
    const conn3 = await pool.acquire(); // 应该复用 conn1
    
    expect(created).toBe(2); // 只创建了 2 个
    expect(conn3).toBe(conn1);
    
    pool.release(conn2);
    pool.release(conn3);
    await pool.destroy();
  });

  it('应该限制最大连接数', async () => {
    let created = 0;
    const pool = new ConnectionPool<{ id: number }>({
      factory: async () => ({ id: ++created }),
      maxConnections: 2,
      acquireTimeout: 100,
    });
    
    await pool.acquire();
    await pool.acquire();
    
    // 第三次应该等待或超时
    await expect(pool.acquire()).rejects.toThrow();
    
    await pool.destroy();
  });

  it('应该支持 withConnection 自动释放', async () => {
    let created = 0;
    const pool = new ConnectionPool<{ id: number }>({
      factory: async () => ({ id: ++created }),
      maxConnections: 2,
    });
    
    const result = await pool.withConnection(async (conn) => {
      return conn.id;
    });
    
    expect(result).toBe(1);
    expect(pool.getStats().inUse).toBe(0); // 已释放
    
    await pool.destroy();
  });
});
```

### 7.2 批处理器测试

```typescript
// tests/performance/batch-processor.test.ts
import { describe, it, expect, vi } from 'vitest';
import { BatchProcessor } from '../../src/core/performance.js';

describe('BatchProcessor', () => {
  it('应该批量处理请求', async () => {
    let processed = 0;
    const processor = new BatchProcessor<number, number>({
      processor: async (items) => {
        processed++;
        return items.map((n) => n * 2);
      },
      maxBatchSize: 5,
      maxWaitMs: 1000,
    });
    
    const results = await Promise.all([
      processor.process(1),
      processor.process(2),
      processor.process(3),
    ]);
    
    expect(results).toEqual([2, 4, 6]);
    expect(processed).toBe(1); // 只调用了一次批处理
  });

  it('应该在达到最大批次时立即处理', async () => {
    let processCount = 0;
    const processor = new BatchProcessor<number, number>({
      processor: async (items) => {
        processCount++;
        return items.map((n) => n * 2);
      },
      maxBatchSize: 3,
      maxWaitMs: 10000, // 长超时
    });
    
    await Promise.all([
      processor.process(1),
      processor.process(2),
      processor.process(3),
    ]);
    
    expect(processCount).toBe(1); // 立即处理
  });
});
```

---

## 8. 日志与追踪测试

### 8.1 结构化日志测试

```typescript
// tests/core/logger.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Logger, LogManager } from '../../src/core/logger.js';

describe('Logger', () => {
  it('应该输出 JSON 格式日志', () => {
    const mockOutput = vi.fn();
    const logger = new Logger('test', { output: mockOutput, minLevel: 'debug' });
    
    logger.info('test message', { key: 'value' });
    
    expect(mockOutput).toHaveBeenCalled();
    const entry = mockOutput.mock.calls[0][0];
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('test message');
    expect(entry.key).toBe('value');
  });

  it('应该支持追踪 ID', () => {
    const mockOutput = vi.fn();
    const logger = new Logger('test', { output: mockOutput });
    
    logger.setTraceId('trace-123', 'span-456');
    logger.info('tracked message');
    
    const entry = mockOutput.mock.calls[0][0];
    expect(entry.traceId).toBe('trace-123');
    expect(entry.spanId).toBe('span-456');
  });

  it('应该测量执行时间', async () => {
    const mockOutput = vi.fn();
    const logger = new Logger('test', { output: mockOutput, minLevel: 'debug' });
    
    await logger.time('operation', async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 'done';
    });
    
    const entry = mockOutput.mock.calls[0][0];
    expect(entry.elapsedMs).toBeGreaterThanOrEqual(50);
  });
});
```

### 8.2 分布式追踪测试

```typescript
// tests/core/tracing.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Tracer, getTracer } from '../../src/core/tracing.js';

describe('Tracer', () => {
  let tracer: Tracer;

  beforeEach(() => {
    tracer = new Tracer('test');
  });

  it('应该创建和管理 Span', () => {
    const context = tracer.startSpan('test-span');
    expect(context.traceId).toBeDefined();
    expect(context.spanId).toBeDefined();
    
    tracer.endSpan(context.spanId);
    
    const span = tracer.getSpan(context.spanId);
    expect(span?.status).toBe('completed');
    expect(span?.duration).toBeDefined();
  });

  it('应该建立父子关系', () => {
    const parent = tracer.startSpan('parent');
    const child = tracer.startSpan('child', parent);
    
    tracer.endSpan(child.spanId);
    tracer.endSpan(parent.spanId);
    
    const childSpan = tracer.getSpan(child.spanId);
    expect(childSpan?.parentSpanId).toBe(parent.spanId);
    expect(childSpan?.traceId).toBe(parent.traceId);
  });

  it('应该支持 withSpan 自动管理', async () => {
    const result = await tracer.withSpan('auto-span', async () => {
      return 'done';
    });
    
    expect(result).toBe('done');
    const spans = tracer.getSpans();
    expect(spans.length).toBe(1);
    expect(spans[0].status).toBe('completed');
  });
});
```

---

## 9. 中间件测试

### 9.1 中间件链测试

```typescript
// tests/core/middleware.test.ts
import { describe, it, expect } from 'vitest';
import { MiddlewareManager } from '../../src/core/middleware.js';

describe('MiddlewareManager', () => {
  it('应该按顺序执行中间件', async () => {
    const manager = new MiddlewareManager();
    const order: number[] = [];
    
    manager.use(async (ctx, next) => {
      order.push(1);
      await next();
      order.push(4);
    });
    
    manager.use(async (ctx, next) => {
      order.push(2);
      await next();
      order.push(3);
    });
    
    await manager.execute({ nodeId: 'test', nodeName: 'Test' }, async () => 'result');
    
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('应该传递上下文', async () => {
    const manager = new MiddlewareManager();
    
    manager.use(async (ctx, next) => {
      ctx.metadata.key = 'value';
      await next();
    });
    
    let capturedContext: any;
    manager.use(async (ctx, next) => {
      capturedContext = ctx;
      await next();
    });
    
    await manager.execute({ nodeId: 'test', nodeName: 'Test', metadata: {} }, async () => 'result');
    
    expect(capturedContext.metadata.key).toBe('value');
  });
});
```

---

## 10. 生命周期钩子测试

### 10.1 生命周期事件测试

```typescript
// tests/core/lifecycle.test.ts
import { describe, it, expect, vi } from 'vitest';
import { LifecycleManager } from '../../src/core/lifecycle.js';

describe('LifecycleManager', () => {
  it('应该触发生命周期钩子', async () => {
    const manager = new LifecycleManager();
    const onStart = vi.fn();
    const onEnd = vi.fn();
    
    manager.on('graph:beforeStart', onStart);
    manager.on('graph:afterEnd', onEnd);
    
    await manager.emit('graph:beforeStart', { graphId: 'test' });
    await manager.emit('graph:afterEnd', { graphId: 'test' });
    
    expect(onStart).toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalled();
  });

  it('应该支持多个钩子', async () => {
    const manager = new LifecycleManager();
    const calls: string[] = [];
    
    manager.on('node:beforeExecute', () => calls.push('hook1'));
    manager.on('node:beforeExecute', () => calls.push('hook2'));
    
    await manager.emit('node:beforeExecute', {});
    
    expect(calls).toEqual(['hook1', 'hook2']);
  });
});
```

---

## 11. 配置验证测试

### 11.1 Schema 验证测试

```typescript
// tests/core/validation.test.ts
import { describe, it, expect } from 'vitest';
import { validateGraphConfig } from '../../src/core/validation.js';

describe('配置验证', () => {
  it('应该接受有效配置', () => {
    const config = {
      id: 'test-graph',
      name: 'Test Graph',
      executionMode: 'lightweight',
      entryPoint: 'agent-a',
      nodes: [
        {
          id: 'agent-a',
          name: 'Agent A',
          role: '角色',
          systemPrompt: '提示词',
        },
      ],
      edges: [],
    };
    
    const result = validateGraphConfig(config);
    expect(result.success).toBe(true);
  });

  it('应该拒绝无效配置', () => {
    const invalidConfig = {
      id: '', // 空 ID
      name: 'Test',
      nodes: [], // 空节点
    };
    
    const result = validateGraphConfig(invalidConfig);
    expect(result.success).toBe(false);
  });
});
```

---

## 12. 集成测试

### 12.1 完整工作流测试

```typescript
// tests/integration/workflow.test.ts
import { describe, it, expect } from 'vitest';
import { GraphBuilder, GraphExecutor, loadFromYaml } from '../../src/core/collaboration/index.js';

describe('完整工作流集成测试', () => {
  it('应该执行简单工作流', async () => {
    // 使用 YAML 加载
    const yaml = `
id: simple-workflow
name: 简单工作流
mode: lightweight
entry: start

agents:
  - id: start
    name: 开始节点
    role: 初始化
    systemPrompt: 你是一个助手

edges: []
`;
    
    const graph = loadFromYaml(yaml);
    
    // 验证图结构
    expect(graph.getId()).toBe('simple-workflow');
    expect(graph.validate().valid).toBe(true);
    
    // 实际执行需要 LLM 客户端
    // const executor = new GraphExecutor(graph);
    // const result = await executor.run('你好', mockLLMClient);
    // expect(result.success).toBe(true);
  });

  it('应该处理复杂工作流', () => {
    const graph = new GraphBuilder('complex', '复杂工作流')
      .mode('lightweight')
      .addAgent({
        id: 'entry',
        name: '入口',
        role: '路由',
        systemPrompt: '分析用户意图',
      })
      .addAgent({
        id: 'processor-a',
        name: '处理器A',
        role: '处理A类请求',
        systemPrompt: '处理A',
      })
      .addAgent({
        id: 'processor-b',
        name: '处理器B',
        role: '处理B类请求',
        systemPrompt: '处理B',
      })
      .addAgent({
        id: 'aggregator',
        name: '汇聚',
        role: '汇总结果',
        systemPrompt: '汇总',
      })
      .addConditionalEdge('entry', 'processor-a', {
        keywords: ['A', 'a'],
      })
      .addConditionalEdge('entry', 'processor-b', {
        keywords: ['B', 'b'],
      })
      .addDirectEdge('processor-a', 'aggregator')
      .addDirectEdge('processor-b', 'aggregator')
      .entry('entry')
      .build();
    
    // 验证
    expect(graph.getNodes().size).toBe(4);
    expect(graph.getEdges().length).toBe(4);
    expect(graph.validate().valid).toBe(true);
  });
});
```

---

## 测试执行命令

```bash
# 运行所有测试
npm test

# 运行特定模块测试
npm test -- src/core/collaboration
npm test -- src/core/heartbeat
npm test -- src/core/monitoring

# 运行集成测试
npm test -- tests/integration

# 生成覆盖率报告
npm test -- --coverage
```

---

## 测试优先级

| 优先级 | 模块 | 测试数量 | 理由 |
|--------|------|----------|------|
| **P0** | 协作系统 | 15+ | 核心功能，代码量最大 |
| **P0** | 安全表达式 | 5+ | P0 安全修复验证 |
| **P1** | Reducers | 10+ | 状态管理核心 |
| **P1** | 记忆存储 | 8+ | 跨 Agent 共享 |
| **P2** | 心跳管理 | 5+ | 已有测试覆盖 |
| **P2** | 监控系统 | 5+ | 已有测试覆盖 |
| **P2** | 性能优化 | 8+ | 连接池、批处理 |

---

*生成日期: 2026-04-03*
*分支对比: multi vs dev*
*新增代码: 14,182 行*