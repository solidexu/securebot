/**
 * 上下文管理器
 * 
 * 管理 LLM 上下文长度，支持：
 * - Token 计数（考虑系统提示、工具定义、消息历史）
 * - 自动截断
 * - 智能摘要
 */

import type { Message, Tool } from './types.js';

// ============ 配置 ============

export interface ContextManagerConfig {
  /** 最大 token 数（模型上下文窗口） */
  maxTokens: number;
  /** 保留用于输出的 token 数 */
  reservedOutputTokens: number;
  /** 是否启用自动摘要 */
  enableSummarization: boolean;
  /** 触发摘要的阈值（使用率 0-1） */
  summarizationThreshold: number;
  /** 模型名称（用于获取实际上下文窗口） */
  model?: string;
}

const DEFAULT_CONFIG: ContextManagerConfig = {
  maxTokens: 32768,  // 默认 32K
  reservedOutputTokens: 4096,  // 预留 4K 用于输出
  enableSummarization: true,
  summarizationThreshold: 0.75,  // 使用率超过 75% 触发摘要
};

// ============ 模型上下文窗口映射 ============

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // OpenAI
  'gpt-4': 8192,
  'gpt-4-32k': 32768,
  'gpt-4-turbo': 128000,
  'gpt-4o': 128000,
  'gpt-3.5-turbo': 16385,
  
  // Anthropic
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  
  // 智谱
  'glm-4': 128000,
  'glm-5': 128000,
  
  // Ollama (默认值)
  'llama3': 8192,
  'qwen': 32768,
  'qwen2': 32768,
};

/**
 * 获取模型的上下文窗口大小
 */
function getModelContextWindow(model: string | undefined): number {
  if (!model) return DEFAULT_CONFIG.maxTokens;
  
  const modelName = model.toLowerCase();
  
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (modelName.includes(key.toLowerCase())) {
      return value;
    }
  }
  
  return DEFAULT_CONFIG.maxTokens;
}

// ============ Token 估算 ============

/**
 * 估算文本的 token 数
 * 
 * 使用更准确的估算方法：
 * - 中文：约 1-2 字/token（取 1.5 作为平均值）
 * - 英文：约 4 字/token
 * - 代码：约 3 字/token（代码通常占用更多 token）
 * - 特殊字符：额外计算
 */
function estimateTokens(text: string, isCode: boolean = false): number {
  if (!text) return 0;
  
  // 计算各种字符类型
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const codeChars = isCode ? text.length * 0.3 : 0;  // 代码额外 30%
  const whitespace = (text.match(/\s+/g) || []).length * 0.5;  // 空格
  const specialChars = (text.match(/[^\w\s\u4e00-\u9fa5]/g) || []).length * 0.5;  // 特殊字符
  const normalChars = text.length - chineseChars - whitespace;
  
  // 中文：1.5 字/token
  // 英文：4 字/token
  // 代码额外：3 字/token
  const baseTokens = Math.ceil(
    chineseChars / 1.5 + 
    normalChars / 4 + 
    codeChars / 3 +
    whitespace +
    specialChars
  );
  
  return Math.max(1, baseTokens);
}

/**
 * 估算消息的 token 数
 */
function estimateMessageTokens(message: Message): number {
  // 消息格式开销（role、结构等）
  let tokens = 4;
  
  // 名称
  if (message.name) {
    tokens += estimateTokens(message.name) + 2;
  }
  
  // 内容
  if (message.content) {
    // 检测是否包含代码
    const isCode = message.content.includes('```') || 
                   message.content.includes('function') ||
                   message.content.includes('const ') ||
                   message.content.includes('import ');
    tokens += estimateTokens(message.content, isCode);
  }
  
  // 工具调用
  if (message.toolCalls) {
    for (const tc of message.toolCalls) {
      tokens += estimateTokens(tc.name || '') + 4;
      tokens += estimateTokens(JSON.stringify(tc.arguments || {}));
    }
  }
  
  return tokens;
}

/**
 * 估算工具定义的 token 数
 */
