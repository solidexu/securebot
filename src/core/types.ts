/**
 * SecureBot Core Types
 * 
 * 核心类型定义，参考 OpenClaw 架构设计
 */

// ============ Tool Types ============

/**
 * 工具参数 Schema (JSON Schema 子集)
 */
export interface ToolParameterSchema {
  type: string;
  properties?: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
  }>;
  required?: string[];
  description?: string;
}

/**
 * 工具定义
 */
export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  execute: (params: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

/**
 * 工具执行上下文
 */
export interface ToolContext {
  agent: Agent;
  session: Session;
  workspace: string;
  logger: Logger;
  /** 额外允许访问的路径列表 */
  allowedPaths?: string[];
}

/**
 * 工具执行结果
 */
export interface ToolResult {
  success: boolean;
  content?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 工具调用
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// ============ Tool Policy Types ============

/**
 * 工具权限策略
 */
export interface ToolPolicy {
  /** 工具预设 */
  profile?: 'minimal' | 'coding' | 'messaging' | 'full';
  /** 允许的工具列表 */
  allow?: string[];
  /** 禁止的工具列表 (优先级最高) */
  deny?: string[];
  /** 命令执行策略 */
  exec?: ExecPolicy;
}

/**
 * 命令执行策略
 */
export interface ExecPolicy {
  /** 安全模式: deny=全部禁止, allowlist=仅白名单, full=全部允许 */
  security: 'deny' | 'allowlist' | 'full';
  /** 确认模式: off=不确认, on-miss=白名单外确认, always=总是确认 */
  ask: 'off' | 'on-miss' | 'always';
  /** 命令白名单 */
  allowlist?: string[];
}

// ============ RAG Types ============

/**
 * RAG 配置
 */
export interface RAGConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 知识库目录 */
  knowledgeDirs: string[];
  /** 嵌入模型 (用于向量嵌入) */
  embeddingModel?: string;
  /** 重排序模型 (可选，用于提高检索精度) */
  rerankModel?: string;
  /** 查询扩展模型 (可选，用于改写查询) */
  queryExpansionModel?: string;
  /** 块大小 */
  chunkSize?: number;
  /** 块重叠 */
  chunkOverlap?: number;
  /** 检索数量 */
  topK?: number;
  /** 最小相似度 */
  minScore?: number;
  /** 是否启用重排序 */
  enableRerank?: boolean;
  /** 是否启用查询扩展 */
  enableQueryExpansion?: boolean;
}

// ============ Agent Types ============

/**
 * Agent 配置
 */
export interface AgentConfig {
  /** Agent ID */
  id: string;
  /** Agent 名称 */
  name: string;
  /** 是否为默认 Agent */
  default?: boolean;
  /** 工作空间路径 */
  workspace: string;
  /** 工具权限策略 */
  tools?: ToolPolicy;
  /** 模型配置 */
  model?: ModelConfig;
  /** RAG 配置 */
  rag?: RAGConfig;
  /** 技能列表（技能 ID） */
  skills?: string[];
}

/**
 * Agent 实例
 */
export interface Agent extends AgentConfig {
  /** 会话列表 */
  sessions: Map<string, Session>;
}

// ============ Session Types ============

/**
 * 会话
 */
export interface Session {
  /** 会话 Key: agent:<agentId>:main */
  sessionKey: string;
  /** Agent ID */
  agentId: string;
  /** 对话历史 */
  history: Message[];
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
}

/**
 * 消息
 */
export interface Message {
  /** 角色 */
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** 内容 */
  content: string;
  /** 工具名称 (role=tool 时) */
  name?: string;
  /** 工具调用 */
  toolCalls?: ToolCall[];
  /** 工具调用 ID (role=tool 时) */
  toolCallId?: string;
}

// ============ Model Types ============

/**
 * 模型配置
 */
export interface ModelConfig {
  /** 模型名称 */
  model: string;
  /** 基础 URL (Ollama API) */
  baseUrl?: string;
  /** 温度 */
  temperature?: number;
  /** 最大 Token */
  maxTokens?: number;
}

/**
 * 聊天参数
 */
export interface ChatParams {
  /** 模型 */
  model: string;
  /** 消息列表 */
  messages: Message[];
  /** 可用工具 */
  tools?: Tool[];
  /** 温度 */
  temperature?: number;
  /** 最大 Token */
  maxTokens?: number;
}

/**
 * 聊天结果
 */
export interface ChatResult {
  /** 回复内容 */
  content: string;
  /** 工具调用 */
  toolCalls?: ToolCall[];
  /** 使用统计 */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * 模型适配器接口
 */
export interface ModelAdapter {
  /** 聊天（非流式） */
  chat(params: ChatParams): Promise<ChatResult>;
  /** 聊天（支持流式） */
  chatWithStream?(params: ChatParams & { onStream: (chunk: { content: string; done: boolean }) => void }): Promise<ChatResult>;
  /** 列出可用模型 */
  listModels(): Promise<string[]>;
  /** 健康检查 */
  healthCheck(): Promise<{ ok: boolean; error?: string }>;
}

// ============ Config Types ============

/**
 * 全局配置
 */
export interface Config {
  /** 模型配置 */
  model: ModelConfig;
  /** 默认 Agent */
  defaultAgent: string;
  /** 全局工具策略 */
  tools: ToolPolicy;
  /** Agent 列表 */
  agents: AgentConfig[];
  /** 全局 RAG 配置 */
  rag?: RAGConfig;
  /** 
   * SecureBot 根目录（统一管理所有数据）
   * 默认: ~/.securebot
   * 设置后，所有子目录（agents/memory/skills/sessions/audit）都在此目录下
   */
  rootDir?: string;
  /** @deprecated 使用 rootDir 代替 */
  dataDir?: string;
  /** @deprecated 使用 rootDir 代替，agents 目录在 <rootDir>/agents */
  workspaceBaseDir?: string;
}

// ============ Logger Types ============

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 日志记录器
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

// ============ CLI Types ============

/**
 * REPL 状态
 */
export interface ReplState {
  /** 当前 Agent ID */
  currentAgentId: string;
  /** 配置 */
  config: Config;
  /** Agent 映射 */
  agents: Map<string, Agent>;
  /** 模型适配器 */
  modelAdapter: ModelAdapter;
  /** 注册的工具 */
  tools: Map<string, Tool>;
  /** 是否运行中 */
  running: boolean;
  /** 是否正在执行任务 */
  executing?: boolean;
  /** 是否被打断 */
  interrupted?: boolean;
  /** 用于取消 LLM 请求的 AbortController */
  abortController?: AbortController;
}