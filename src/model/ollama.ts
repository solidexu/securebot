/**
 * Ollama 模型适配器
 * 
 * 对接本地 Ollama API，支持多模型切换和流式输出
 */

import { request } from 'undici';
import type { ModelAdapter, ChatParams, ChatResult, Message, Tool } from '../core/types.js';

// ============ Ollama API Types ============

interface OllamaChatRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
    tool_calls?: OllamaToolCall[];
  }>;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface OllamaChatResponse {
  model: string;
  message: {
    role: string;
    content: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, unknown>;
      };
    }>;
  };
  done: boolean;
  eval_count?: number;
  prompt_eval_count?: number;
}

interface OllamaStreamResponse {
  model: string;
  message: {
    role: string;
    content: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, unknown>;
      };
    }>;
  };
  done: boolean;
  eval_count?: number;
  prompt_eval_count?: number;
}

interface OllamaModelsResponse {
  models: Array<{
    name: string;
    modified_at: string;
    size: number;
  }>;
}

// ============ 流式回调类型 ============

/**
 * 流式响应回调
 */
export type StreamCallback = (chunk: {
  content: string;
  done: boolean;
}) => void;

/**
 * 聊天参数（扩展支持流式）
 */
export interface StreamChatParams extends ChatParams {
  /** 流式回调 */
  onStream?: StreamCallback;
  /** 取消信号 */
  signal?: AbortSignal;
}

// ============ Ollama Adapter ============

/**
 * Ollama 适配器
 */
export class OllamaAdapter implements ModelAdapter {
  private baseUrl: string;
  private defaultModel: string;
  private timeout: number;

  constructor(options: {
    baseUrl?: string;
    defaultModel?: string;
    timeout?: number;
  } = {}) {
    this.baseUrl = options.baseUrl ?? 'http://localhost:11434';
    this.defaultModel = options.defaultModel ?? 'qwen3.5-35b-a3b';
    this.timeout = options.timeout ?? 300000; // 5 分钟默认超时
  }

  /**
   * 发送聊天请求（非流式）
   */
  async chat(params: ChatParams): Promise<ChatResult> {
    return this.chatWithStream({ ...params, onStream: undefined });
  }

