/**
 * 上下文管理器
 * 
 * 管理 LLM 上下文长度，支持：
 * - Token 计数
 * - 自动截断
 * - 智能摘要
 */

import type { Message } from './types.js';

// ============ 配置 ============

export interface ContextManagerConfig {
  /** 最大 token 数（模型上下文窗口） */
  maxTokens: number;
  /** 保留的系统消息 token 数 */
  reservedSystemTokens: number;
  /** 是否启用自动摘要 */
  enableSummarization: boolean;
  /** 触发摘要的阈值（token 数） */
  summarizationThreshold: number;
}

const DEFAULT_CONFIG: ContextManagerConfig = {
  maxTokens: 32768,  // 大多数模型支持 32K
  reservedSystemTokens: 4000,  // 系统提示预留 4K
  enableSummarization: true,
  summarizationThreshold: 24000,  // 超过 24K 触发摘要
};

// ============ Token 估算 ============

/**
 * 估算文本的 token 数
 * 
 * 简单估算：中文约 1.5 字/token，英文约 0.25 词/token
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  
  // 分离中文和非中文
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const nonChineseChars = text.length - chineseChars;
  
  // 中文：约 1.5 字/token
  // 英文：约 4 字/token（0.25 词/token）
  return Math.ceil(chineseChars / 1.5 + nonChineseChars / 4);
}

/**
 * 估算消息的 token 数
 */
function estimateMessageTokens(message: Message): number {
  let tokens = 4;  // 消息格式开销
  
  if (message.content) {
    tokens += estimateTokens(message.content);
  }
  
  if (message.toolCalls) {
    for (const tc of message.toolCalls) {
      tokens += estimateTokens(tc.name || '');
      tokens += estimateTokens(JSON.stringify(tc.arguments || {}));
    }
  }
  
  if (message.name) {
    tokens += estimateTokens(message.name);
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
  
  constructor(config: Partial<ContextManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * 检查上下文是否超限
   */
  isContextOverflow(messages: Message[]): boolean {
    const tokens = estimateMessagesTokens(messages);
    return tokens > this.config.maxTokens;
  }
  
  /**
   * 获取上下文统计
   */
  getContextStats(messages: Message[]): {
    totalTokens: number;
    messageCount: number;
    userTokens: number;
    assistantTokens: number;
    toolTokens: number;
    systemTokens: number;
  } {
    const stats = {
      totalTokens: 0,
      messageCount: messages.length,
      userTokens: 0,
      assistantTokens: 0,
      toolTokens: 0,
      systemTokens: 0,
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
    
    return stats;
  }
  
  /**
   * 裁剪消息历史以适应上下文窗口
   * 
   * 策略：保留系统消息 + 最近的对话
   */
  trimMessages(messages: Message[]): Message[] {
    const maxContentTokens = this.config.maxTokens - this.config.reservedSystemTokens;
    
    // 分离系统消息和对话历史
    const systemMessages = messages.filter(m => m.role === 'system');
    const historyMessages = messages.filter(m => m.role !== 'system');
    
    // 计算系统消息 token
    const systemTokens = estimateMessagesTokens(systemMessages);
    const availableTokens = maxContentTokens - systemTokens;
    
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
        // 达到限制，停止
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
  needsSummarization(messages: Message[]): boolean {
    if (!this.config.enableSummarization) return false;
    
    const tokens = estimateMessagesTokens(messages);
    return tokens > this.config.summarizationThreshold;
  }
  
  /**
   * 获取建议的摘要范围
   */
  getSummarizationRange(messages: Message[]): {
    startIndex: number;
    endIndex: number;
    tokensToSummarize: number;
  } | null {
    if (messages.length < 10) return null;
    
    const stats = this.getContextStats(messages);
    if (stats.totalTokens < this.config.summarizationThreshold) return null;
    
    // 摘要前半部分（保留最近 20 条）
    const keepRecent = 20;
    if (messages.length <= keepRecent) return null;
    
    const toSummarize = messages.slice(0, messages.length - keepRecent);
    const tokensToSummarize = estimateMessagesTokens(toSummarize);
    
    return {
      startIndex: 0,
      endIndex: messages.length - keepRecent,
      tokensToSummarize,
    };
  }
  
  /**
   * 格式化统计信息
   */
  formatStats(messages: Message[]): string {
    const stats = this.getContextStats(messages);
    const lines = [
      `📊 上下文统计:`,
      `  总计: ${stats.totalTokens.toLocaleString()} tokens (${stats.messageCount} 条消息)`,
      `  用户: ${stats.userTokens.toLocaleString()} tokens`,
      `  助手: ${stats.assistantTokens.toLocaleString()} tokens`,
      `  工具: ${stats.toolTokens.toLocaleString()} tokens`,
      `  系统: ${stats.systemTokens.toLocaleString()} tokens`,
    ];
    
    // 检查是否接近限制
    const usagePercent = (stats.totalTokens / this.config.maxTokens) * 100;
    if (usagePercent > 80) {
      lines.push(`  ⚠️ 使用率: ${usagePercent.toFixed(1)}% (接近限制)`);
    } else if (usagePercent > 60) {
      lines.push(`  使用率: ${usagePercent.toFixed(1)}%`);
    }
    
    return lines.join('\n');
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