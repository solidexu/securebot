# CodeBuddy CLI 调研分析 - SecureBot 启发报告

> 重点调研 CodeBuddy Code CLI 版本
> 
> 对比分析 SecureBot CLI 的改进方向

---

## 📊 CodeBuddy CLI 产品概览

### 定位

**CodeBuddy Code (CLI)**：面向 DevOps/运维/SRE/资深开发者的 AI 命令行工具，支持 Shell/文件/网络操作，任务编排能力强。

### 核心特性

```
🚀 自然语言驱动全生命周期
   - 从代码编写、测试、调试到部署的全链路自动化
   - 对话式交互完成复杂任务

🔧 终端原生，无缝集成
   - 直接在熟悉的命令行环境中
   - 完美融入现有工作流
   - 零学习成本

⚡ 开箱即用的强大能力
   - 内置工具链：文件编辑、命令运行、Git、测试
   - 智能提交：自动生成提交信息
   - MCP 扩展：集成第三方工具

🛠️ Unix 哲学的 AI 集成
   - 管道友好：原生支持管道输入
   - 脚本集成：融入 shell 自动化
   - 标准输入输出：遵循 Unix 标准
```

---

## 🎯 CLI 核心功能

### 1. 使用模式

#### 交互式对话模式

```bash
# 启动交互模式
codebuddy

# 典型对话
> 帮我分析这个项目的结构
> 我想给这个 React 组件添加一个加载状态
> 这段代码有什么潜在的性能问题？
```

#### 单次命令模式

```bash
# 直接提问
codebuddy -p "优化这个 SQL 查询的性能"

# 管道输入（Unix 哲学）
cat error.log | codebuddy -p "分析这些错误日志"
git log --oneline | codebuddy "分析这些提交，找出可能的问题"

# 文件分析（需要授权）
codebuddy -p "审查 src/utils.js 的代码质量" -y
```

#### 项目级操作

```bash
# 项目重构
codebuddy -p "将所有组件从 class 组件迁移到函数组件" -y

# 代码规范
codebuddy -p "检查整个项目的 TypeScript 类型定义" -y

# 测试覆盖
codebuddy -p "为 services 目录下的所有文件添加单元测试" -y
```

---

### 2. 斜杠命令系统

**CodeBuddy CLI 内置丰富的斜杠命令**，这是核心亮点：

#### 内置命令列表

| 命令 | 功能 | SecureBot 对应 |
|------|------|---------------|
| `/init` | 初始化项目上下文 | ✅ 技能系统初始化 |
| `/clear` | 开启全新对话 | ✅ `/reset` |
| `/resume` | 恢复之前的会话 | ⚠️ 需要增强 |
| `/help` | 显示帮助 | ✅ `/help` |
| `/model` | 切换模型 | ✅ `/model` |
| `/config` | 查看修改配置 | ✅ `/config` |
| `/status` | 显示仓库状态 | ✅ `/status` |
| `/cost` | 显示成本和 Token | ✅ `/status` |
| `/context` | 计算 Token 分布 | ❌ 缺失 |
| `/doctor` | 检查环境状态 | ❌ 缺失 |
| `/permissions` | 管理工具权限 | ✅ 权限系统 |
| `/security-review` | 代码安全审查 | ⚠️ 需要增强 |
| `/rewind` | 回退对话 | ❌ 缺失（重要） |
| `/sandbox` | 管理 Bash 沙箱 | ✅ 工具确认 |
| `/mcp` | 管理 MCP 连接 | ❌ 缺失（重要） |
| `/skills` | 查看已加载 Skills | ✅ `/skills` |
| `/agents` | 管理 AI Agent | ✅ `/agents` |
| `/todos` | 显示待办事项 | ❌ 缺失 |
| `/export` | 导出对话 | ❌ 缺失 |
| `/theme` | 终端主题选择 | ✅ TUI 主题 |
| `/insights` | AI 使用洞察报告 | ❌ 缺失（重要） |

#### **关键启发**：`/init` 项目初始化

```bash
> /init
```

**为什么重要**：
- ✅ 理解更准确：预先构建项目知识图谱
- ✅ 响应更快速：避免重复扫描文件
- ✅ 建议更精准：基于全局视图
- ✅ Token 消耗更少：一次性建立上下文，减少 30-50%

**最佳实践**：
```bash
# 第一次使用项目时
> /init

# 项目结构重大变化时
> /clear
> /init  # 重新初始化
```