  /**
   * 发送聊天请求（支持流式）
   */
  async chatWithStream(params: StreamChatParams): Promise<ChatResult> {
    const model = params.model ?? this.defaultModel;
    const useStream = !!params.onStream;
    
    // 转换消息格式
    const messages = params.messages.map(msg => this.convertMessage(msg));
    
    // 转换工具格式
    const tools = params.tools?.map(t => this.convertTool(t));
    
    const requestBody: OllamaChatRequest = {
      model,
      messages,
      tools: tools?.length ? tools : undefined,
      stream: useStream,
      options: {
        temperature: params.temperature,
        num_predict: params.maxTokens,
      } as { temperature?: number; num_predict?: number },
    };

    try {
      if (useStream) {
        return await this.chatStream(requestBody, params.onStream!, params.signal);
      } else {
        return await this.chatNonStream(requestBody);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Ollama API 错误: ${message}`);
    }
  }

  /**
   * 非流式聊天
   */
  private async chatNonStream(requestBody: OllamaChatRequest): Promise<ChatResult> {
    const response = await request(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      bodyTimeout: this.timeout,
    });

    if (response.statusCode >= 400) {
      const errorBody = await response.body.text();
      throw new Error(`HTTP ${response.statusCode}: ${errorBody}`);
    }

    const data = await response.body.json() as OllamaChatResponse;
    
    return {
      content: data.message.content ?? '',
      toolCalls: data.message.tool_calls?.map(tc => ({
        id: this.generateToolCallId(),
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
    };
  }

  /**
   * 流式聊天
   */
  private async chatStream(
    requestBody: OllamaChatRequest,
    onStream: StreamCallback,
    signal?: AbortSignal
  ): Promise<ChatResult> {
    let aborted = false;
    let abortHandler: (() => void) | null = null;
    
    // 创建一个 Promise 用于在 abort 时立即返回
    let abortReject: ((error: Error) => void) | null = null;
    const abortPromise = new Promise<never>((_, reject) => {
      abortReject = reject;
    });
    
    // 监听 abort 事件
    if (signal) {
      abortHandler = () => {
        aborted = true;
        abortReject?.(new Error('Request aborted'));
      };
      signal.addEventListener('abort', abortHandler);
    }
    
    try {
      const response = await request(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...requestBody, stream: true }),
        bodyTimeout: this.timeout,
        signal,  // 传递 AbortSignal
      });

      if (response.statusCode >= 400) {
        const errorBody = await response.body.text();
        throw new Error(`HTTP ${response.statusCode}: ${errorBody}`);
      }

      // 读取流式响应
      let fullContent = '';
      let toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
      let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      // 使用 async iterator 读取 NDJSON 流，同时监听 abort
      try {
        // 创建迭代器
        const iterator = response.body[Symbol.asyncIterator]();
        
        while (!aborted) {
          // 使用 Promise.race 来支持 abort
          const { done, value } = await Promise.race([
            iterator.next(),
            abortPromise,
          ]);
          
          if (done || aborted) break;
          
          const chunk = value;
          const text = chunk.toString();
          
          // NDJSON 格式，每行一个 JSON
          const lines = text.split('\n').filter((line: string) => line.trim());
          
          for (const line of lines) {
            if (aborted) break;
            
            try {
              const data = JSON.parse(line) as OllamaStreamResponse;
              
              if (data.message?.content) {
                fullContent += data.message.content;
                onStream({
                  content: data.message.content,
                  done: data.done,
                });
              }
              
              // 收集工具调用
              if (data.message?.tool_calls) {
                for (const tc of data.message.tool_calls) {
                  // 合并同名的工具调用参数
                  const existing = toolCalls.find(t => t.name === tc.function.name);
                  if (existing) {
                    // 合并参数（流式可能分段返回）
                    existing.arguments = { ...existing.arguments, ...tc.function.arguments };
                  } else {
                    toolCalls.push({
                      name: tc.function.name,
                      arguments: tc.function.arguments,
                    });
                  }
                }
              }
              
              // 最后一个 chunk 包含使用统计
              if (data.done) {
                usage = {
                  promptTokens: data.prompt_eval_count ?? 0,
                  completionTokens: data.eval_count ?? 0,
                  totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
                };
                onStream({ content: '', done: true });
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      } catch (error) {
        // 如果是 abort 导致的，返回已收集的内容
        if (aborted || (error instanceof Error && error.message === 'Request aborted')) {
          // 返回部分结果
          return {
            content: fullContent,
            toolCalls: toolCalls.length > 0 ? toolCalls.map(tc => ({
              id: this.generateToolCallId(),
              name: tc.name,
              arguments: tc.arguments,
            })) : undefined,
            usage,
          };
        }
        throw error;
      }

      return {
        content: fullContent,
        toolCalls: toolCalls.length > 0 ? toolCalls.map(tc => ({
          id: this.generateToolCallId(),
          name: tc.name,
          arguments: tc.arguments,
        })) : undefined,
        usage,
      };
    } finally {
      // 清理 abort 监听器
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
      }
    }
  }

  /**
   * 列出可用模型
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await request(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });

      if (response.statusCode >= 400) {
        throw new Error(`HTTP ${response.statusCode}`);
      }

      const data = await response.body.json() as OllamaModelsResponse;
      return data.models.map(m => m.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`获取模型列表失败: ${message}`);
    }
  }

  /**
   * 检查连接状态
   */
  async healthCheck(): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await request(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });
      
      if (response.statusCode !== 200) {
        return { ok: false, error: `HTTP ${response.statusCode}` };
      }
      
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  }

  /**
   * 切换默认模型
   */
  setDefaultModel(model: string): void {
    this.defaultModel = model;
  }

  /**
   * 获取当前默认模型
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }

  // ============ Private Methods ============

  /**
   * 转换消息格式
   */
  private convertMessage(msg: Message): OllamaChatRequest['messages'][number] {
    return {
      role: msg.role,
      content: msg.content,
      tool_calls: msg.toolCalls?.map(tc => ({
        function: {
          name: tc.name,
          arguments: tc.arguments,
        },
      })),
    } as OllamaChatRequest['messages'][number];
  }

  /**
   * 转换工具格式
   */
  private convertTool(tool: Tool): NonNullable<OllamaChatRequest['tools']>[number] {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as unknown as Record<string, unknown>,
      },
    };
  }

  /**
   * 生成工具调用 ID
   */
  private generateToolCallId(): string {
    return `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

// ============ 工厂函数 ============

/**
 * 创建 Ollama 适配器
 */
export function createOllamaAdapter(options?: {
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
}): OllamaAdapter {
  return new OllamaAdapter(options);
}