/**
 * 模型服务实现
 */

import type { ModelService, ChatParams, ChatResult, ModelInfo } from './types.js';

/**
 * 模型服务实现
 */
export class ModelServiceImpl implements ModelService {
  private provider: string;
  private model: string;
  private client?: unknown;

  constructor(config?: { provider?: string; model?: string; client?: unknown }) {
    this.provider = config?.provider ?? 'default';
    this.model = config?.model ?? 'default';
    this.client = config?.client;
  }

  async chat(params: ChatParams): Promise<ChatResult> {
    // 实际实现需要调用 LLM 客户端
    // 这里提供基本框架
    if (!this.client) {
      throw new Error('Model client not configured');
    }

    // 调用实际的 LLM API
    // const response = await this.client.chat({...});
    
    return {
      content: '',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };
  }

  async stream(params: ChatParams, onChunk: (chunk: string) => void): Promise<void> {
    if (!this.client) {
      throw new Error('Model client not configured');
    }

    // 流式调用
    // for await (const chunk of this.client.stream(params)) {
    //   onChunk(chunk);
    // }
  }

  isAvailable(): boolean {
    return this.client !== undefined;
  }

  getModelInfo(): ModelInfo {
    return {
      provider: this.provider,
      model: this.model,
      contextWindow: 4096,
    };
  }
}