---

### 3. 自定义斜杠命令（Custom Slash Commands）

**这是 CodeBuddy CLI 最强大的功能之一**！

#### 创建方式

```bash
# 项目级命令
.project/.codebuddy/commands/

# 个人全局命令
~/.codebuddy/commands/

# 子目录命令（层级命名）
.codebuddy/commands/frontend/build.md → /frontend:build
.codebuddy/commands/backend/deploy/staging.md → /backend:deploy:staging
```

#### Frontmatter 元数据

```markdown
---
description: "为我的项目运行单元测试并报告结果"
argument-hint: "[test-file]"
allowed-tools: Bash(npm run:*)
model: gemini-3.1-pro
---

请为我运行 `npm run test -- $1` 命令...
```

**支持的元数据**：

| 字段 | 描述 | SecureBot 可借鉴 |
|------|------|-----------------|
| `description` | 命令描述 | ✅ 技能描述 |
| `argument-hint` | 参数提示 | ⚠️ 需要增强 |
| `model` | 指定模型 | ✅ 已支持 |
| `allowed-tools` | 工具权限 | ✅ 权限系统 |
| `disable-model-invocation` | 仅手动触发 | ❌ 缺失 |

#### 参数支持

```markdown
# 位置参数 $1, $2, $3
请审查 PR #$1，优先级为 $2...

# 捕获所有参数 $ARGUMENTS
请修复 issue #$ARGUMENTS...
```

#### Shell 命令集成

```markdown
---
description: "显示当前的 git 仓库状态并进行分析"
allowed-tools: Bash(git status:*), Bash(git diff:*)
---

当前 git 状态：
!`git status`

当前分支的变更：
!`git diff HEAD`

请基于上面的输出，总结当前分支的状况。
```

#### 文件引用

```markdown
---
description: "代码审查"
---

请审查以下文件：
@src/utils/helpers.js
@src/utils/validators.js

找出潜在的性能问题和代码风格问题。
```

---

### 4. MCP (Model Context Protocol) 集成

**这是 CodeBuddy CLI 的另一大亮点**：

#### MCP 核心概念

```
MCP 服务器 → 提供工具、资源、提示的独立进程
           ↓
CodeBuddy → 通过 STDIO/SSE/HTTP 通信
```

#### MCP Prompts 自动转换为斜杠命令

```bash
# MCP 服务器提供的 Prompts 自动注册为命令
/server-name:prompt-name

# 支持动态参数
# 通过交互式界面收集用户输入
```

#### 配置文件

```jsonc
{
  // MCP 服务器配置
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/workspace"
      ],
      "env": {
        "DEBUG": "true"
      }
    },
    
    // HTTP API 服务器
    "api-server": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-token"
      }
    }
  }
}
```

#### 环境变量扩展

```json
{
  "mcpServers": {
    "python-tools": {
      "type": "stdio",
      "command": "${PYTHON_PATH:-python}",
      "args": ["-m", "my_mcp_server"],
      "env": {
        "API_KEY": "${API_KEY}"
      }
    }
  }
}
```

#### 延迟加载（defer_loading）

```json
{
  "mcpServers": {
    "my-server": {
      "type": "stdio",
      "command": "my-mcp-server",
      "defer_loading": true,  // 延迟加载工具
      "tools": {
        "frequently_used_tool": {
          "defer_loading": false  // 常用工具不延迟
        }
      }
    }
  }
}
```

**工作原理**：
- 设置 `defer_loading: true` 的工具不立即加载
- 模型通过 ToolSearch 工具搜索延迟加载的工具
- 搜索到的工具被激活，后续可用

---

### 5. 快捷键系统

#### 基础导航

| 快捷键 | 功能 |
|--------|------|
| ↑/↓ | 浏览命令历史 |
| ↓ | 查看后台任务 |
| Tab | 命令自动补全 |
| Esc | 清空输入 |
| Ctrl+C/D | 退出程序 |

#### 权限和模式

| 快捷键 | 功能 | SecureBot 可借鉴 |
|--------|------|-----------------|
| Shift+Tab / Alt+M | 切换权限模式 | ⚠️ 需要增强 |

**权限模式**：default → bypass → accept → plan

#### 编辑功能

| 快捷键 | 功能 |
|--------|------|
| Ctrl+R | 展开/收起详细输出 |
| Ctrl+G | 外部编辑器编辑提示词 |
| Shift+Enter | 多行输入 |

