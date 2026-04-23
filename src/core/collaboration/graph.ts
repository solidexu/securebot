/**
 * Agent 图结构
 * 
 * 提供图的基础操作：添加/删除节点、边等
 */

import {
  AgentGraph,
  AgentNode,
  GraphEdge,
  EdgeCondition,
  EdgeMetadata,
  ExecutionMode,
  GraphConfig,
  END_NODE,
} from './types';
import { HitlConfig } from './hitl-types';

/**
 * 图结构类
 */
export class Graph {
  private graph: AgentGraph;

  constructor(id: string, name: string) {
    this.graph = {
      id,
      name,
      nodes: new Map(),
      edges: [],
      entryPoint: '',
      executionMode: 'lightweight',
      allowCycles: false,
      maxIterations: 100,
    };
  }

  /**
   * 获取图 ID
   */
  getId(): string {
    return this.graph.id;
  }

  /**
   * 获取图名称
   */
  getName(): string {
    return this.graph.name;
  }

  /**
   * 设置执行模式
   */
  setExecutionMode(mode: ExecutionMode): this {
    this.graph.executionMode = mode;
    return this;
  }

  /**
   * 获取执行模式
   */
  getExecutionMode(): ExecutionMode {
    return this.graph.executionMode;
  }

  /**
   * 设置入口点
   */
  setEntryPoint(nodeId: string): this {
    if (!this.graph.nodes.has(nodeId)) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    this.graph.entryPoint = nodeId;
    return this;
  }

  /**
   * 获取入口点
   */
  getEntryPoint(): string {
    return this.graph.entryPoint;
  }

  /**
   * 设置配置
   */
  setConfig(config: GraphConfig): this {
    this.graph.config = config;
    return this;
  }

  /**
   * 获取配置
   */
  getConfig(): GraphConfig | undefined {
    return this.graph.config;
  }

  /**
   * 设置是否允许循环
   */
  setAllowCycles(allow: boolean): this {
    this.graph.allowCycles = allow;
    return this;
  }

  /**
   * 获取是否允许循环
   */
  getAllowCycles(): boolean {
    return this.graph.allowCycles || false;
  }

  /**
   * 设置人在回路配置
   */
  setHitlConfig(config: HitlConfig): this {
    this.graph.hitlConfig = config;
    return this;
  }

  /**
   * 设置最大迭代次数
   */
  setMaxIterations(max: number): this {
    this.graph.maxIterations = max;
    return this;
  }

  /**
   * 获取最大迭代次数
   */
  getMaxIterations(): number {
    return this.graph.maxIterations || 100;
  }

  // ============ 节点操作 ============

  /**
   * 添加节点
   */
  addNode(node: AgentNode): this {
    if (this.graph.nodes.has(node.id)) {
      throw new Error(`Node already exists: ${node.id}`);
    }
    this.graph.nodes.set(node.id, node);
    return this;
  }

  /**
   * 批量添加节点
   */
  addNodes(nodes: AgentNode[]): this {
    for (const node of nodes) {
      this.addNode(node);
    }
    return this;
  }

  /**
   * 获取节点
   */
  getNode(id: string): AgentNode | undefined {
    return this.graph.nodes.get(id);
  }

  /**
   * 获取所有节点
   */
  getNodes(): Map<string, AgentNode> {
    return this.graph.nodes;
  }

  /**
   * 删除节点
   */
  removeNode(nodeId: string): this {
    if (!this.graph.nodes.has(nodeId)) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    // 删除节点
    this.graph.nodes.delete(nodeId);

    // 删除相关边
    this.graph.edges = this.graph.edges.filter(
      (edge) => edge.source !== nodeId && edge.target !== nodeId
    );

    // 更新入口点
    if (this.graph.entryPoint === nodeId) {
      this.graph.entryPoint = '';
    }

    return this;
  }

  /**
   * 更新节点
   */
  updateNode(nodeId: string, updates: Partial<AgentNode>): this {
    const node = this.graph.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    this.graph.nodes.set(nodeId, { ...node, ...updates });
    return this;
  }

  // ============ 边操作 ============

  /**
   * 添加直接边
   */
  addDirectEdge(
    source: string,
    target: string,
    metadata?: EdgeMetadata
  ): this {
    this.validateNodes(source, target);
    
    const edge: GraphEdge = {
      id: `edge_${source}_${target}_${crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now()}`,
      source,
      target,
      type: 'direct',
      metadata,
    };
    
    this.graph.edges.push(edge);
    return this;
  }

  /**
   * 添加条件边
   */
  addConditionalEdge(
    source: string,
    target: string,
    condition: EdgeCondition,
    metadata?: EdgeMetadata
  ): this {
    this.validateNodes(source, target);
    
    const edge: GraphEdge = {
      id: `edge_${source}_${target}_${crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now()}`,
      source,
      target,
      type: 'conditional',
      condition,
      metadata,
    };
    
    this.graph.edges.push(edge);
    return this;
  }

  /**
   * 批量添加条件边
   */
  addConditionalEdges(
    source: string,
    routes: Array<{
      target: string;
      condition: EdgeCondition;
      metadata?: EdgeMetadata;
    }>
  ): this {
    for (const route of routes) {
      this.addConditionalEdge(source, route.target, route.condition, route.metadata);
    }
    return this;
  }

  /**
   * 获取节点的出边
   */
  getOutEdges(nodeId: string): GraphEdge[] {
    return this.graph.edges.filter((edge) => edge.source === nodeId);
  }

