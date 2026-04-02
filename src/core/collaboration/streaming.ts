/**
 * 流式执行支持
 * 
 * 提供流式响应和实时进度反馈
 */

import {
  AgentNode,
  GraphState,
  ExecutionResult,
  ExecutionLog,
  AgentEvent,
  END_NODE,
} from './types.js';
import { GraphExecutor, LLMClient, RunOptions } from './executor.js';

// ============ 类型定义 ============

/**
 * 流式事件类型
 */
export type StreamEventType =
  | 'start'           // 执行开始
  | 'node_start'      // 节点开始
  | 'node_chunk'      // 节点输出块
  | 'node_complete'   // 节点完成
  | 'node_error'      // 节点错误
  | 'handoff'         // Agent 切换
  | 'progress'        // 进度更新
  | 'complete'        // 执行完成
  | 'error';          // 执行错误

/**
 * 流式事件
 */
export interface StreamEvent {
  /** 事件类型 */
  type: StreamEventType;
  /** 时间戳 */
  timestamp: number;
  /** 节点 ID */
  nodeId?: string;
  /** 节点名称 */
  nodeName?: string;
  /** 内容块 */
  chunk?: string;
  /** 完整内容 */
  content?: string;
  /** 错误信息 */
  error?: string;
  /** 进度 (0-1) */
  progress?: number;
  /** 目标 Agent */
  targetAgent?: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 流式回调
 */
export type StreamCallback = (event: StreamEvent) => void;

/**
 * 流式选项
 */
export interface StreamOptions extends RunOptions {
  /** 是否启用流式 */
  streaming?: boolean;
  /** 块大小（字符数） */
  chunkSize?: number;
  /** 块间隔（毫秒） */
  chunkInterval?: number;
  /** 进度回调频率（毫秒） */
  progressInterval?: number;
}

/**
 * 异步迭代器结果
 */
export interface StreamIterationResult {
  done: boolean;
  value?: StreamEvent;
}

// ============ 流式执行器 ============

/**
 * 流式执行器
 */
export class StreamingExecutor extends GraphExecutor {
  private streamCallbacks: StreamCallback[] = [];
  private abortController: AbortController | null = null;

  /**
   * 添加流式回调
   */
  onStream(callback: StreamCallback): this {
    this.streamCallbacks.push(callback);
    return this;
  }

  /**
   * 移除流式回调
   */
  offStream(callback: StreamCallback): this {
    const index = this.streamCallbacks.indexOf(callback);
    if (index >= 0) {
      this.streamCallbacks.splice(index, 1);
    }
    return this;
  }

  /**
   * 发射流式事件
   */
  protected emitStream(event: StreamEvent): void {
    for (const callback of this.streamCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('Stream callback error:', error);
      }
    }
  }

  /**
   * 流式执行
   */
  async *runStream(
    input: string,
    llmClient: LLMClient,
    options?: StreamOptions
  ): AsyncGenerator<StreamEvent, ExecutionResult, unknown> {
    this.abortController = new AbortController();
    
    const startTime = Date.now();
    const maxIterations = options?.maxIterations ?? 50;
    const threadId = options?.threadId ?? `stream_${Date.now()}`;

    // 创建执行状态
    const runState: GraphState = {
      messages: [],
      currentNode: this['graph'].entryPoint,
      context: {},
    };
    const runHistory: ExecutionLog[] = [];
    let currentNodeId = this['graph'].entryPoint;

    // 添加用户消息
    runState.messages.push({
      role: 'user',
      content: input,
      timestamp: Date.now(),
    });

    // 发射开始事件
    yield {
      type: 'start',
      timestamp: startTime,
      metadata: { input, threadId },
    };

    let iterations = 0;

    try {
      while (iterations < maxIterations && !this.abortController.signal.aborted) {
        iterations++;

        const node = this['graph'].nodes.get(currentNodeId);
        if (!node) {
          throw new Error(`Node not found: ${currentNodeId}`);
        }

        // 发射节点开始事件
        yield {
          type: 'node_start',
          timestamp: Date.now(),
          nodeId: currentNodeId,
          nodeName: node.name,
          progress: iterations / maxIterations,
        };

        // 执行节点（流式）
        const response = await this.executeNodeStreaming(
          node,
          llmClient,
          runState,
          runHistory,
          options,
          function* (chunk: string) {
            // 这个回调用于在执行过程中产出块
          }
        );

        // 处理响应
        if (response.type === 'result') {
          // 发射完成事件
          yield {
            type: 'complete',
            timestamp: Date.now(),
            content: response.content,
          };

          return {
            success: true,
            result: response.content,
            state: runState,
            history: runHistory,
            threadId,
            mode: this['graph'].executionMode,
          };
        }

        // 发射节点完成事件
        yield {
          type: 'node_complete',
          timestamp: Date.now(),
          nodeId: currentNodeId,
          nodeName: node.name,
          content: response.content,
        };

        // 查找下一个节点
        const nextNodeId = this.findNextNodeWithContext(response, runState);

        if (!nextNodeId || nextNodeId === END_NODE) {
          yield {
            type: 'complete',
            timestamp: Date.now(),
            content: response.content,
          };

          return {
            success: true,
            result: response.content,
            state: runState,
            history: runHistory,
            threadId,
            mode: this['graph'].executionMode,
          };
        }

        // 发射 Handoff 事件
        if (response.type === 'handoff') {
          yield {
            type: 'handoff',
            timestamp: Date.now(),
            nodeId: currentNodeId,
            targetAgent: nextNodeId,
            content: response.message,
          };
        }

        // 发射进度事件
        yield {
          type: 'progress',
          timestamp: Date.now(),
          progress: iterations / maxIterations,
          metadata: { currentNode: currentNodeId, nextNode: nextNodeId },
        };

        currentNodeId = nextNodeId;
        runState.currentNode = nextNodeId;
      }

      // 超过最大迭代
      yield {
        type: 'error',
        timestamp: Date.now(),
        error: 'Max iterations reached',
      };

      return {
        success: false,
        error: 'Max iterations reached',
        state: runState,
        history: runHistory,
        threadId,
        mode: this['graph'].executionMode,
      };

    } catch (error) {
      yield {
        type: 'error',
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        state: runState,
        history: runHistory,
        threadId,
        mode: this['graph'].executionMode,
      };
    }
  }