#### 专用功能

| 快捷键 | 功能 |
|--------|------|
| Ctrl+O | 查看思考详情面板 |

---

## 💡 SecureBot 对比分析

### CLI 功能对比

| 特性 | CodeBuddy CLI | SecureBot CLI | 差距 |
|------|---------------|---------------|------|
| **交互模式** | ✅ REPL + TUI | ✅ TUI | 🟢 相当 |
| **单次命令** | ✅ -p 模式 | ⚠️ 基础支持 | 🟡 需增强 |
| **管道集成** | ✅ Unix 管道 | ❌ 不支持 | 🔴 **高优先级** |
| **/init 初始化** | ✅ 项目知识图谱 | ⚠️ 技能初始化 | 🟡 需增强 |
| **/rewind 回退** | ✅ 对话回退 | ❌ 不支持 | 🔴 **高优先级** |
| **自定义斜杠命令** | ✅ Markdown 定义 | ✅ Skills | 🟢 相当 |
| **MCP 集成** | ✅ 完整支持 | ❌ 不支持 | 🔴 **高优先级** |
| **权限模式切换** | ✅ 快捷键切换 | ⚠️ 配置切换 | 🟡 需增强 |
| **环境变量扩展** | ✅ ${VAR:-default} | ❌ 不支持 | 🟡 需增强 |
| **Shell 命令集成** | ✅ !`command` | ❌ 不支持 | 🔴 **高优先级** |
| **文件引用** | ✅ @file | ⚠️ #Codebase | 🟡 需增强 |
| **/insights 洞察** | ✅ AI 使用报告 | ❌ 不支持 | 🟡 需增强 |
| **/doctor 检查** | ✅ 环境诊断 | ❌ 不支持 | 🟡 需增强 |
| **/export 导出** | ✅ 导出对话 | ❌ 不支持 | 🟡 需增强 |

### SecureBot 的独特优势

```
SecureBot CLI 应保持的优势：

✅ 多 Agent 协作（CodeBuddy 单一 Agent）
   - Agent 间任务委派
   - 协作管理器
   - 工作流编排

✅ 技能系统（CodeBuddy Custom Commands 更简单）
   - Markdown Skills
   - 技能匹配器
   - 技能生成器

✅ RAG 知识库（CodeBuddy 无内置）
   - 向量存储
   - 智能检索
   - HyDE/Multi-Query

✅ 本地优先（CodeBuddy 需登录）
   - 本地模型
   - 无云端依赖
   - 数据隐私

✅ 工作流引擎（CodeBuddy 无内置）
   - LangGraph 风格
   - 状态管理
   - 并行执行
```

---

## 🚀 高优先级改进方案

### Priority 1：管道集成（Unix 哲学）

**启发**：CodeBuddy 原生支持管道输入

```bash
# CodeBuddy 示例
cat error.log | codebuddy -p "分析这些错误日志"
git log --oneline | codebuddy "分析这些提交"
```

**改进方案**：

```typescript
// src/cli/commands/piped.ts - 管道模式支持
export class PipedInputHandler {
  /**
   * 检测是否有管道输入
   */
  hasPipedInput(): boolean {
    // 检查 stdin 是否有数据
    return !process.stdin.isTTY;
  }
  
  /**
   * 读取管道输入
   */
  async readPipedInput(): Promise<string> {
    return new Promise((resolve) => {
      let data = '';
      process.stdin.on('data', chunk => data += chunk);
      process.stdin.on('end', () => resolve(data));
    });
  }
  
  /**
   * 处理管道输入 + 用户查询
   */
  async handlePipedQuery(query: string): Promise<void> {
    const pipedData = await this.readPipedInput();
    
    // 构建增强的查询
    const enhancedQuery = `
管道输入数据：
---
${pipedData}
---

用户问题：${query}

请基于管道输入数据回答问题。
`;
    
    await this.session.sendMessage(enhancedQuery);
  }
}

// CLI 入口处理
const pipedHandler = new PipedInputHandler();

if (pipedHandler.hasPipedInput()) {
  // 管道模式
  const query = process.argv.slice(2).join(' ');
  await pipedHandler.handlePipedQuery(query);
} else {
  // 正常交互模式
  await startInteractiveMode();
}
```

**使用示例**：

```bash
# SecureBot 管道模式（改进后）
cat error.log | securebot "分析这些错误"
git diff | securebot "解释这些变更"
npm test | securebot "总结测试结果"
```

