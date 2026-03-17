# SecureBot 用户体验优化方案

## 一、当前用户体验分析

### 1.1 启动体验

**现状**:
```
配置文件不存在，创建默认配置...
检查 Ollama 连接...
✓ Ollama 连接成功
✓ 记忆系统就绪 (0 条记忆)
  记忆目录: ~/.securebot/memory
✓ RAG 已连接到记忆系统 (Agent: dev)
事件系统就绪

╔══════════════════════════════════════════╗
║         SecureBot v1.0.0                 ║
║     安全的多Agent AI助手                 ║
╚══════════════════════════════════════════╝

当前 Agent: 开发助手
输入 /help 查看帮助
```

**问题**:
- 信息过多，用户可能不需要看这么多初始化细节
- 缺少进度指示

**优化建议**:
```
⠋ 正在启动...
✓ SecureBot v1.0.0 就绪 [Agent: 开发助手]

输入消息开始对话，或 /help 查看帮助
```

### 1.2 命令行交互

**现状**:
```
[开发助手] > 
```

**问题**:
- 提示符单调
- 不知道当前任务状态
- 缺少上下文信息

**优化建议**:
```
[开发助手 📋2/5] >     # 显示任务进度
[开发助手 ⏳] >         # 显示正在执行
[开发助手 ⚠️] >         # 显示有错误需要处理
```

### 1.3 工具调用反馈

**现状**:
```
[执行工具: write]
参数: {"path": "test.txt", "content": "..."}
✓ 成功
```

**问题**:
- 长时间操作无进度提示
- 缺少操作耗时显示

**优化建议**:
```
⠋ 正在写入 test.txt...
✓ 写入完成 (1.2s, 2.3KB)
```

### 1.4 错误提示

**现状**:
```
❌ 发生错误: cannot convert undefined or null to object
堆栈: TypeError: cannot convert undefined...
请检查配置或重新启动 SecureBot
```

**问题**:
- 技术性错误信息对普通用户不友好
- 缺少解决建议

**优化建议**:
```
❌ 操作失败

原因: 系统遇到了一个内部错误

建议:
  1. 使用 /reset 重置会话
  2. 使用 /monitor errors 查看详细错误
  3. 如问题持续，请提交反馈

[详细信息] TypeError: cannot convert undefined...
```

---

## 二、优化实施建议

### 2.1 高优先级 (P0)

| 优化项 | 说明 | 工作量 |
|--------|------|--------|
| 简化启动信息 | 只显示关键信息，其他用 spinner | 1h |
| 添加操作耗时 | 工具调用显示耗时 | 0.5h |
| 友好错误提示 | 提供解决建议 | 1h |

### 2.2 中优先级 (P1)

| 优化项 | 说明 | 工作量 |
|--------|------|--------|
| 智能提示符 | 显示任务状态 | 2h |
| 历史命令 | 上下键切换历史 | 2h |
| Tab 补全 | 命令和文件路径补全 | 3h |

### 2.3 低优先级 (P2)

| 优化项 | 说明 | 工作量 |
|--------|------|--------|
| 上下文感知提示 | 根据任务状态提示下一步 | 3h |
| 快捷命令 | !e = /exec, !w = /write | 1h |
| 进度条 | 长任务显示进度 | 2h |

---

## 三、具体实现示例

### 3.1 简化启动流程

```typescript
// 使用 ora 显示加载动画
async function showStartupProgress() {
  const spinner = ora('正在启动 SecureBot...').start();
  
  await checkOllama();
  spinner.text = '连接 Ollama...';
  
  await initMemory();
  spinner.text = '初始化记忆系统...';
  
  spinner.succeed('SecureBot v1.0.0 就绪');
  
  console.log();
  console.log(chalk.gray(`Agent: ${agent.name}`));
  console.log(chalk.gray('输入 /help 查看帮助'));
}
```

### 3.2 智能提示符

```typescript
function getPrompt(state: ReplState, session: Session): string {
  const agent = state.agents.get(state.currentAgentId);
  const plan = session.plan;
  
  let status = '';
  if (plan) {
    const completed = plan.steps.filter(s => s.status === 'completed').length;
    const total = plan.steps.length;
    status = chalk.gray(` ${completed}/${total}`);
  }
  
  return chalk.cyan(`[${agent?.name}${status}] > `);
}
```

### 3.3 友好错误处理

```typescript
function showError(error: Error): void {
  console.log();
  console.log(chalk.red('❌ 操作失败'));
  console.log();
  
  // 简化错误信息
  const friendlyMessages: Record<string, string> = {
    'ENOENT': '文件或目录不存在',
    'EACCES': '权限不足',
    'ETIMEDOUT': '操作超时',
    'ECONNREFUSED': '无法连接服务',
  };
  
  const reason = friendlyMessages[error.code || ''] || error.message;
  console.log(chalk.white(`原因: ${reason}`));
  
  // 提供建议
  console.log();
  console.log(chalk.cyan('建议:'));
  const suggestions = getErrorSuggestions(error);
  suggestions.forEach((s, i) => {
    console.log(chalk.gray(`  ${i + 1}. ${s}`));
  });
}
```

---

## 四、效果对比

### 优化前
```
[开发助手] > 帮我写一个登录页面

🔍 检测到复杂任务，系统将先制定计划...

📋 任务计划已生成:
┌─────────────────────────────────────┐
│ 📋 登录页面开发计划                  │
├─────────────────────────────────────┤
│ ⬜ 创建 HTML 结构                    │
│ ⬜ 添加 CSS 样式                      │
│ ⬜ 实现表单验证                       │
└─────────────────────────────────────┘

计划已生成，等待您的确认...
确认执行请输入: "继续"、"执行"、"开始"
```

### 优化后
```
[开发助手] > 帮我写一个登录页面

⠋ 分析任务中...
✓ 检测到复杂任务，已生成计划

📋 登录页面开发计划
  ⬜ 创建 HTML 结构
  ⬜ 添加 CSS 样式  
  ⬜ 实现表单验证

输入 "继续" 开始执行
```

---

## 五、推荐优先实施

1. **简化启动信息** (P0) - 第一印象很重要
2. **友好错误提示** (P0) - 错误体验影响大
3. **智能提示符** (P1) - 每次交互都会看到

预计总工作量: 4-5 小时