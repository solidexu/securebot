# SecureBot 三层记忆架构加载流程分析

## 一、三层记忆加载流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         buildSystemPrompt()                                  │
│                         src/core/session.ts:565                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       loadMemoryContext(memoryDir, agentId)                 │
│                         src/core/session.ts:127                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│   loadUserProfile()  │  │  loadAgentProfile()  │  │ loadRecentDailyNotes │
│   session.ts:17      │  │   session.ts:62      │  │    session.ts:76     │
│                      │  │                      │  │                      │
│ 读取 user.json       │  │ 读取 agent_xxx.json  │  │ 读取 daily/*.json    │
│ ↓                    │  │ ↓                    │  │ ↓                    │
│ - name/nickname      │  │ - role               │  │ - 最近3天笔记        │
│ - preferences        │  │ - skills             │  │                      │
│ - facts ✓ (注入)     │  │ - experience         │  │                      │
│ - keyInfo ✗ (忽略)   │  │                      │  │                      │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
          │                           │                           │
          └───────────────────────────┼───────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     注入到系统提示词                                          │
│                                                                              │
│ ## 用户档案                                                                  │
│ - 姓名: ...                                                                  │
│                                                                              │
│ ### 已知事实                    ← facts 被注入                              │
│ - [knowledge|95%] 我是 Python 开发者                                         │
│ - [knowledge|90%] 我是 C++ 开发                                              │
│                                                                              │
│ ## 你的档案                                                                  │
│ - 角色: ...                                                                  │
│                                                                              │
│ ## 最近工作记录                                                              │
│ ### 2026-03-30                                                               │
│ ...                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Layer 3: RAG (按需检索)                                  │
│                                                                              │
│ 用户或模型主动调用 rag_search 工具时检索                                      │
│ 不自动注入，需要显式调用                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、keyInfo vs facts 对比

### 数据结构

```typescript
// user.json
{
  "keyInfo": {
    "我": "C++开发，置信度90%",
    "programming_languages": "Python (95%), C++ (80%)",
    "skills": "全栈开发，精通Python和C++"
  },
  "facts": [
    {
      "id": "fact_xxx",
      "content": "我是 python 开发者",
      "category": "knowledge",
      "confidence": 0.95,
      "createdAt": "2026-03-30T03:40:39.537Z",
      "source": "dev"
    }
  ]
}
```

### 使用场景

| 维度 | keyInfo | facts |
|------|---------|-------|
| **写入工具** | `set_user_info` | `add_fact` |
| **读取工具** | `get_user_info` | `get_facts` |
| **注入对话** | ❌ **不注入** | ✅ **注入** |
| **LLM 可见** | ❌ 不可见 | ✅ 可见 |
| **结构化** | ❌ 简单键值对 | ✅ 结构化 |
| **置信度** | ❌ 无 | ✅ 有 |
| **分类** | ❌ 无 | ✅ 有 |
| **去重** | ❌ 无 | ✅ 有 |

### 代码追踪

**keyInfo 使用位置：**

```typescript
// 1. tools/memory.ts - set_user_info 工具
async execute(params) {
  await memoryManager.rememberKeyInfo(key, value);  // 写入 keyInfo
}

// 2. tools/memory.ts - get_user_info 工具
async execute(params) {
  const value = profile.keyInfo[key];  // 读取 keyInfo
}

// 3. core/memory.ts - rememberKeyInfo 方法
async rememberKeyInfo(key: string, value: string) {
  this.userProfile.keyInfo[key] = value;  // 存储
  await this.remember('system', `记住: ${key} = ${value}`, ...);  // 同时写入每日笔记
}
```

**facts 使用位置：**

```typescript
// 1. tools/memory.ts - add_fact 工具
async execute(params) {
  const fact = await memoryManager.addFact(content, category, confidence);
}

// 2. core/session.ts - loadUserProfile 函数
function loadUserProfile(memoryDir: string): string | null {
  // ... 
  if (profile.facts?.length) {
    lines.push('\n### 已知事实');
    for (const fact of sortedFacts.slice(0, 10)) {
      lines.push(`- [${cat}|${conf}%] ${fact.content}`);
    }
  }
  // 注入到系统提示词
}

// 3. commands/fact.ts - /fact 命令
export async function handleFactCommand(args: string) {
  // 直接操作 facts
}
```

---

## 三、问题总结

### 问题 1: keyInfo 不注入到对话

**现象：**
```bash
> 用 set_user_info 记录: 我喜欢用中文
✓ 已记录用户信息: 我喜欢用中文

> 你知道我喜欢用什么语言吗？
LLM: 抱歉，我不知道您的语言偏好...  # LLM 不知道！
```

**原因：** `loadUserProfile()` 完全忽略了 `keyInfo` 字段

### 问题 2: 两套格式并存，用户混乱

**现象：**
```
用户档案:
  keyInfo: { "我": "C++开发者" }    # set_user_info 添加
  facts: [{ content: "我是C++开发者" }]  # add_fact 添加

LLM 只看到 facts，看不到 keyInfo
```

### 问题 3: 工具职责不清

| 工具 | 存储位置 | 注入 | 用途 |
|------|---------|------|------|
| `set_user_info` | keyInfo | ❌ | ？ |
| `add_fact` | facts | ✅ | 记录事实 |
| `/fact add` | facts | ✅ | 命令行记录 |

用户不知道该用哪个工具。

---

## 四、优化建议

### 方案 A: 统一使用 facts（推荐）

**步骤：**

1. **修改 set_user_info 工具**，写入 facts 而非 keyInfo
2. **修改 get_user_info 工具**，读取 facts
3. **迁移 keyInfo 数据**到 facts
4. **废弃 keyInfo 字段**

**代码修改：**

```typescript
// tools/memory.ts - set_user_info
export const setUserInfoTool: Tool = {
  name: 'set_user_info',
  async execute(params) {
    const { key, value } = params;
    
    // 写入 facts，而非 keyInfo
    const fact = await memoryManager.addFact(
      `${key}: ${value}`,
      'context',
      0.9
    );
    
    return {
      success: true,
      content: `已记录: ${key} = ${value}`,
    };
  }
};

// tools/memory.ts - get_user_info
export const getUserInfoTool: Tool = {
  name: 'get_user_info',
  async execute(params) {
    const facts = memoryManager.getFacts({});
    // 从 facts 中筛选相关信息
    const relevant = facts.filter(f => f.content.includes(key));
    return { success: true, content: formatFacts(relevant) };
  }
};
```

**迁移脚本：**

```typescript
// scripts/migrate-keyinfo-to-facts.ts
async function migrate() {
  const profile = loadUserProfile();
  
  for (const [key, value] of Object.entries(profile.keyInfo)) {
    await memoryManager.addFact(
      `${key}: ${value}`,
      inferCategory(key),
      0.8
    );
  }
  
  // 清空 keyInfo
  profile.keyInfo = {};
  await saveUserProfile(profile);
}
```

### 方案 B: 保留两套，修复注入

**修改 loadUserProfile：**

```typescript
function loadUserProfile(memoryDir: string): string | null {
  // ...
  
  // 加载 keyInfo
  if (profile.keyInfo && Object.keys(profile.keyInfo).length > 0) {
    lines.push('\n### 用户信息');
    for (const [key, value] of Object.entries(profile.keyInfo)) {
      lines.push(`- ${key}: ${value}`);
    }
  }
  
  // 加载 facts
  if (profile.facts?.length) {
    lines.push('\n### 已知事实');
    // ...
  }
}
```

**缺点：** 两套格式并存，仍然混乱

---

## 五、最终建议

### 短期（立即）

1. **修复 loadUserProfile**，注入 keyInfo 到对话（方案 B）
2. **添加注释**，说明 keyInfo 是旧格式

### 中期

1. **实现迁移脚本**，将 keyInfo 迁移到 facts
2. **修改 set_user_info**，写入 facts

### 长期

1. **废弃 keyInfo 字段**
2. **统一使用 facts 格式**

---

## 六、代码位置总结

| 功能 | 文件 | 行号 |
|------|------|------|
| 记忆加载入口 | `src/core/session.ts` | 565 |
| loadMemoryContext | `src/core/session.ts` | 127 |
| loadUserProfile | `src/core/session.ts` | 17 |
| loadAgentProfile | `src/core/session.ts` | 62 |
| loadRecentDailyNotes | `src/core/session.ts` | 76 |
| facts 注入 | `src/core/session.ts` | 40-48 |
| keyInfo 定义 | `src/core/memory.ts` | 138 |
| facts 定义 | `src/core/memory.ts` | 145 |
| rememberKeyInfo | `src/core/memory.ts` | 917 |
| addFact | `src/core/memory.ts` | 1106 |
| set_user_info 工具 | `src/tools/memory.ts` | 418 |
| get_user_info 工具 | `src/tools/memory.ts` | 480 |
| /fact 命令 | `src/cli/commands/fact.ts` | 全文件 |