---

### Priority 2：/rewind 对话回退

**启发**：CodeBuddy 支持 `/rewind` 回退对话到之前的某个消息点

```bash
> /rewind
# 可选择：
# - 仅回退对话
# - 仅回退代码
# - 同时回退两者
```

**改进方案**：

```typescript
// src/cli/commands/rewind.ts - 对话回退命令
export interface Checkpoint {
  id: string;
  timestamp: number;
  messageIndex: number;
  codeChanges?: CodeChange[];
}

export class RewindCommand {
  private checkpoints: Checkpoint[] = [];
  
  /**
   * 创建检查点
   */
  createCheckpoint(messageIndex: number): Checkpoint {
    const checkpoint = {
      id: uuidv4(),
      timestamp: Date.now(),
      messageIndex,
      codeChanges: this.captureCodeChanges()
    };
    
    this.checkpoints.push(checkpoint);
    return checkpoint;
  }
  
  /**
   * 回退到检查点
   */
  async rewind(checkpointId: string, options: RewindOptions): Promise<void> {
    const checkpoint = this.checkpoints.find(c => c.id === checkpointId);
    
    if (!checkpoint) {
      throw new Error('Checkpoint not found');
    }
    
    // 回退对话
    if (options.rewindConversation) {
      this.session.messages = this.session.messages.slice(0, checkpoint.messageIndex);
    }
    
    // 回退代码
    if (options.rewindCode && checkpoint.codeChanges) {
      await this.revertCodeChanges(checkpoint.codeChanges);
    }
  }
  
  /**
   * 显示检查点列表
   */
  listCheckpoints(): void {
    console.log('可用检查点：');
    this.checkpoints.forEach((c, i) => {
      console.log(`${i + 1}. ${c.timestamp} - 消息 ${c.messageIndex}`);
    });
  }
}

// CLI 命令
export const rewindCommand = {
  name: '/rewind',
  description: '回退对话到之前的某个消息点',
  execute: async (args: string[]) => {
    const rewind = new RewindCommand();
    
    if (args.length === 0) {
      // 交互式选择
      rewind.listCheckpoints();
      const choice = await prompt('选择检查点 (1-n): ');
      await rewind.rewind(choice, { rewindConversation: true });
    } else {
      // 直接回退
      await rewind.rewind(args[0], { rewindConversation: true });
    }
  }
};
```

---

### Priority 3：MCP 集成

**启发**：CodeBuddy 通过 MCP 扩展第三方工具

**改进方案**：

```typescript
// src/mcp/mcp-manager.ts - MCP 管理器
export interface MCPServerConfig {
  type: 'stdio' | 'sse' | 'http';
  command?: string;       // STDIO 类型
  args?: string[];
  url?: string;           // SSE/HTTP 类型
  headers?: Record<string, string>;
  env?: Record<string, string>;
  deferLoading?: boolean;
}

export class MCPManager {
  private servers: Map<string, MCPServer> = new Map();
  
  /**
   * 加载 MCP 服务器
   */
  async loadServer(name: string, config: MCPServerConfig): Promise<void> {
    const server = await this.createServer(config);
    this.servers.set(name, server);
    
    // 注册工具到 SecureBot
    const tools = await server.listTools();
    for (const tool of tools) {
      this.registerMCPTool(name, tool);
    }
    
    // 注册 Prompts 为斜杠命令
    const prompts = await server.listPrompts();
    for (const prompt of prompts) {
      this.registerMCPPrompt(name, prompt);
    }
  }
  
  /**
   * 注册 MCP 工具
   */
  private registerMCPTool(serverName: string, tool: MCPTool): void {
    const secureBotTool = {
      name: `mcp__${serverName}__${tool.name}`,
      description: tool.description,
      parameters: tool.parameters,
      execute: async (params: unknown) => {
        const server = this.servers.get(serverName);
        return await server.callTool(tool.name, params);
      }
    };
    
    this.toolRegistry.register(secureBotTool);
  }
  
  /**
   * 注册 MCP Prompt 为斜杠命令
   */
  private registerMCPPrompt(serverName: string, prompt: MCPPrompt): void {
    const commandName = `/${serverName}:${prompt.name}`;
    
    this.commandRegistry.register({
      name: commandName,
      description: prompt.description,
      execute: async (args: string[]) => {
        const server = this.servers.get(serverName);
        const content = await server.getPrompt(prompt.name, args);
        
        // 执行 Prompt 内容
        await this.session.sendMessage(content);
      }
    });
  }
}

// MCP 配置文件
// ~/.securebot/.mcp.json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      "deferLoading": true
    },
    "github": {
      "type": "http",
      "url": "https://mcp.github.com/api",
      "headers": {
        "Authorization": "Bearer ${GITHUB_TOKEN}"
      }
    }
  }
}
```

