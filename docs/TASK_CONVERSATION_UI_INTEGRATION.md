# 任务对话分屏UI集成方案

## 当前状态

✅ **已完成**：
- 分屏UI组件 (`task-conversation-ui.ts`)
- 左右分屏布局
- 消息显示区域
- 右侧信息栏
- 底部输入框

⏳ **待集成**：
- 替换现有任务对话实现
- 连接任务执行过程
- 实时更新右侧信息

---

## 集成步骤

### 1. 修改任务对话功能 (repl-commands.ts)

**现有实现**（2180-2320行）：
- 使用 `while(true)` 循环
- 每次显示最近20条消息
- 用户输入消息后处理

**新实现**：
```typescript
// 任务对话功能（所有状态）- 使用分屏UI
actions.push({
  key: 'm',
  label: '任务对话',
  handler: async () => {
    const { TaskConversationUI } = await import('./task-conversation-ui.js');
    
    // 1. 创建UI实例
    const ui = new TaskConversationUI({
      id: delegation.id,
      task: delegation.task,
      status: delegation.status,
      delegator: delegation.delegator,
      delegatee: delegation.delegatee,
      workspace: delegation.sharedWorkspace
    });
    
    // 2. 加载历史消息
    const history = delegation.conversationHistory || [];
    for (const msg of history) {
      ui.addMessage({
        id: msg.id,
        sender: msg.sender,
        content: msg.content,
        timestamp: msg.timestamp,
        type: msg.type === 'system' ? 'system' : 'user'
      });
    }
    
    // 3. 更新右侧信息
    ui.updateWorkspace();
    ui.setTodos(delegation.acceptanceCriteria || []);
    ui.setContext([
      `状态: ${delegation.status}`,
      `轮次: ${delegation.currentRound || 0}`
    ]);
    
    // 4. 设置消息回调
    ui.onMessage(async (content: string) => {
      // 处理@提及
      const otherParty = isDelegator ? delegation.delegatee : delegation.delegator;
      const hasMention = sessionManager.detectMention(content, otherParty);
      
      if (hasMention && delegation.status === 'pending' && isDelegator) {
        // 自动接受逻辑
        await handleAutoAccept(content, ui);
      } else {
        // 普通消息发送
        await sendMessage(content, ui);
      }
    });
    
    // 5. 启动UI
    await ui.start();
    
    return false;
  }
});
```

### 2. 连接任务执行过程 (repl.ts)

在任务执行器中，将工具调用发送到UI：

```typescript
// 在 repl.ts 的 executeTaskWithAgent 函数中
// 将UI实例传递给执行器

async function executeTaskWithAgent(
  state: ReplState,
  agent: any,
  task: string,
  delegation: any,
  conversationUI?: TaskConversationUI  // 新增参数
): Promise<string | null> {
  // ...
  
  // 工具调用时
  if (conversationUI) {
    conversationUI.addMessage({
      id: `tool-${Date.now()}`,
      sender: 'system',
      content: `🔧 调用工具: ${toolCall.name}`,
      timestamp: Date.now(),
      type: 'tool'
    });
  }
  
  // 工具结果
  if (conversationUI) {
    conversationUI.addMessage({
      id: `result-${Date.now()}`,
      sender: 'system',
      content: `✓ 工具结果: ${toolResult.content?.slice(0, 100)}`,
      timestamp: Date.now(),
      type: 'tool'
    });
    
    // 更新工作目录
    conversationUI.updateWorkspace();
  }
}
```

### 3. 修改执行流程

在 `collaboration.ts` 中传递UI实例：

```typescript
// 设置执行器时传递UI
this.executor = async (delegation) => {
  // 获取或创建UI实例
  const ui = this.conversationUIs.get(delegation.id);
  
  return await executeTaskWithAgent(
    state,
    agent,
    task,
    delegation,
    ui  // 传递UI实例
  );
};
```

---

## 数据流

```
用户输入消息
    ↓
UI.onMessage回调
    ↓
处理@提及/发送消息
    ↓
更新delegation数据
    ↓
UI.addMessage显示
    ↓
右侧信息栏更新
```

```
任务执行过程
    ↓
工具调用
    ↓
UI.addMessage(工具调用)
    ↓
工具执行
    ↓
UI.addMessage(工具结果)
    ↓
UI.updateWorkspace()
```

---

## 优势

1. **用户可以随时输入** - 不阻塞执行过程
2. **执行过程可见** - 工具调用实时显示
3. **信息集中展示** - TODO/Context/文件都在右侧
4. **更好的体验** - 类似opencode的分屏设计

---

## 注意事项

1. **UI生命周期管理**
   - 创建时机：进入任务对话
   - 销毁时机：退出任务对话或任务完成

2. **消息同步**
   - UI消息与delegation.conversationHistory保持同步
   - 使用conversationStorage持久化

3. **性能考虑**
   - 工具调用频繁时可能影响性能
   - 可以节流显示（只显示重要事件）

4. **错误处理**
   - UI创建失败时回退到旧实现
   - 消息发送失败时显示错误提示

---

## 测试计划

1. ✅ UI组件独立测试
2. ⏳ 任务对话集成测试
3. ⏳ 执行过程显示测试
4. ⏳ 用户输入不阻塞测试
5. ⏳ 右侧信息更新测试

---

## 下一步行动

**选项1**: 完整集成（推荐）
- 替换现有实现
- 全面测试
- 预计时间：1-2小时

**选项2**: 渐进式集成
- 保留旧实现作为后备
- 新UI作为可选功能
- 预计时间：30分钟

**选项3**: 文档先行
- 完善集成文档
- 后续再实现
- 预计时间：10分钟

---

## 建议

鉴于集成工作的复杂性，我建议：

1. **先提交当前进度** - UI组件已完成
2. **选择集成方案** - 根据时间和需求选择
3. **分步实现** - 先集成基础功能，再完善细节

您希望：
- A. 现在立即完整集成
- B. 渐进式集成（保留旧实现）
- C. 暂时使用文档，后续再集成

请告诉我您的选择。