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
} from './types';
import { Graph } from './graph';
import type { AgentEvent } from '../monitoring/types';

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
   * 执行图
   */
  async run(input: string, llmClient: LLMClient): Promise<ExecutionResult> {
    // 添加用户消息
    this.state.messages.push({
      role: 'user',
      content: input,
      timestamp: Date.now(),
    });

    // 记录开始
    this.log('workflow_start', { input });

    // 发射工作流开始事件
    this.emitEvent({
      type: 'workflow_start',
      graphId: this.graphId,
      threadId: this.threadId,
      input,
      timestamp: Date.now(),
    });

    let iterations = 0;
    const maxIterations = 50;

    while (iterations < maxIterations) {
      iterations++;

      // 获取当前节点
      const node = this.graph.nodes.get(this.currentNodeId);
      if (!node) {
        throw new Error(`Node not found: ${this.currentNodeId}`);
      }

      // 记录进入节点
      this.log('node_enter', { nodeId: this.currentNodeId, nodeName: node.name });

      // 发射节点进入事件
      this.emitEvent({
        type: 'node_enter',
        nodeId: this.currentNodeId,
        nodeName: node.name,
        timestamp: Date.now(),
      });

      // 执行节点
      const startTime = Date.now();
      const response = await this.executeNode(node, llmClient);
      const duration = Date.now() - startTime;

      // 处理响应
      if (response.type === 'result') {
        // 发射节点完成事件
        this.emitEvent({
          type: 'node_exit',
          nodeId: this.currentNodeId,
          result: response.content,
          duration,
          timestamp: Date.now(),
        });

        // 任务完成
        this.log('workflow_complete', { result: response.content });

        // 发射工作流完成事件
        this.emitEvent({
          type: 'workflow_complete',
          graphId: this.graphId,
          threadId: this.threadId,
          result: response.content,
          timestamp: Date.now(),
        });

        return this.createResult(true, response.content);
      }

      // 发射节点完成事件
      this.emitEvent({
        type: 'node_exit',
        nodeId: this.currentNodeId,
        result: response.content,
        duration,
        timestamp: Date.now(),
      });

      // 查找下一个节点
      const nextNodeId = this.findNextNode(response);
      
      if (!nextNodeId || nextNodeId === END_NODE) {
        // 结束
        this.log('workflow_complete', { reason: 'end_node' });

        // 发射工作流完成事件
        this.emitEvent({
          type: 'workflow_complete',
          graphId: this.graphId,
          threadId: this.threadId,
          result: response.content,
          timestamp: Date.now(),
        });

        return this.createResult(true, response.content);
      }

      // 发射 Handoff 事件
      if (response.type === 'handoff') {
        this.emitEvent({
          type: 'handoff',
          from: this.currentNodeId,
          to: nextNodeId,
          message: response.message,
          timestamp: Date.now(),
        });
      }

      // 切换到下一个节点
      this.log('node_switch', { from: this.currentNodeId, to: nextNodeId });
      this.currentNodeId = nextNodeId;
      this.state.currentNode = nextNodeId;
    }

    // 超过最大迭代次数
    this.log('workflow_timeout', { iterations });

    // 发射工作流完成事件（错误）
    this.emitEvent({
      type: 'workflow_complete',
      graphId: this.graphId,
      threadId: this.threadId,
      error: 'Max iterations reached',
      timestamp: Date.now(),
    });

    return this.createResult(false, undefined, 'Max iterations reached');
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

    // 调用 LLM
    this.log('llm_call', { nodeId: node.id, toolCount: handoffTools.length });

    const response = await llmClient.chat({
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

    // 表达式判断
    if (expression) {
      try {
        const fn = new Function('state', `return ${expression}`);
        return fn(this.state);
      } catch (error) {
        this.log('condition_error', { expression, error: String(error) });
        return false;
      }
    }

    return true;
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
}