---

### Priority 4：Shell 命令集成

**启发**：CodeBuddy 在自定义命令中执行 Shell 命令

```markdown
当前 git 状态：
!`git status`

请基于上面的输出，总结当前分支的状况。
```

**改进方案**：

```typescript
// src/cli/shell-integration.ts - Shell 命令集成
export class ShellCommandIntegration {
  /**
   * 解析并执行 Shell 命令
   */
  async parseAndExecute(content: string): Promise<string> {
    // 查找 !`command` 格式
    const shellPattern = /!\`([^`]+)\`/g;
    let result = content;
    
    let match;
    while ((match = shellPattern.exec(content)) !== null) {
      const command = match[1];
      const output = await this.executeShell(command);
      
      // 替换命令为输出
      result = result.replace(match[0], output);
    }
    
    return result;
  }
  
  /**
   * 执行 Shell 命令
   */
  private async executeShell(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
  }
}

// 技能 Markdown 解析器增强
export class SkillMarkdownParser {
  /**
   * 解析技能内容
   */
  async parse(content: string): Promise<string> {
    const shellIntegration = new ShellCommandIntegration();
    
    // 执行 Shell 命令
    return await shellIntegration.parseAndExecute(content);
  }
}
```

**技能示例**：

```markdown
---
description: "显示项目状态"
allowed-tools: Bash(git:*), Bash(npm:*)
---

## 项目状态

- Git 状态： !`git status --short`
- 分支信息： !`git branch --show-current`
- 最近提交： !`git log --oneline -5`
- 依赖状态： !`npm list --depth=0`

请基于上述信息，总结项目当前状态。
```

---

### Priority 5：/init 项目初始化增强

**启发**：CodeBuddy 的 `/init` 创建项目知识图谱

**改进方案**：

```typescript
// src/cli/commands/init.ts - 项目初始化增强
export interface ProjectKnowledgeGraph {
  structure: ProjectStructure;
  dependencies: DependencyGraph;
  techStack: TechStackInfo;
  codeStats: CodeStatistics;
  patterns: ArchitecturePatterns;
}

export class InitCommand {
  /**
   * 初始化项目知识图谱
   */
  async initialize(rootPath: string): Promise<ProjectKnowledgeGraph> {
    console.log('正在初始化项目知识图谱...');
    
    // 1. 项目结构分析
    const structure = await this.analyzeStructure(rootPath);
    
    // 2. 依赖关系分析
    const dependencies = await this.analyzeDependencies(rootPath);
    
    // 3. 技术栈识别
    const techStack = await this.identifyTechStack(rootPath);
    
    // 4. 代码统计
    const codeStats = await this.analyzeCodeStats(rootPath);
    
    // 5. 架构模式识别
    const patterns = await this.identifyPatterns(rootPath);
    
    // 6. 存储到知识库
    await this.storeToKnowledgeBase({
      structure,
      dependencies,
      techStack,
      codeStats,
      patterns
    });
    
    console.log('✅ 项目知识图谱已初始化');
    
    return { structure, dependencies, techStack, codeStats, patterns };
  }
  
  /**
   * 分析项目结构
   */
  private async analyzeStructure(rootPath: string): Promise<ProjectStructure> {
    // 扫描目录树
    const tree = await this.scanDirectoryTree(rootPath);
    
    // 识别关键文件
    const keyFiles = this.identifyKeyFiles(tree);
    
    // 构建结构图
    return {
      tree,
      keyFiles,
      modules: this.groupByModule(tree)
    };
  }
  
  /**
   * 存储到 RAG 知识库
   */
  private async storeToKnowledgeBase(graph: ProjectKnowledgeGraph): Promise<void> {
    const { ragManager } = await import('../../rag/tools.js');
    
    // 生成知识文档
    const knowledgeDoc = this.generateKnowledgeDoc(graph);
    
    // 存储到 RAG
    await ragManager.addDocument(knowledgeDoc, {
      type: 'project-knowledge',
      tags: ['init', 'project', 'knowledge-graph']
    });
  }
}

// CLI 命令
export const initCommand = {
  name: '/init',
  description: '初始化项目知识图谱',
  execute: async () => {
    const init = new InitCommand();
    const rootPath = process.cwd();
    await init.initialize(rootPath);
  }
};
```

