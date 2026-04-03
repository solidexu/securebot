/**
 * 图执行器
 * 
 * 负责执行 Agent 图，处理节点调用、边切换、状态管理
 */

import {
  AgentGraph,
  AgentNode,
  GraphState,
  GraphMessage,
  GraphEdge,
  GraphContext,
  ExecutionResult,
  ExecutionLog,
  NodeResponse,
  END_NODE,
  AgentEvent,
  RetryPolicy,
} from './types.js';
import { Graph } from './graph.js';
import { NodeExecutionError, TimeoutError, GraphBubbleUp } from '../errors.js';
import { runWithTimeout, DEFAULT_RETRY_POLICY, calculateBackoff, sleep } from '../retry.js';

/**
 * LLM 客户端接口
 */
export interface LLMClient {
  chat(params: {
    system: string;
    messages: GraphMessage[];
    tools?: ToolDefinition[];
  }): Promise<LLMResponse>;
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

/**
 * LLM 响应
 */
export interface LLMResponse {
  content: string;
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
  };
}

/**
 * 运行选项
 */
export interface RunOptions {
  /** 最大迭代次数，默认 50 */
  maxIterations?: number;
  /** 线程 ID（可选，用于持久化） */
  threadId?: string;
}

/**
 * 图执行器
 */
export class GraphExecutor {
  protected graph: AgentGraph;
  protected state: GraphState;
  protected currentNodeId: string;
  protected history: ExecutionLog[] = [];
  protected threadId: string;
  protected eventEmitter?: (event: AgentEvent) => void;
  protected graphId: string;

  constructor(graph: Graph | AgentGraph) {
    this.graph = graph instanceof Graph ? graph.getRaw() : graph;
    this.graphId = this.graph.id;
    this.state = {
      messages: [],
      currentNode: this.graph.entryPoint,
      context: {},
    };
    this.currentNodeId = this.graph.entryPoint;
    this.threadId = `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 设置事件发射器
   */
  setEventEmitter(emitter: (event: AgentEvent) => void): this {
    this.eventEmitter = emitter;
    return this;
  }

  /**
   * 发射事件
   */
  protected emitEvent(event: AgentEvent): void {
    if (this.eventEmitter) {
      this.eventEmitter(event);
    }
  }

  /**
   * 执行图（状态隔离，支持并发调用）
   */
  async run(input: string, llmClient: LLMClient, options?: RunOptions): Promise<ExecutionResult> {
    // 解析选项
    const maxIterations = options?.maxIterations ?? 50;
    const threadId = options?.threadId ?? `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 创建新的执行状态（避免并发冲突）
    const runState: GraphState = {
      messages: [],
      currentNode: this.graph.entryPoint,
      context: {},
    };
    const runHistory: ExecutionLog[] = [];
    let currentNodeId = this.graph.entryPoint;

    // 添加用户消息
    runState.messages.push({
      role: 'user',
      content: input,
      timestamp: Date.now(),
    });

    // 记录开始
    runHistory.push({
      timestamp: Date.now(),
      type: 'workflow_start',
      nodeId: currentNodeId,
      data: { input },
    });

    // 发射工作流开始事件
    this.emitEvent({
      type: 'workflow_start',
      graphId: this.graphId,
      threadId,
      input,
      timestamp: Date.now(),
    });

    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      // 获取当前节点
      const node = this.graph.nodes.get(currentNodeId);
      if (!node) {
        throw new Error(`Node not found: ${currentNodeId}`);
      }

      // 记录进入节点
      runHistory.push({
        timestamp: Date.now(),
        type: 'node_enter',
        nodeId: currentNodeId,
        data: { nodeName: node.name },
      });

      // 发射节点进入事件
      this.emitEvent({
        type: 'node_enter',
        nodeId: currentNodeId,
        nodeName: node.name,
        timestamp: Date.now(),
      });

      // 执行节点（传入运行状态而非实例状态）
      const startTime = Date.now();
      const response = await this.executeNodeWithContext(node, llmClient, runState, runHistory);
      const duration = Date.now() - startTime;

      // 处理响应
      if (response.type === 'result') {
        // 发射节点完成事件
        this.emitEvent({
          type: 'node_exit',
          nodeId: currentNodeId,
          result: response.content,
          duration,
          timestamp: Date.now(),
        });

        // 任务完成
        runHistory.push({
          timestamp: Date.now(),
          type: 'workflow_complete',
          nodeId: currentNodeId,
          data: { result: response.content },
        });

        // 发射工作流完成事件
        this.emitEvent({
          type: 'workflow_complete',
          graphId: this.graphId,
          threadId,
          result: response.content,
          timestamp: Date.now(),
        });

        return {
          success: true,
          result: response.content,
          state: runState,
          history: runHistory,
          threadId,
          mode: this.graph.executionMode,
        };
      }

      // 发射节点完成事件
      this.emitEvent({
        type: 'node_exit',
        nodeId: currentNodeId,
        result: response.content,
        duration,
        timestamp: Date.now(),
      });

      // 查找下一个节点
      const nextNodeId = this.findNextNodeWithContext(response, runState);
      
      if (!nextNodeId || nextNodeId === END_NODE) {
        // 结束
        runHistory.push({
          timestamp: Date.now(),
          type: 'workflow_complete',
          nodeId: currentNodeId,
          data: { reason: 'end_node' },
        });

        // 发射工作流完成事件
        this.emitEvent({
          type: 'workflow_complete',
          graphId: this.graphId,
          threadId,
          result: response.content,
          timestamp: Date.now(),
        });

        return {
          success: true,
          result: response.content,
          state: runState,
          history: runHistory,
          threadId,
          mode: this.graph.executionMode,
        };
      }

      // 发射 Handoff 事件
      if (response.type === 'handoff') {
        this.emitEvent({
          type: 'handoff',
          from: currentNodeId,
          to: nextNodeId,
          message: response.message,
          timestamp: Date.now(),
        });
      }

      // 切换到下一个节点
      runHistory.push({
        timestamp: Date.now(),
        type: 'node_switch',
        nodeId: currentNodeId,
        data: { from: currentNodeId, to: nextNodeId },
      });
      currentNodeId = nextNodeId;
      runState.currentNode = nextNodeId;
    }

