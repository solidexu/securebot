/**
 * 上下文压缩器
 * 
 * 当上下文过长时，自动压缩旧消息为摘要
 */

import type { Message } from './types.js';

// ============ 配置 ============

export interface CompressionConfig {
  /** 触发压缩的使用率阈值 */
  compressionThreshold: number;
  /** 压缩后保留的最近消息数 */
  keepRecentMessages: number;
  /** 压缩摘要的最大长度 */
  maxSummaryLength: number;
}

const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  compressionThreshold: 0.7,  // 使用率超过 70% 触发压缩
  keepRecentMessages: 10,    // 保留最近 10 条消息
  maxSummaryLength: 500,     // 摘要最大 500 字符
};

// ============ 消息类型 ============

interface MessageSummary {
  role: 'system';
  content: string;
  _compressed: true;
  _originalCount: number;
  _compressedAt: string;
}

// ============ 压缩器 ============

export class ContextCompressor {
  private config: CompressionConfig;
  private llm?: {
    chat: (params: { model: string; messages: Message[] }) => Promise<{ content: string }>;
  };
  private model?: string;
  
  constructor(config: Partial<CompressionConfig> = {}) {
    this.config = { ...DEFAULT_COMPRESSION_CONFIG, ...config };
  }
  
  /**
   * 设置 LLM 用于生成摘要
   */
  setLLM(
    llm: { chat: (params: { model: string; messages: Message[] }) => Promise<{ content: string }> },
    model: string
  ): void {
    this.llm = llm;
    this.model = model;
  }
  
  /**
   * 检查是否需要压缩
   */
  needsCompression(messages: Message[], maxTokens: number, currentTokens: number): boolean {
    const usageRate = currentTokens / maxTokens;
    return usageRate >= this.config.compressionThreshold;
  }
  
  /**
   * 压缩消息历史
   */
  async compress(messages: Message[]): Promise<Message[]> {
    if (messages.length <= this.config.keepRecentMessages) {
      return messages;
    }
    
    // 分离系统消息和对话消息
    const systemMessages = messages.filter(m => m.role === 'system' && !this.isCompressed(m));
    const compressedSummaries = messages.filter(m => this.isCompressed(m));
    const conversationMessages = messages.filter(m => m.role !== 'system');
    
    // 保留最近的对话消息
    const recentMessages = conversationMessages.slice(-this.config.keepRecentMessages);
    const oldMessages = conversationMessages.slice(0, -this.config.keepRecentMessages);
    
    if (oldMessages.length === 0) {
      return messages;
    }
    
    // 生成压缩摘要
    const summary = await this.generateSummary(oldMessages, compressedSummaries);
    
    // 构建新的消息列表
    const compressed: Message[] = [
      ...systemMessages,
      summary,
      ...recentMessages,
    ];
    
    return compressed;
  }
  
  /**
   * 生成摘要
   */
  private async generateSummary(
    messages: Message[],
    existingSummaries: Message[]
  ): Promise<MessageSummary> {
    // 提取消息内容
    const content = this.extractContent(messages);
    
    let summaryText: string;
    
    // 如果有 LLM，使用 LLM 生成摘要
    if (this.llm && this.model) {
      summaryText = await this.generateSummaryWithLLM(content, existingSummaries);
    } else {
      // 简单摘要：提取关键信息
      summaryText = this.generateSimpleSummary(content);
    }
    
    return {
      role: 'system',
      content: `[对话历史摘要]\n${summaryText}`,
      _compressed: true,
      _originalCount: messages.length,
      _compressedAt: new Date().toISOString(),
    };
  }
  
  /**
   * 使用 LLM 生成摘要
   */
  private async generateSummaryWithLLM(
    content: string,
    existingSummaries: Message[]
  ): Promise<string> {
    const existingContext = existingSummaries
      .map(s => s.content)
      .join('\n');
    
    const prompt: Message[] = [
      {
        role: 'system',
        content: '你是一个对话摘要专家。请将以下对话历史压缩为简洁的摘要，保留关键信息、决策和上下文。摘要应该让后续对话能够无缝继续。',
      },
      {
        role: 'user',
        content: `${existingContext ? '已有摘要：\n' + existingContext + '\n\n' : ''}新对话内容：\n${content}\n\n请生成摘要（不超过${this.config.maxSummaryLength}字）：`,
      },
    ];
    
    try {
      const result = await this.llm!.chat({
        model: this.model!,
        messages: prompt,
      });
      return result.content.slice(0, this.config.maxSummaryLength);
    } catch (error) {
      console.error('LLM 摘要生成失败，使用简单摘要:', error);
      return this.generateSimpleSummary(content);
    }
  }
  
  /**
   * 生成简单摘要（不使用 LLM）
   */
  private generateSimpleSummary(content: string): string {
    const lines = content.split('\n').filter(l => l.trim());
    
    // 提取关键信息
    const keyPoints: string[] = [];
    
    // 用户的主要需求
    const userMessages = lines.filter(l => l.startsWith('用户:') || l.startsWith('User:'));
    if (userMessages.length > 0) {
      keyPoints.push(`主要需求: ${userMessages[0].replace(/^(用户:|User:)\s*/, '').slice(0, 100)}`);
    }
    
    // 已完成的工作
    const completedTasks = lines.filter(l => 
      l.includes('完成') || l.includes('成功') || l.includes('创建') || l.includes('编辑')
    ).slice(0, 3);
    if (completedTasks.length > 0) {
      keyPoints.push(`已完成: ${completedTasks.join('; ').slice(0, 200)}`);
    }
    
    // 当前状态
    keyPoints.push(`消息数: ${lines.length} 条`);
    
    return keyPoints.join('\n');
  }
  
  /**
   * 提取消息内容
   */
  private extractContent(messages: Message[]): string {
    return messages.map(m => {
      const role = m.role === 'user' ? '用户' : 
                   m.role === 'assistant' ? '助手' : 
                   m.role === 'tool' ? '工具结果' : '系统';
      return `${role}: ${m.content?.slice(0, 500) || '(无内容)'}`;
    }).join('\n');
  }
  
  /**
   * 检查是否是压缩过的消息
   */
  private isCompressed(message: Message): boolean {
    return (message as MessageSummary)._compressed === true;
  }
  
  /**
   * 获取压缩统计
   */
  getCompressionStats(messages: Message[]): {
    totalMessages: number;
    compressedCount: number;
    originalCount: number;
  } {
    const compressedMessages = messages.filter(m => this.isCompressed(m));
    const originalCount = compressedMessages.reduce(
      (sum, m) => sum + ((m as MessageSummary)._originalCount || 0),
      0
    );
    
    return {
      totalMessages: messages.length,
      compressedCount: compressedMessages.length,
      originalCount,
    };
  }
}

// ============ 全局实例 ============

let globalCompressor: ContextCompressor | null = null;

export function getContextCompressor(config?: Partial<CompressionConfig>): ContextCompressor {
  if (!globalCompressor) {
    globalCompressor = new ContextCompressor(config);
  }
  return globalCompressor;
}

export function resetContextCompressor(): void {
  globalCompressor = null;
}