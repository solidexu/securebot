/**
 * Ollama 模型适配器
 * 
 * 对接本地 Ollama API，支持多模型切换和流式输出
 * 使用 Node.js 内置的 fetch API，支持 AbortController
 */

import type { ModelAdapter, ChatParams, ChatResult, Message, Tool } from '../core/types.js';

// ============ 自定义错误类 ============

/**
 * Ollama 连接错误
 */
export class OllamaConnectionError extends Error {
  public readonly baseUrl: string;
  public readonly availableModels: string[];
  
  constructor(message: string, baseUrl: string, availableModels: string[] = []) {
    super(message);
    this.name = 'OllamaConnectionError';
    this.baseUrl = baseUrl;
    this.availableModels = availableModels;
  }
  
  /**
   * 获取用户友好的错误提示
   */
  getUserFriendlyMessage(): string {
    const lines: string[] = [];
    
    lines.push(`❌ Ollama 连接失败: ${this.message}`);
    lines.push('');
    lines.push('📋 解决方案:');
    lines.push('  1. 启动 Ollama 服务:');
    lines.push('     ollama serve');
    lines.push('');
    lines.push('  2. 检查服务地址:');
    lines.push(`     当前配置: ${this.baseUrl}`);
    lines.push('');
    lines.push('  3. 使用 /model 命令切换到云端模型');
    
    return lines.join('\n');
  }
}

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
  private connectionStatus: 'unknown' | 'connected' | 'disconnected' = 'unknown';
  private lastCheckTime: number = 0;
  private readonly CHECK_INTERVAL = 60000; // 1 分钟检查一次

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
   * 检查 Ollama 服务是否可用
   */
  async checkConnection(): Promise<{
    connected: boolean;
    error?: string;
    models?: string[];
  }> {
    const now = Date.now();
    
    // 如果最近检查过且状态正常，返回缓存结果
    if (this.connectionStatus === 'connected' && now - this.lastCheckTime < this.CHECK_INTERVAL) {
      return { connected: true };
    }
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 秒超时
      
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        this.connectionStatus = 'disconnected';
        return {
          connected: false,
          error: `服务响应错误: HTTP ${response.status}`,
        };
      }
      
      const data = await response.json() as OllamaModelsResponse;
      const models = data.models?.map(m => m.name) ?? [];
      
      this.connectionStatus = 'connected';
      this.lastCheckTime = now;
      
      return { connected: true, models };
    } catch (error) {
      this.connectionStatus = 'disconnected';
      
      let errorMessage = '无法连接到 Ollama 服务';
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = '连接超时 (5秒)';
        } else if (error.message.includes('ECONNREFUSED')) {
          errorMessage = 'Ollama 服务未运行';
        } else if (error.message.includes('ENOTFOUND')) {
          errorMessage = `无法解析地址: ${this.baseUrl}`;
        } else {
          errorMessage = error.message;
        }
      }
      
      return {
        connected: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus(): 'unknown' | 'connected' | 'disconnected' {
    return this.connectionStatus;
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
    // 先检查连接状态
    const connection = await this.checkConnection();
    if (!connection.connected) {
      throw new OllamaConnectionError(
        connection.error || '无法连接到 Ollama 服务',
        this.baseUrl,
        connection.models || []
      );
    }
    
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
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...requestBody, stream: false }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorBody}`);
    }

    const data = await response.json() as OllamaChatResponse;

    return {
      content: data.message.content,
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
    // 使用 AbortController 合并外部 signal 和超时
    const abortController = new AbortController();
    
    // 监听外部 signal（兼容性处理）
    const abortHandler = () => {
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
    };
    
    // 检查 signal 是否支持 addEventListener（Node.js 15+）
    // 旧版本可能不支持，使用兼容方式
    if (signal && typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', abortHandler);
    } else if (signal) {
      // 兼容旧版本：直接检查 aborted 状态
      if (signal.aborted) {
        abortController.abort();
      }
    }
    
    // 设置超时
    const timeoutId = setTimeout(() => {
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
    }, this.timeout);
    
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...requestBody, stream: true }),
        signal: abortController.signal,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', abortHandler);
      }
      
      // 如果是被取消的，返回空结果
      if (signal?.aborted || abortController.signal.aborted) {
        return {
          content: '',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      }
      throw error;
    }

    if (!response.ok) {
      clearTimeout(timeoutId);
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', abortHandler);
      }
      const errorBody = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorBody}`);
    }

    // 读取流式响应
    let fullContent = '';
    let toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    
    // 在 try 块外定义，确保 catch/finally 可以访问
    let streamAbortHandler: (() => void) | undefined;

    try {
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法获取响应流');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      // 创建一个 Promise 用于监听 abort
      let abortPromiseResolve: () => void;
      const createAbortPromise = () => new Promise<void>((resolve) => {
        abortPromiseResolve = resolve;
      });
      
      // 监听 abort，触发 Promise resolve（兼容性处理）
      streamAbortHandler = () => {
        abortPromiseResolve?.();
      };
      // 兼容性处理：检查是否支持 addEventListener
      if (signal && typeof signal.addEventListener === 'function') {
        signal.addEventListener('abort', streamAbortHandler);
      }
      abortController.signal.addEventListener('abort', streamAbortHandler);

      // 定义读取结果类型
      type ReadResult = { done: boolean; value: Uint8Array | undefined };

      while (true) {
        // 使用 Promise.race 同时监听 read 和 abort
        const abortPromise = createAbortPromise();
        
        let readResult: ReadResult;
        try {
          readResult = await Promise.race([
            reader.read(),
            abortPromise.then(() => ({ done: true, value: undefined } as ReadResult)),
          ]) as ReadResult;
        } catch (error) {
          // read 失败，可能是 abort 导致
          if (signal?.aborted || abortController.signal.aborted) {
            break;
          }
          throw error;
        }

        const { done, value } = readResult;
        
        if (done) break;
        if (!value) continue;
        
        // 再次检查取消
        if (signal?.aborted || abortController.signal.aborted) {
          try {
            reader.cancel();
          } catch {
            // 忽略 cancel 错误
          }
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        
        // NDJSON 格式，每行一个 JSON
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // 保留不完整的行
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
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
                const existing = toolCalls.find(t => t.name === tc.function.name);
                if (existing) {
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
      
      // 正常结束时移除监听器
      if (streamAbortHandler && signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', streamAbortHandler);
      }
      if (streamAbortHandler) {
        abortController.signal.removeEventListener('abort', streamAbortHandler);
      }
    } catch (error) {
      // ★ 修复：确保在异常时也移除监听器（检查是否已定义）
      if (streamAbortHandler) {
        if (signal && typeof signal.removeEventListener === 'function') {
          signal.removeEventListener('abort', streamAbortHandler);
        }
        abortController.signal.removeEventListener('abort', streamAbortHandler);
      }
      
      // 如果是被取消的，返回已收集的内容
      if (signal?.aborted || abortController.signal.aborted) {
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
    } finally {
      clearTimeout(timeoutId);
      // 兼容性处理：检查是否支持 removeEventListener
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', abortHandler);
      }
      // ★ 修复：双重保险，确保所有监听器都被清理（检查是否已定义）
      if (streamAbortHandler && signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', streamAbortHandler);
      }
      if (streamAbortHandler) {
        abortController.signal.removeEventListener('abort', streamAbortHandler);
      }
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
  }

  /**
   * 列出可用模型
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as OllamaModelsResponse;
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
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });
      
      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}` };
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
  private convertTool(tool: Tool): { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } } {
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

// ============ Factory Function ============

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