    // 超过最大迭代次数
    runHistory.push({
      timestamp: Date.now(),
      type: 'workflow_timeout',
      nodeId: currentNodeId,
      data: { iterations },
    });

    // 发射工作流完成事件（错误）
    this.emitEvent({
      type: 'workflow_complete',
      graphId: this.graphId,
      threadId,
      error: 'Max iterations reached',
      timestamp: Date.now(),
    });

    return {
      success: false,
      error: 'Max iterations reached',
      state: runState,
      history: runHistory,
      threadId,
      mode: this.graph.executionMode,
    };
  }

  /**
   * 执行节点（带上下文，支持并发）
   */
  protected async executeNodeWithContext(
    node: AgentNode,
    llmClient: LLMClient,
    state: GraphState,
    history: ExecutionLog[]
  ): Promise<NodeResponse> {
    // 临时替换状态
    const originalState = this.state;
    const originalHistory = this.history;
    
    try {
      this.state = state;
      this.history = history;
      return await this.executeNode(node, llmClient);
    } finally {
      // 恢复原状态（或保持新状态用于结果）
      this.state = originalState;
      this.history = originalHistory;
    }
  }

  /**
   * 查找下一个节点（带上下文）
   */
  protected findNextNodeWithContext(response: NodeResponse, state: GraphState): string | null {
    const originalState = this.state;
    try {
      this.state = state;
      return this.findNextNode(response);
    } finally {
      this.state = originalState;
    }
  }

  /**
   * 执行节点
   */
  protected async executeNode(
    node: AgentNode,
    llmClient: LLMClient
  ): Promise<NodeResponse> {
    // 构建系统提示
    const systemPrompt = this.buildSystemPrompt(node);

    // 获取出边并构建 Handoff 工具
    const outEdges = this.getOutEdges(node.id);
    const handoffTools = this.buildHandoffTools(outEdges);

    // 获取超时和重试配置
    const timeout = node.behavior?.timeout;
    const retryPolicy = node.behavior?.retryPolicy;

    // 记录 LLM 调用
    this.log('llm_call', { nodeId: node.id, toolCount: handoffTools.length });

    // 执行 LLM 调用（带重试）
    const maxAttempts = retryPolicy?.maxAttempts || 1;
    let attempts = 0;
    let lastError: Error | undefined;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        // 调用 LLM（可选超时）
        const response = timeout
          ? await runWithTimeout(
              () => llmClient.chat({
                system: systemPrompt,
                messages: this.state.messages,
                tools: handoffTools.length > 0 ? handoffTools : undefined,
              }),
              timeout,
              node.id
            )
          : await llmClient.chat({
              system: systemPrompt,
              messages: this.state.messages,
              tools: handoffTools.length > 0 ? handoffTools : undefined,
            });

        // 添加助手消息到状态
        this.state.messages.push({
          role: 'assistant',
          content: response.content,
          node: node.id,
          timestamp: Date.now(),
        });

        // 处理工具调用（Handoff）
        if (response.toolCall) {
          const handoff = this.parseHandoff(response.toolCall);
          
          if (handoff) {
            this.log('handoff', {
              from: node.id,
              to: handoff.target,
              message: handoff.message,
            });

            return {
              type: 'handoff',
              content: response.content,
              target: handoff.target,
              message: handoff.message,
            };
          }
        }

        // 返回结果
        this.log('node_complete', { nodeId: node.id, contentLength: response.content.length });
        
        return {
          type: 'result',
          content: response.content,
        };

      } catch (error: any) {
        lastError = error;

        // 检查是否应该重试
        if (attempts < maxAttempts && this.shouldRetry(error)) {
          const delay = calculateBackoff(attempts, {
            ...DEFAULT_RETRY_POLICY,
            ...retryPolicy
          });
          
          this.log('node_retry', {
            nodeId: node.id,
            attempt: attempts,
            delay,
            error: error.message
          });

          await sleep(delay);
          continue;
        }

        // 不可重试或重试耗尽
        this.emitEvent({
          type: 'node_error',
          nodeId: node.id,
          error: error.message,
          timestamp: Date.now(),
        });

        throw new NodeExecutionError(node.id, node.name, error);
      }
    }

    throw lastError;
  }

  /**
   * 判断错误是否可重试
   */
  private shouldRetry(error: Error): boolean {
    // 超时错误可重试
    if (error instanceof TimeoutError) return true;
    // 用户取消不重试
    if (error instanceof GraphBubbleUp) return false;
    // 网络错误可重试
    const retryableMessages = ['ECONNRESET', 'ETIMEDOUT', 'network', 'timeout'];
    return retryableMessages.some(msg => 
      error.message.toLowerCase().includes(msg.toLowerCase())
    );
  }

  /**
   * 构建系统提示
   */
  protected buildSystemPrompt(node: AgentNode): string {
    // 动态提示
    if (typeof node.systemPrompt === 'function') {
      const context: GraphContext = {
        state: this.state,
        message: '',
      };
      return node.systemPrompt(context);
    }

    // 静态提示
    const handoffDescriptions = this.buildHandoffDescriptions(node.id);

    return `
${node.systemPrompt}

## 你的角色
${node.role}

## 可用的 Handoff
${handoffDescriptions}

## 当前上下文
${JSON.stringify(this.state.context, null, 2)}
`.trim();
  }

  /**
   * 构建 Handoff 描述
   */
  protected buildHandoffDescriptions(nodeId: string): string {
    const edges = this.getOutEdges(nodeId);
    
    if (edges.length === 0) {
      return '无（你是最后一个节点）';
    }

    return edges
      .map((edge) => {
        const targetNode = this.graph.nodes.get(edge.target);
        const label = edge.metadata?.label || `切换到 ${targetNode?.name || edge.target}`;
        return `- ${label} → transfer_to_${edge.target}`;
      })
      .join('\n');
  }

  /**
   * 构建 Handoff 工具定义
   */
  protected buildHandoffTools(edges: GraphEdge[]): ToolDefinition[] {
    return edges.map((edge) => {
      const targetNode = this.graph.nodes.get(edge.target);
      const label = edge.metadata?.label || `切换到 ${targetNode?.name || edge.target}`;

      return {
        name: `transfer_to_${edge.target}`,
        description: label,
        parameters: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: '传递给目标 Agent 的消息',
            },
          },
        },
      };
    });
  }

  /**
   * 获取节点的出边
   */
  protected getOutEdges(nodeId: string): GraphEdge[] {
    return this.graph.edges.filter((edge) => edge.source === nodeId);
  }

  /**
   * 查找下一个节点
   */
  protected findNextNode(response: NodeResponse): string | null {
    if (response.type !== 'handoff') {
      return null;
    }

    const edges = this.getOutEdges(this.currentNodeId);

    // 查找匹配的边
    for (const edge of edges) {
      if (edge.target === response.target) {
        // 直接边：直接通过
        if (edge.type === 'direct') {
          return edge.target;
        }

        // 条件边：检查条件
        if (this.checkCondition(edge)) {
          return edge.target;
        }
      }
    }

    // 查找默认边
    const defaultEdge = edges.find((edge) => edge.metadata?.isDefault);
    return defaultEdge?.target || null;
  }

  /**
   * 检查边条件
   */
  protected checkCondition(edge: GraphEdge): boolean {
    if (!edge.condition) {
      return true;
    }

    const { keywords, expression } = edge.condition;

    // 关键词匹配
    if (keywords && keywords.length > 0) {
      const lastMessage = this.state.messages[this.state.messages.length - 1];
      return keywords.some((kw) => lastMessage.content.includes(kw));
    }

    // 表达式判断（使用安全解析器）
    if (expression) {
      return this.evaluateExpression(expression, this.state);
    }

    return true;
  }

  /**
   * 安全表达式解析器
   * 仅支持基本比较和逻辑操作，不允许任意代码执行
   */
  protected evaluateExpression(expression: string, state: GraphState): boolean {
    // 白名单验证：只允许安全的表达式模式
    const safePattern = /^[\w\s.]+\s*(===|==|!==|!=|>|<|>=|<=|&&|\|\|)\s*[\w\s.'"]+$|^[\w\s.]+\s*(===|==|!==|!=|>|<|>=|<=|&&|\|\|)\s*[\w\s.'"]+\s*(&&|\|\|)\s*[\w\s.]+\s*(===|==|!==|!=|>|<|>=|<=)\s*[\w\s.'"]+$/;
    
    if (!safePattern.test(expression)) {
      this.log('expression_rejected', { expression, reason: 'unsafe_pattern' });
      return false;
    }

    // 安全解析：只允许访问 state 对象的属性
    // 替换 state.property 为实际值
    try {
      const sanitizedExpr = expression
        .replace(/state\.(\w+)/g, (_, prop) => {
          const value = state[prop as keyof GraphState];
          if (value === undefined) return 'undefined';
          if (typeof value === 'string') return `"${value.replace(/"/g, '\\"')}"`;
          if (typeof value === 'number') return String(value);
          if (typeof value === 'boolean') return String(value);
          return 'undefined';
        });

      // 使用受限的 eval，仅处理比较表达式
      const allowedOps = ['===', '==', '!==', '!=', '>', '<', '>=', '<=', '&&', '||'];
      let hasAllowedOp = false;
      for (const op of allowedOps) {
        if (sanitizedExpr.includes(op)) {
          hasAllowedOp = true;
          break;
        }
      }
      
      if (!hasAllowedOp) {
        this.log('expression_rejected', { expression, reason: 'no_allowed_operator' });
        return false;
      }

      // 直接解析而非 eval
      return this.parseSimpleExpression(sanitizedExpr);
    } catch (error) {
      this.log('expression_error', { expression, error: String(error) });
      return false;
    }
  }

  /**
   * 解析简单比较表达式
   */
  protected parseSimpleExpression(expr: string): boolean {
    // 处理逻辑运算符
    if (expr.includes('&&')) {
      const parts = expr.split('&&').map(p => this.parseSimpleExpression(p.trim()));
      return parts.every(Boolean);
    }
    if (expr.includes('||')) {
      const parts = expr.split('||').map(p => this.parseSimpleExpression(p.trim()));
      return parts.some(Boolean);
    }

    // 处理比较运算符
    const compOps = ['===', '==', '!==', '!=', '>=', '<=', '>', '<'];
    for (const op of compOps) {
      if (expr.includes(op)) {
        const [left, right] = expr.split(op).map(s => s.trim());
        return this.compareValues(left, right, op);
      }
    }

    return false;
  }

  /**
   * 比较两个值
   */
  protected compareValues(left: string, right: string, op: string): boolean {
    // 解析值
    const leftVal = this.parseValue(left);
    const rightVal = this.parseValue(right);

    switch (op) {
      case '===': return leftVal === rightVal;
      case '==': return leftVal == rightVal;
      case '!==': return leftVal !== rightVal;
      case '!=': return leftVal != rightVal;
      case '>': return leftVal > rightVal;
      case '<': return leftVal < rightVal;
      case '>=': return leftVal >= rightVal;
      case '<=': return leftVal <= rightVal;
      default: return false;
    }
  }

  /**
   * 解析字符串为值
   */
  protected parseValue(str: string): string | number | boolean | undefined {
    str = str.trim();
    if (str === 'undefined') return undefined;
    if (str === 'true') return true;
    if (str === 'false') return false;
    if (str.startsWith('"') && str.endsWith('"')) {
      return str.slice(1, -1).replace(/\\"/g, '"');
    }
    const num = Number(str);
    if (!isNaN(num)) return num;
    return str;
  }

  /**
   * 解析 Handoff 工具调用
   */
  protected parseHandoff(toolCall: {
    name: string;
    args: Record<string, unknown>;
  }): { target: string; message: string } | null {
    if (!toolCall.name.startsWith('transfer_to_')) {
      return null;
    }

    return {
      target: toolCall.name.replace('transfer_to_', ''),
      message: (toolCall.args.message as string) || '',
    };
  }

  /**
   * 记录日志
   */
  protected log(type: string, data: unknown): void {
    this.history.push({
      timestamp: Date.now(),
      type,
      nodeId: this.currentNodeId,
      data,
    });
  }

  /**
   * 创建执行结果
   */
  protected createResult(
    success: boolean,
    result?: string,
    error?: string
  ): ExecutionResult {
    return {
      success,
      result,
      error,
      state: this.state,
      history: this.history,
      threadId: this.threadId,
      mode: this.graph.executionMode,
    };
  }

  /**
   * 获取当前状态
   */
  getState(): GraphState {
    return { ...this.state };
  }

  /**
   * 获取执行历史
   */
  getHistory(): ExecutionLog[] {
    return [...this.history];
  }

  /**
   * 获取线程 ID
   */
  getThreadId(): string {
    return this.threadId;
  }

  // ============ 并行执行支持 ============

  /**
   * 并行执行多个目标节点（fan-out）
   * 用于从单个节点分发任务到多个并行分支
   */
  async runParallel(
    input: string,
    llmClient: LLMClient,
    targetNodes: string[],
    options?: RunOptions
  ): Promise<Map<string, ExecutionResult>> {
    const results = new Map<string, ExecutionResult>();
    const maxConcurrency = this.graph.config?.parallel?.maxConcurrency ?? 4;

    // 分批并行执行
    for (let i = 0; i < targetNodes.length; i += maxConcurrency) {
      const batch = targetNodes.slice(i, i + maxConcurrency);
      const batchResults = await Promise.all(
        batch.map(async (nodeId) => {
          const node = this.graph.nodes.get(nodeId);
          if (!node) {
            return [nodeId, {
              success: false,
              error: `Node not found: ${nodeId}`,
              state: {},
              history: [],
              threadId: '',
              mode: this.graph.executionMode,
            }] as [string, ExecutionResult];
          }

          try {
            // 为每个分支创建独立状态
            const branchState: GraphState = {
              messages: [{ role: 'user', content: input, timestamp: Date.now() }],
              currentNode: nodeId,
              context: {},
            };
            const branchHistory: ExecutionLog[] = [];

            const response = await this.executeNodeWithContext(node, llmClient, branchState, branchHistory);
            
            return [nodeId, {
              success: true,
              result: response.content,
              state: branchState,
              history: branchHistory,
              threadId: `${options?.threadId ?? 'parallel'}_${nodeId}`,
              mode: this.graph.executionMode,
            }] as [string, ExecutionResult];
          } catch (error) {
            return [nodeId, {
              success: false,
              error: error instanceof Error ? error.message : String(error),
              state: {},
              history: [],
              threadId: '',
              mode: this.graph.executionMode,
            }] as [string, ExecutionResult];
          }
        })
      );

      for (const [nodeId, result] of batchResults) {
        results.set(nodeId, result);
      }
    }

    return results;
  }

  /**
   * 汇聚多个分支的结果（fan-in）
   * 用于等待所有并行分支完成并合并结果
   */
  async fanIn(
    results: Map<string, ExecutionResult>,
    aggregatorNodeId: string,
    llmClient: LLMClient
  ): Promise<ExecutionResult> {
    const aggregatorNode = this.graph.nodes.get(aggregatorNodeId);
    if (!aggregatorNode) {
      return {
        success: false,
        error: `Aggregator node not found: ${aggregatorNodeId}`,
        state: {},
        history: [],
        threadId: '',
        mode: this.graph.executionMode,
      };
    }

    // 收集所有分支的结果
    const branchResults: string[] = [];
    for (const [nodeId, result] of results) {
      if (result.success && result.result) {
        branchResults.push(`[${nodeId}]: ${result.result}`);
      } else {
        branchResults.push(`[${nodeId}]: Failed - ${result.error}`);
      }
    }

    // 构建汇聚输入
    const fanInInput = `并行执行结果汇总：\n${branchResults.join('\n')}`;

    // 执行汇聚节点
    const aggregatedState: GraphState = {
      messages: [{ role: 'user', content: fanInInput, timestamp: Date.now() }],
      currentNode: aggregatorNodeId,
      context: { parallelResults: Object.fromEntries(results) },
    };
    const aggregatedHistory: ExecutionLog[] = [];

    try {
      const response = await this.executeNodeWithContext(aggregatorNode, llmClient, aggregatedState, aggregatedHistory);
      
      return {
        success: true,
        result: response.content,
        state: aggregatedState,
        history: aggregatedHistory,
        threadId: `fanin_${aggregatorNodeId}`,
        mode: this.graph.executionMode,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        state: aggregatedState,
        history: aggregatedHistory,
        threadId: '',
        mode: this.graph.executionMode,
      };
    }
  }

  /**
   * 检查节点是否支持并行执行
   */
  canRunParallel(nodeId: string): boolean {
    const outEdges = this.getOutEdges(nodeId);
    // 如果有多条直接边，可以并行执行
    const directEdges = outEdges.filter(e => e.type === 'direct');
    return directEdges.length > 1;
  }

  /**
   * 获取可并行执行的子节点
   */
  getParallelTargets(nodeId: string): string[] {
    const outEdges = this.getOutEdges(nodeId);
    return outEdges
      .filter(e => e.type === 'direct' && e.target !== END_NODE)
      .map(e => e.target);
  }
}