/**
 * Graph Tool
 * 
 * 供 Agent 内部调用的图操作工具
 */

import {
  loadFromYaml,
  loadFromFile,
  Graph,
  GraphBuilder,
  GraphExecutor,
  UnifiedOrchestrator,
  createOrchestrator,
  createNode,
  keywordsCondition,
  ExecutionResult,
  AgentNode,
} from '../core/collaboration';
import { HeartbeatManager, HeartbeatClient, createLocalHeartbeatClient } from '../core/heartbeat';
import { EventBroadcaster, MetricsCollector, AlertSystem } from '../core/monitoring';

/**
 * 图工具配置
 */
export interface GraphToolConfig {
  /** 心跳管理器 */
  heartbeatManager?: HeartbeatManager;
  /** 事件广播器 */
  broadcaster?: EventBroadcaster;
  /** 指标收集器 */
  collector?: MetricsCollector;
  /** 告警系统 */
  alertSystem?: AlertSystem;
  /** LLM 客户端 */
  llmClient?: any;
}

/**
 * 图工具
 */
export class GraphTool {
  private heartbeatManager: HeartbeatManager;
  private broadcaster: EventBroadcaster;
  private collector: MetricsCollector;
  private alertSystem: AlertSystem;
  private llmClient: any;
  private graphs: Map<string, Graph> = new Map();
  private orchestrators: Map<string, UnifiedOrchestrator> = new Map();
  private heartbeatClients: Map<string, HeartbeatClient> = new Map();

  constructor(config: GraphToolConfig = {}) {
    this.heartbeatManager = config.heartbeatManager || new HeartbeatManager();
    this.broadcaster = config.broadcaster || new EventBroadcaster();
    this.collector = config.collector || new MetricsCollector();
    this.alertSystem = config.alertSystem || new AlertSystem();
    this.llmClient = config.llmClient || this.createDefaultLLMClient();

    // 启动心跳管理器
    this.heartbeatManager.start();
  }

  /**
   * 创建默认 LLM 客户端
   */
  private createDefaultLLMClient(): any {
    return {
      chat: async (params: any) => ({
        content: `Response for: ${params.messages[params.messages.length - 1]?.content || 'input'}`,
      }),
    };
  }

  /**
   * 加载图
   */
  async loadGraph(source: string): Promise<string> {
    let graph: Graph;

    // 判断是文件路径还是 YAML 内容
    if (source.includes('\n') || source.includes(':')) {
      // YAML 内容
      graph = loadFromYaml(source);
    } else {
      // 文件路径
      graph = await loadFromFile(source);
    }

    const graphId = graph.getId();
    this.graphs.set(graphId, graph);

    // 注册所有 Agent 到心跳管理器
    for (const [nodeId] of graph.getNodes()) {
      this.heartbeatManager.registerAgent(nodeId);
    }

    return graphId;
  }

  /**
   * 创建图
   */
  createGraph(
    id: string,
    name: string,
    agents: Array<{ id: string; name: string; role: string; systemPrompt: string }>,
    edges: Array<{ source: string; target: string; type: 'direct' | 'conditional'; keywords?: string[] }>,
    entry: string
  ): string {
    const builder = new GraphBuilder(id, name);

    // 添加节点
    for (const agent of agents) {
      builder.addAgent(createNode(
        agent.id,
        agent.name,
        agent.role,
        agent.systemPrompt
      ));
    }

    // 设置入口
    builder.entry(entry);

    // 添加边
    for (const edge of edges) {
      if (edge.type === 'direct') {
        builder.addDirectEdge(edge.source, edge.target);
      } else {
        builder.addConditionalEdge(
          edge.source,
          edge.target,
          edge.keywords ? keywordsCondition(...edge.keywords) : {}
        );
      }
    }

    const graph = builder.build();
    this.graphs.set(id, graph);

    // 注册心跳
    for (const [nodeId] of graph.getNodes()) {
      this.heartbeatManager.registerAgent(nodeId);
    }

    return id;
  }

  /**
   * 运行图
   */
  async runGraph(
    graphId: string,
    input: string,
    options?: {
      threadId?: string;
      agentId?: string;
    }
  ): Promise<ExecutionResult> {
    const graph = this.graphs.get(graphId);
    if (!graph) {
      throw new Error(`Graph not found: ${graphId}`);
    }

    // 创建或获取协调器
    let orchestrator = this.orchestrators.get(graphId);
    if (!orchestrator) {
      orchestrator = createOrchestrator(graph, this.llmClient);
      this.orchestrators.set(graphId, orchestrator);
    }

    // 如果指定了 agentId，创建心跳客户端
    if (options?.agentId) {
      const heartbeatClient = createLocalHeartbeatClient(
        options.agentId,
        this.heartbeatManager
      );
      heartbeatClient.start();
      this.heartbeatClients.set(options.agentId, heartbeatClient);
    }

    // 运行
    const result = await orchestrator.run(input, {
      threadId: options?.threadId,
      onEvent: (event) => {
        // 记录指标
        this.collector.recordEvent(event as any);
        
        // 检查告警
        this.alertSystem.checkEvent(event as any);
        
        // 广播事件
        const threadId = (event as any).threadId || 'default';
        this.broadcaster.broadcast(threadId, event as any);
      },
    });

    return result;
  }

  /**
   * 恢复执行
   */
  async resumeGraph(
    graphId: string,
    threadId: string,
    input?: any
  ): Promise<ExecutionResult> {
    const orchestrator = this.orchestrators.get(graphId);
    if (!orchestrator) {
      throw new Error(`Graph not found or not started: ${graphId}`);
    }

    return orchestrator.resume(threadId, input);
  }

  /**
   * 获取图
   */
  getGraph(graphId: string): Graph | undefined {
    return this.graphs.get(graphId);
  }

  /**
   * 列出所有图
   */
  listGraphs(): Array<{ id: string; name: string; mode: string }> {
    return Array.from(this.graphs.entries()).map(([id, graph]) => ({
      id,
      name: graph.getName(),
      mode: graph.getExecutionMode(),
    }));
  }

  /**
   * 获取指标
   */
  getMetrics() {
    return this.collector.export();
  }

  /**
   * 获取心跳状态
   */
  getHeartbeatStates() {
    return this.heartbeatManager.getAllAgentStates();
  }

  /**
   * 订阅事件
   */
  subscribeEvents(
    callback: (event: any) => void,
    config?: { threadId?: string; eventTypes?: string[] }
  ): string {
    return this.broadcaster.subscribe(config || {}, callback);
  }

  /**
   * 取消订阅
   */
  unsubscribe(subscriptionId: string): void {
    this.broadcaster.unsubscribe(subscriptionId);
  }

  /**
   * 关闭
   */
  close(): void {
    this.heartbeatManager.stop();
    this.broadcaster.close();
    
    // 停止所有心跳客户端
    for (const client of this.heartbeatClients.values()) {
      client.stop();
    }
  }
}

/**
 * 创建图工具实例
 */
export function createGraphTool(config?: GraphToolConfig): GraphTool {
  return new GraphTool(config);
}