---

## 📋 实施路线图

### Phase 1：核心增强（2-3 周）

| 任务 | 优先级 | 工作量 | 启发来源 |
|------|--------|--------|---------|
| **管道集成** | 🔴 最高 | 2 人日 | Unix 管道 |
| **Shell 命令集成** | 🔴 最高 | 2 人日 | !`command` |
| **/rewind 回退** | 🔴 高 | 3 人日 | Checkpointing |
| **/init 增强** | 🔴 高 | 3 人日 | 项目知识图谱 |

### Phase 2：扩展集成（3-4 周）

| 任务 | 优先级 | 工作量 | 启发来源 |
|------|--------|--------|---------|
| **MCP 集成** | 🔴 高 | 5 人日 | MCP 协议 |
| **环境变量扩展** | 🟡 中 | 2 人日 | ${VAR:-default} |
| **/insights 洞察** | 🟡 中 | 3 人日 | AI 使用报告 |
| **/doctor 检查** | 🟡 中 | 1 人日 | 环境诊断 |

### Phase 3：优化完善（1-2 周）

| 任务 | 优先级 | 工作量 | 启发来源 |
|------|--------|--------|---------|
| **快捷键增强** | 🟡 中 | 2 人日 | 权限模式切换 |
| **/export 导出** | 🟢 低 | 1 人日 | 导出对话 |
| **参数提示** | 🟢 低 | 1 人日 | argument-hint |

---

## 🎯 SecureBot CLI 差异化定位

### 保持优势

```
SecureBot CLI 独特优势：

1. 🏆 多 Agent 协作
   - CodeBuddy 是单一 Agent
   - SecureBot 有完整的多 Agent 架构
   - 应继续深化协作能力

2. 🏆 RAG 知识库
   - CodeBuddy 无内置知识库
   - SecureBot 有完整 RAG
   - 应继续优化召回率（见 rag-optimization-guide.md）

3. 🏆 本地优先
   - CodeBuddy 需登录认证
   - SecureBot 本地优先
   - 应继续加强本地模型支持

4. 🏆 工作流引擎
   - CodeBuddy 无内置工作流
   - SecureBot 有 LangGraph 风格工作流
   - 应继续深化工作流能力

5. 🏆 技能系统
   - CodeBuddy Custom Commands 简单
   - SecureBot Skills 更强大
   - 应继续增强 Shell 命令集成
```

### 补齐短板

```
需要从 CodeBuddy 学习的能力：

1. 🔴 管道集成（Unix 哲学）
   - 支持 stdin 管道输入
   - 与现有 Unix 工具无缝组合

2. 🔴 MCP 协议集成
   - 扩展第三方工具
   - 连接外部数据源

3. 🔴 对话回退（/rewind）
   - 检查点机制
   - 回退对话和代码

4. 🔴 Shell 命令集成
   - 在技能中执行 Shell
   - 捕获输出注入上下文

5. 🔴 项目初始化增强
   - 创建知识图谱
   - 减少 Token 消耗
```

---

## 📊 总结

### CodeBuddy CLI 的亮点

| 特性 | 值得借鉴 | 优先级 |
|------|---------|--------|
| Unix 管道集成 | ✅ | 🔴 最高 |
| Shell 命令集成 | ✅ | 🔴 最高 |
| MCP 协议 | ✅ | 🔴 高 |
| /rewind 回退 | ✅ | 🔴 高 |
| /init 知识图谱 | ✅ | 🔴 高 |
| 自定义斜杠命令 | ✅ | 🟢 相当 |
| 快捷键系统 | ✅ | 🟡 中 |

### SecureBot CLI 的优势

| 特性 | 应保持领先 |
|------|-----------|
| 多 Agent 协作 | ✅ 核心 |
| RAG 知识库 | ✅ 核心 |
| 本地优先 | ✅ 核心 |
| 工作流引擎 | ✅ 核心 |
| 技能系统 | ✅ 核心 |

---

**文档版本**：v1.0  
**调研日期**：2026-04-11  
**重点**：CLI 版本深度分析  
**适用项目**：SecureBot CLI 改进规划