export function estimateToolTokens(tools: Tool[]): number {
  if (!tools || tools.length === 0) return 0;
  
  let tokens = 10;  // 工具列表格式开销
  
  for (const tool of tools) {
    tokens += estimateTokens(tool.name) + 4;
    tokens += estimateTokens(tool.description || '');
    
    if (tool.parameters) {
      tokens += estimateTokens(JSON.stringify(tool.parameters));
    }
  }
  
  return tokens;
}

/**
 * 估算消息列表的 token 数
 */
export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

// ============ 上下文管理器 ============

export class ContextManager {
  private config: ContextManagerConfig;
  private actualMaxTokens: number;
  private tokenCache: Map<string, number> = new Map();
  
  constructor(config: Partial<ContextManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.actualMaxTokens = getModelContextWindow(this.config.model);
  }
  
  /**
   * 更新模型（更新上下文窗口大小）
   */
  setModel(model: string): void {
    this.config.model = model;
    this.actualMaxTokens = getModelContextWindow(model);
    this.tokenCache.clear();
  }
  
  /**
   * 获取实际最大 token 数
   */
  getMaxTokens(): number {
    return this.actualMaxTokens;
  }
  
  /**
   * 检查上下文是否超限
   */
  isContextOverflow(
    messages: Message[],
    tools?: Tool[]
  ): boolean {
    const tokens = this.getTotalTokens(messages, tools);
    return tokens > this.actualMaxTokens - this.config.reservedOutputTokens;
  }
  
  /**
   * 获取总 token 数（包括工具定义）
   */
  getTotalTokens(
    messages: Message[],
    tools?: Tool[]
  ): number {
    const messageTokens = estimateMessagesTokens(messages);
    const toolTokens = tools ? estimateToolTokens(tools) : 0;
    return messageTokens + toolTokens;
  }
  
  /**
   * 获取上下文统计
   */
  getContextStats(
    messages: Message[],
    tools?: Tool[]
  ): {
    totalTokens: number;
    messageCount: number;
    userTokens: number;
    assistantTokens: number;
    toolTokens: number;
    systemTokens: number;
    toolDefinitionTokens: number;
    maxTokens: number;
    usagePercent: number;
  } {
    const stats = {
      totalTokens: 0,
      messageCount: messages.length,
      userTokens: 0,
      assistantTokens: 0,
      toolTokens: 0,
      systemTokens: 0,
      toolDefinitionTokens: tools ? estimateToolTokens(tools) : 0,
      maxTokens: this.actualMaxTokens,
      usagePercent: 0,
    };
    
    for (const msg of messages) {
      const tokens = estimateMessageTokens(msg);
      stats.totalTokens += tokens;
      
      switch (msg.role) {
        case 'user':
          stats.userTokens += tokens;
          break;
        case 'assistant':
          stats.assistantTokens += tokens;
          break;
        case 'tool':
          stats.toolTokens += tokens;
          break;
        case 'system':
          stats.systemTokens += tokens;
          break;
      }
    }
    
    stats.totalTokens += stats.toolDefinitionTokens;
    stats.usagePercent = (stats.totalTokens / this.actualMaxTokens) * 100;
    
    return stats;
  }
  