  /**
   * 获取节点的入边
   */
  getInEdges(nodeId: string): GraphEdge[] {
    return this.graph.edges.filter((edge) => edge.target === nodeId);
  }

  /**
   * 获取所有边
   */
  getEdges(): GraphEdge[] {
    return this.graph.edges;
  }

  /**
   * 删除边
   */
  removeEdge(edgeId: string): this {
    this.graph.edges = this.graph.edges.filter((edge) => edge.id !== edgeId);
    return this;
  }

  // ============ 查询操作 ============

  /**
   * 获取节点关系
   */
  getNodeRelations(nodeId: string): {
    incoming: GraphEdge[];
    outgoing: GraphEdge[];
  } {
    return {
      incoming: this.getInEdges(nodeId),
      outgoing: this.getOutEdges(nodeId),
    };
  }

  /**
   * 获取可达节点
   */
  getReachableNodes(nodeId: string): string[] {
    const visited = new Set<string>();
    const queue: string[] = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const outEdges = this.getOutEdges(current);
      for (const edge of outEdges) {
        if (!visited.has(edge.target)) {
          queue.push(edge.target);
        }
      }
    }

    return Array.from(visited);
  }

  /**
   * 检查图是否有效
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 检查入口点
    if (!this.graph.entryPoint) {
      errors.push('Entry point not set');
    } else if (!this.graph.nodes.has(this.graph.entryPoint)) {
      errors.push(`Entry point node not found: ${this.graph.entryPoint}`);
    }

    // 检查节点
    if (this.graph.nodes.size === 0) {
      errors.push('No nodes in graph');
    }

    // 检查边的节点是否存在
    for (const edge of this.graph.edges) {
      if (!this.graph.nodes.has(edge.source)) {
        errors.push(`Edge source node not found: ${edge.source}`);
      }
      if (!this.graph.nodes.has(edge.target) && edge.target !== END_NODE) {
        errors.push(`Edge target node not found: ${edge.target}`);
      }
    }

    // 检测循环（环）
    if (!this.graph.allowCycles) {
      const cycleError = this.detectCycles();
      if (cycleError) {
        errors.push(cycleError);
      }
    }

    // 检查孤立节点（不可达）
    const unreachable = this.findUnreachableNodes();
    if (unreachable.length > 0) {
      errors.push(`Unreachable nodes found: ${unreachable.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 检测图中的循环（使用 DFS）
   */
  private detectCycles(): string | null {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        // 发现环，记录路径
        const cycleStart = path.indexOf(nodeId);
        const cyclePath = [...path.slice(cycleStart), nodeId].join(' → ');
        return true;
      }
      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const outEdges = this.getOutEdges(nodeId);
      for (const edge of outEdges) {
        if (edge.target !== END_NODE && dfs(edge.target)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      path.pop();
      return false;
    };

    // 从入口点开始检测
    if (this.graph.entryPoint) {
      if (dfs(this.graph.entryPoint)) {
        return 'Cycle detected in graph (may cause infinite loop)';
      }
    }

    return null;
  }

  /**
   * 查找不可达节点
   */
  private findUnreachableNodes(): string[] {
    if (!this.graph.entryPoint) {
      return Array.from(this.graph.nodes.keys());
    }

    const reachable = new Set(this.getReachableNodes(this.graph.entryPoint));
    const unreachable: string[] = [];

    for (const [nodeId] of this.graph.nodes) {
      if (!reachable.has(nodeId)) {
        unreachable.push(nodeId);
      }
    }

    return unreachable;
  }

  // ============ 导出操作 ============

  /**
   * 导出为 JSON
   */
  toJSON(): object {
    return {
      id: this.graph.id,
      name: this.graph.name,
      executionMode: this.graph.executionMode,
      entryPoint: this.graph.entryPoint,
      nodes: Array.from(this.graph.nodes.entries()).map(([id, node]) => ({
        id,
        ...node,
        systemPrompt:
          typeof node.systemPrompt === 'function'
            ? '[Function]'
            : node.systemPrompt,
      })),
      edges: this.graph.edges,
      config: this.graph.config,
    };
  }

  /**
   * 导出为 DOT 格式（可视化）
   */
  toDot(): string {
    const lines: string[] = [
      'digraph {',
      '  rankdir=LR;',
      '  node [shape=box];',
    ];

    // 节点
    for (const [id, node] of this.graph.nodes) {
      const label = `${node.name}\\n${node.role}`;
      lines.push(`  "${id}" [label="${label}"];`);
    }

    // 结束节点
    lines.push(`  "${END_NODE}" [label="END" shape=ellipse];`);

    // 边
    for (const edge of this.graph.edges) {
      const label = edge.metadata?.label || '';
      const style = edge.type === 'conditional' ? 'dashed' : 'solid';
      lines.push(
        `  "${edge.source}" -> "${edge.target}" [label="${label}" style=${style}];`
      );
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * 获取原始图数据
   */
  getRaw(): AgentGraph {
    return this.graph;
  }

  // ============ 私有方法 ============

  private validateNodes(source: string, target: string): void {
    if (!this.graph.nodes.has(source)) {
      throw new Error(`Source node not found: ${source}`);
    }
    if (!this.graph.nodes.has(target) && target !== END_NODE) {
      throw new Error(`Target node not found: ${target}`);
    }
  }
}