  /**
   * 流式执行节点
   */
  protected async executeNodeStreaming(
    node: AgentNode,
    llmClient: LLMClient,
    state: GraphState,
    history: ExecutionLog[],
    options?: StreamOptions,
    onChunk?: (chunk: string) => void
  ): Promise<{ type: 'result' | 'handoff'; content: string; message?: string; target?: string }> {
    // 如果 LLM 客户端支持流式，使用流式调用
    if (this.isStreamingClient(llmClient) && options?.streaming) {
      return this.executeWithStreamingLLM(node, llmClient, state, history, onChunk);
    }

    // 否则使用普通执行
    return this['executeNodeWithContext'](node, llmClient, state, history);
  }

  /**
   * 检查是否为流式客户端
   */
  protected isStreamingClient(llmClient: LLMClient): boolean {
    return 'streamChat' in llmClient && typeof (llmClient as any).streamChat === 'function';
  }

  /**
   * 使用流式 LLM 执行
   */
  protected async executeWithStreamingLLM(
    node: AgentNode,
    llmClient: LLMClient & { streamChat: Function },
    state: GraphState,
    history: ExecutionLog[],
    onChunk?: (chunk: string) => void
  ): Promise<{ type: 'result' | 'handoff'; content: string; message?: string; target?: string }> {
    const systemPrompt = this['buildSystemPrompt'](node);
    const outEdges = this['getOutEdges'](node.id);
    const handoffTools = this['buildHandoffTools'](outEdges);

    let fullContent = '';

    try {
      // 流式调用 LLM
      const stream = await llmClient.streamChat({
        system: systemPrompt,
        messages: state.messages,
        tools: handoffTools.length > 0 ? handoffTools : undefined,
      });

      for await (const chunk of stream) {
        if (chunk.content) {
          fullContent += chunk.content;
          onChunk?.(chunk.content);
        }

        if (chunk.toolCall) {
          // 处理 tool call
          const handoff = this['parseHandoff'](chunk.toolCall);
          if (handoff) {
            return {
              type: 'handoff',
              content: fullContent,
              message: handoff.message,
              target: handoff.target,
            };
          }
        }
      }

      return {
        type: 'result',
        content: fullContent,
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * 取消执行
   */
  abort(): void {
    this.abortController?.abort();
  }
}

// ============ 便捷函数 ============

/**
 * 创建流式执行器
 */
export function createStreamingExecutor(graph: any): StreamingExecutor {
  return new StreamingExecutor(graph);
}

/**
 * 流式执行辅助函数
 */
export async function runWithStreaming(
  executor: StreamingExecutor,
  input: string,
  llmClient: LLMClient,
  options?: StreamOptions
): Promise<ExecutionResult> {
  const events: StreamEvent[] = [];
  let result: ExecutionResult | null = null;

  for await (const event of executor.runStream(input, llmClient, options)) {
    events.push(event);
    if (event.type === 'complete' || event.type === 'error') {
      // 最后一个事件包含结果
    }
  }

  // 从迭代器返回值获取结果
  return result ?? {
    success: false,
    error: 'No result from stream',
    state: {},
    history: [],
    threadId: '',
    mode: 'lightweight',
  };
}