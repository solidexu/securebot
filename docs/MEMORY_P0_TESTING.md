# 记忆系统 P0 优化测试说明

## 概述

本次 P0 优化包含三个核心功能：

1. **精确 Token 计数** - 使用 `gpt-tokenizer` 实现精确的 token 计数
2. **事实置信度系统** - 结构化事实存储，支持置信度评分
3. **事实去重机制** - 基于内容规范化的自动去重

---

## 测试环境准备

```bash
# 确保已安装依赖
npm install

# 构建项目
npm run build

# 全局链接（可选，用于CLI测试）
npm link
```

---

## 测试用例

### 1. Token 计数测试

#### 测试目标
验证 `countTokens` 函数能准确计算文本的 token 数量。

#### 测试代码
```typescript
import { countTokens } from './src/core/memory.js';

// 测试用例
console.log(countTokens('Hello World')); // 预期: ~2 tokens
console.log(countTokens('你好世界')); // 预期: ~4 tokens
console.log(countTokens('')); // 预期: 0
console.log(countTokens('这是一个较长的句子，用于测试 token 计数的准确性。')); // 预期: ~20 tokens
```

#### 验证要点
- [ ] 空字符串返回 0
- [ ] 英文文本正确计数
- [ ] 中文文本正确计数
- [ ] 混合文本正确计数

---

### 2. 事实置信度系统测试

#### 测试目标
验证事实添加、获取、删除功能，以及置信度验证。

#### 测试步骤

**Step 1: 启动 securebot**
```bash
securebot chat
```

**Step 2: 使用 `add_fact` 工具添加事实**
```
添加一条显式陈述的事实：
> 请记住：我是一名Python开发者，置信度0.9

添加一条推断性事实：
> 我注意到用户喜欢使用 TypeScript，置信度0.7

测试低置信度过滤（应该失败）：
> 添加一个置信度0.3的事实（低于默认阈值0.7）
```

**Step 3: 使用 `get_facts` 获取事实列表**
```
> 显示所有事实
> 只显示preference类型的事实
```

**Step 4: 使用 `memory_stats` 查看统计**
```
> 查看记忆系统状态
```

#### 验证要点
- [ ] 高置信度事实成功添加
- [ ] 低置信度事实被拒绝
- [ ] 事实按置信度排序
- [ ] 分类过滤正确工作

---

### 3. 事实去重测试

#### 测试目标
验证相同内容的事实不会重复添加。

#### 测试步骤

**Step 1: 添加第一条事实**
```
> 添加事实：用户喜欢使用 Python 编程
```

**Step 2: 尝试添加相同内容**
```
> 再次添加：用户喜欢使用 Python 编程
```

**Step 3: 检查事实列表**
```
> 显示所有事实
```

**Step 4: 验证结果**
- 应该只有一条事实记录
- 如果第二次置信度更高，应该更新置信度

#### 验证要点
- [ ] 相同内容不重复添加
- [ ] 相同内容不同大小写视为重复
- [ ] 更高置信度会更新现有记录

---

### 4. 上下文注入测试

#### 测试目标
验证上下文注入使用精确 token 预算控制。

#### 测试步骤

**Step 1: 准备测试数据**
```
添加多个事实：
1. 用户是后端开发者 (0.9)
2. 用户熟悉 Python 和 TypeScript (0.85)
3. 用户偏好使用 Linux 系统 (0.8)
4. 用户正在学习 Rust 语言 (0.75)
```

**Step 2: 获取上下文摘要**
```typescript
import { getMemoryManager } from './src/core/memory.js';

const mm = getMemoryManager();
await mm.initialize();

// 测试不同 token 预算
const context500 = await mm.getContextSummary('test-agent', 500);
const context1000 = await mm.getContextSummary('test-agent', 1000);
const context2000 = await mm.getCompressedContext('test-agent', 2000);

console.log('500 tokens:', context500.length, 'chars');
console.log('1000 tokens:', context1000.length, 'chars');
console.log('2000 tokens:', context2000.length, 'chars');
```

#### 验证要点
- [ ] 较小 token 预算返回较少内容
- [ ] 高置信度事实优先出现
- [ ] 不超过指定的 token 限制

---

### 5. 集成测试

#### 测试场景：完整工作流

```bash
# 1. 启动 securebot
securebot chat

# 2. 添加多条事实
> 记住我是全栈开发者，熟悉 React 和 Node.js
> 我喜欢使用 VS Code 编辑器
> 我正在开发一个 AI 项目

# 3. 查看事实列表
> 显示我的所有事实

# 4. 开始对话（验证上下文注入）
> 根据我的背景，推荐一些学习资源

# 5. 检查统计
> 查看记忆系统状态
```

---

## 自动化测试

运行现有的单元测试：
```bash
npm test
```

---

## 配置验证

检查默认配置是否正确应用：

```typescript
import { getMemoryManager } from './src/core/memory.js';

const mm = getMemoryManager();
const config = mm.getConfig?.(); // 如果有暴露配置的方法

// 验证默认值
console.log('maxFacts:', config?.maxFacts); // 预期: 100
console.log('factConfidenceThreshold:', config?.factConfidenceThreshold); // 预期: 0.7
console.log('maxInjectionTokens:', config?.maxInjectionTokens); // 预期: 2000
```

---

## 常见问题排查

### Q1: Token 计数不准确
- 检查是否正确安装了 `gpt-tokenizer`
- 运行 `npm install` 重新安装依赖

### Q2: 事实无法添加
- 检查置信度是否 >= 0.7（默认阈值）
- 查看控制台错误信息

### Q3: 去重不生效
- 确保内容完全一致（包括空格）
- 检查 `normalizeFactContent` 函数的实现

---

## 测试检查清单

- [ ] Token 计数功能正常
- [ ] 事实添加成功（高置信度）
- [ ] 事实添加失败（低置信度）
- [ ] 事实去重正常工作
- [ ] 事实列表按置信度排序
- [ ] 事实删除功能正常
- [ ] 上下文注入使用 token 预算
- [ ] 不同 token 预算产生不同长度的上下文
- [ ] 集成测试流程完整

---

## 变更摘要

### 新增接口

```typescript
interface MemoryFact {
  id: string;
  content: string;
  category: 'preference' | 'knowledge' | 'context' | 'behavior' | 'goal';
  confidence: number; // 0-1
  createdAt: string;
  source: string;
  tags?: string[];
}
```

### 新增配置项

```typescript
interface MemoryConfig {
  // ...existing
  maxFacts: number; // 默认: 100
  factConfidenceThreshold: number; // 默认: 0.7
  maxInjectionTokens: number; // 默认: 2000
  injectionEnabled: boolean; // 默认: true
}
```

### 新增工具

- `add_fact` - 添加结构化事实
- `get_facts` - 获取事实列表
- `delete_fact` - 删除事实

### 新增函数

- `countTokens(text: string): number` - 精确计算 token 数量
- `truncateToTokens(text: string, maxTokens: number): string` - 截断文本到指定 token 数