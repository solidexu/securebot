/**
 * 图构建器
 * 
 * 提供流式 API 构建 Agent 关系图
 */

import {
  AgentNode,
  GraphEdge,
  EdgeCondition,
  EdgeMetadata,
  ExecutionMode,
  GraphConfig,
  END_NODE,
} from './types';
import { Graph } from './graph';

/**
 * 图构建器
 */
export class GraphBuilder {
  private graph: Graph;

  constructor(id: string, name: string) {
    this.graph = new Graph(id, name);
  }

  /**
   * 设置执行模式
   */
  mode(mode: ExecutionMode): this {
    this.graph.setExecutionMode(mode);
    return this;
  }

  /**
   * 添加 Agent 节点
   */
  addAgent(node: AgentNode): this {
    this.graph.addNode(node);
    return this;
  }

  /**
   * 批量添加 Agent 节点
   */
  addAgents(nodes: AgentNode[]): this {
    this.graph.addNodes(nodes);
    return this;
  }

  /**
   * 设置入口点
   */
  entry(agentId: string): this {
    this.graph.setEntryPoint(agentId);
    return this;
  }

  /**
   * 添加直接边（A → B）
   */
  addDirectEdge(
    source: string,
    target: string,
    metadata?: EdgeMetadata
  ): this {
    this.graph.addDirectEdge(source, target, metadata);
    return this;
  }

  /**
   * 添加条件边（A →? B）
   */
  addConditionalEdge(
    source: string,
    target: string,
    condition: EdgeCondition,
    metadata?: EdgeMetadata
  ): this {
    this.graph.addConditionalEdge(source, target, condition, metadata);
    return this;
  }

  /**
   * 添加多条条件边（从同一源节点）
   */
  addConditionalEdges(
    source: string,
    routes: Array<{
      target: string;
      condition: EdgeCondition;
      metadata?: EdgeMetadata;
    }>
  ): this {
    this.graph.addConditionalEdges(source, routes);
    return this;
  }

  /**
   * 设置配置（LangGraph 模式）
   */
  setConfig(config: GraphConfig): this {
    this.graph.setConfig(config);
    return this;
  }

  /**
   * 添加结束边
   */
  addEndEdge(source: string, metadata?: EdgeMetadata): this {
    this.graph.addDirectEdge(source, END_NODE, metadata);
    return this;
  }

  /**
   * 构建图
   */
  build(): Graph {
    const validation = this.graph.validate();
    if (!validation.valid) {
      throw new Error(`Invalid graph: ${validation.errors.join(', ')}`);
    }
    return this.graph;
  }
}

/**
 * 快捷方法：创建图构建器
 */
export function createGraph(id: string, name: string): GraphBuilder {
  return new GraphBuilder(id, name);
}

/**
 * 快捷方法：创建节点
 */
export function createNode(
  id: string,
  name: string,
  role: string,
  systemPrompt: string,
  options?: Partial<AgentNode>
): AgentNode {
  return {
    id,
    name,
    role,
    systemPrompt,
    ...options,
  };
}

/**
 * 快捷方法：创建关键词条件
 */
export function keywordsCondition(...keywords: string[]): EdgeCondition {
  return { keywords };
}

/**
 * 快捷方法：创建表达式条件
 */
export function expressionCondition(expression: string): EdgeCondition {
  return { expression };
}