  /**
   * 裁剪消息历史以适应上下文窗口
   * 
   * 策略：
   * 1. 计算系统消息和工具定义占用的 token
   * 2. 从最新的消息开始，保留到达到 token 限制
   * 3. 如果系统消息过长，给出警告
   */
  trimMessages(
    messages: Message[],
    tools?: Tool[]
  ): Message[] {
    const maxInputTokens = this.actualMaxTokens - this.config.reservedOutputTokens;
    
    // 分离系统消息和对话历史
    const systemMessages = messages.filter(m => m.role === 'system');
    const historyMessages = messages.filter(m => m.role !== 'system');
    
    // 计算固定占用的 token
    const systemTokens = estimateMessagesTokens(systemMessages);
    const toolTokens = tools ? estimateToolTokens(tools) : 0;
    const fixedTokens = systemTokens + toolTokens;
    
    // 检查系统消息是否过长
    if (fixedTokens > maxInputTokens * 0.5) {
      console.warn(`⚠️ 系统提示占用 ${(fixedTokens / 1000).toFixed(1)}K tokens，可能影响对话长度`);
    }
    
    // 计算可用于历史消息的 token
    const availableTokens = maxInputTokens - fixedTokens;
    
    if (availableTokens <= 0) {
      // 系统消息过长，只能保留系统消息
      console.warn(`⚠️ 系统提示过长 (${(systemTokens / 1000).toFixed(1)}K tokens)，无法保留对话历史`);
      return systemMessages.slice(0, 1);  // 只保留第一个系统消息
    }
    
    // 从最新的消息开始，保留到达到 token 限制
    const trimmedHistory: Message[] = [];
    let currentTokens = 0;
    
    // 从后往前遍历
    for (let i = historyMessages.length - 1; i >= 0; i--) {
      const msg = historyMessages[i];
      const msgTokens = estimateMessageTokens(msg);
      
      if (currentTokens + msgTokens <= availableTokens) {
        trimmedHistory.unshift(msg);
        currentTokens += msgTokens;
      } else {
        break;
      }
    }
    
    // 如果有截断，添加提示
    if (trimmedHistory.length < historyMessages.length) {
      const omittedCount = historyMessages.length - trimmedHistory.length;
      trimmedHistory.unshift({
        role: 'system',
        content: `[已省略 ${omittedCount} 条历史消息以适应上下文窗口]`,
      });
    }
    
    return [...systemMessages, ...trimmedHistory];
  }
  
  /**
   * 检查是否需要摘要
   */
  needsSummarization(
    messages: Message[],
    tools?: Tool[]
  ): boolean {
    if (!this.config.enableSummarization) return false;
    
    const stats = this.getContextStats(messages, tools);
    return stats.usagePercent > this.config.summarizationThreshold * 100;
  }
  
  /**
   * 格式化统计信息
   */
  formatStats(
    messages: Message[],
    tools?: Tool[]
  ): string {
    const stats = this.getContextStats(messages, tools);
    const lines = [
      `📊 上下文统计:`,
      `  模型窗口: ${stats.maxTokens.toLocaleString()} tokens`,
      `  总计: ${stats.totalTokens.toLocaleString()} tokens (${stats.messageCount} 条消息)`,
      `  ├─ 系统: ${stats.systemTokens.toLocaleString()} tokens`,
      `  ├─ 用户: ${stats.userTokens.toLocaleString()} tokens`,
      `  ├─ 助手: ${stats.assistantTokens.toLocaleString()} tokens`,
      `  ├─ 工具结果: ${stats.toolTokens.toLocaleString()} tokens`,
    ];
    
    if (stats.toolDefinitionTokens > 0) {
      lines.push(`  └─ 工具定义: ${stats.toolDefinitionTokens.toLocaleString()} tokens`);
    }
    
    // 使用率指示
    if (stats.usagePercent > 90) {
      lines.push(`  ⚠️ 使用率: ${stats.usagePercent.toFixed(1)}% (即将超限)`);
    } else if (stats.usagePercent > 75) {
      lines.push(`  ⚠️ 使用率: ${stats.usagePercent.toFixed(1)}% (建议压缩)`);
    } else if (stats.usagePercent > 50) {
      lines.push(`  使用率: ${stats.usagePercent.toFixed(1)}%`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * 获取优化建议
   */
  getOptimizationSuggestions(
    messages: Message[],
    tools?: Tool[]
  ): string[] {
    const suggestions: string[] = [];
    const stats = this.getContextStats(messages, tools);
    
    if (stats.systemTokens > 5000) {
      suggestions.push('系统提示过长，考虑简化或拆分技能');
    }
    
    if (stats.toolDefinitionTokens > 3000) {
      suggestions.push('工具定义占用较多，考虑移除不常用的工具');
    }
    
    if (stats.usagePercent > 75) {
      suggestions.push('使用 /reset 开始新会话');
      suggestions.push('使用 /history 查看并清理历史');
    }
    
    if (stats.messageCount > 50) {
      suggestions.push('对话历史较长，建议开始新会话');
    }
    
    return suggestions;
  }
}

// ============ 全局实例 ============

let globalManager: ContextManager | null = null;

export function getContextManager(config?: Partial<ContextManagerConfig>): ContextManager {
  if (!globalManager) {
    globalManager = new ContextManager(config);
  }
  return globalManager;
}

export function resetContextManager(): void {
  globalManager = null;
}