/**
 * 统一协调器
 * 
 * 根据配置自动选择轻量级或 LangGraph 模式执行
 */

import {
  AgentGraph,
  ExecutionMode,
  ExecutionResult,
  GraphState,
  GraphMessage,
  LLMClient,
} from './types';
import { Graph } from './graph';
import { GraphExecutor } from './executor';
import { LangGraphAdapter, LangGraphAdapterConfig, CompiledLangGraphApp } from './langgraph-adapter';
import { HumanInteractionManager } from './hitl-manager.js';
import { HitlConfig, HumanDecision, InterruptState } from './hitl-types.js';

/**
 * 统一协调器配置
 */
export interface OrchestratorConfig {
  /** 执行模式（默认自动检测） */
  mode?: ExecutionMode;
  /** LangGraph 适配器配置 */
  langgraph?: LangGraphAdapterConfig;
  /** LLM 客户端 */
  /** HITL 配置 */
  hitl?: {
    manager: HumanInteractionManager;
    config: HitlConfig;
  };
  llmClient: LLMClient;
}

/**
 * 运行选项
 */
export interface RunOptions {
  /** 线程 ID（LangGraph 模式） */
  threadId?: string;
  /** 是否流式输出 */
  stream?: boolean;
  /** 回调函数 */
  onEvent?: (event: OrchestratorEvent) => void;
}

/**
 * 协调器事件
 */
export type OrchestratorEvent =
  | { type: 'start'; mode: ExecutionMode }
  | { type: 'node_enter'; nodeId: string; nodeName: string }
  | { type: 'node_exit'; nodeId: string; result: string }
  | { type: 'handoff'; from: string; to: string; message: string }
  | { type: 'interrupt'; nodeId: string; reason: string }
  | { type: 'complete'; result: ExecutionResult }
  | { type: 'error'; error: string };

/**
 * 统一协调器
 */
export class UnifiedOrchestrator {
  private graph: AgentGraph;
  private config: OrchestratorConfig;
  private mode: ExecutionMode;
  private lightweightExecutor: GraphExecutor | null = null;
  private langgraphAdapter: LangGraphAdapter | null = null;
  private compiledApp: CompiledLangGraphApp | null = null;
  private hitlManager: HumanInteractionManager | null = null;
  private hitlConfig: HitlConfig | null = null;

  constructor(graph: Graph | AgentGraph, config: OrchestratorConfig) {
    this.graph = graph instanceof Graph ? graph.getRaw() : graph;
    this.config = config;

    // 确定执行模式
    this.mode = this.determineMode();

    // 初始化 HITL
    if (this.config.hitl) {
      this.hitlManager = this.config.hitl.manager;
      this.hitlConfig = this.config.hitl.config;
    }
  }

  /**
   * 确定执行模式
   */
  private determineMode(): ExecutionMode {
    // 显式指定
    if (this.config.mode) {
      return this.config.mode;
    }

    // 从图配置读取
    if (this.graph.executionMode) {
      return this.graph.executionMode;
    }

    // 默认轻量级
    return 'lightweight';
  }

  /**
   * 获取执行模式
   */
  getMode(): ExecutionMode {
    return this.mode;
  }

  /**
   * 运行图
   */
  async run(input: string, options?: RunOptions): Promise<ExecutionResult> {
    const onEvent = options?.onEvent;

    // 发送开始事件
    onEvent?.({ type: 'start', mode: this.mode });

    if (this.mode === 'lightweight') {
      return this.runLightweight(input, onEvent);
    } else {
      return this.runLangGraph(input, options?.threadId, onEvent);
    }
  }

  /**
   * 轻量级模式运行
   */
  private async runLightweight(
    input: string,
    onEvent?: (event: OrchestratorEvent) => void
  ): Promise<ExecutionResult> {
    // 创建执行器
    this.lightweightExecutor = new GraphExecutor(this.graph);

    // 设置 HITL
    if (this.hitlManager && this.hitlConfig) {
      this.lightweightExecutor.setHitl(this.hitlManager, this.hitlConfig);
    }

    // 订阅事件
    if (onEvent) {
      // 执行器内部会记录日志，我们可以从结果中提取
    }

    // 执行
    const result = await this.lightweightExecutor.run(input, this.config.llmClient);

    // 发送事件
    if (onEvent) {
      for (const log of result.history) {
        this.sendEventFromLog(log, onEvent);
      }
      onEvent({ type: 'complete', result });
    }

    return result;
  }

  /**
   * LangGraph 模式运行
   */
  private async runLangGraph(
    input: string,
    threadId?: string,
    onEvent?: (event: OrchestratorEvent) => void
  ): Promise<ExecutionResult> {
    // 创建适配器
    if (!this.langgraphAdapter) {
      this.langgraphAdapter = new LangGraphAdapter(this.graph, this.config.langgraph || {});
    }

    // 检查 LangGraph 是否可用
    const available = await this.langgraphAdapter.isLangGraphAvailable();
    if (!available) {
      // 降级到轻量级模式
      console.warn('LangGraph not available, falling back to lightweight mode');
      return this.runLightweight(input, onEvent);
    }

    // 编译
    if (!this.compiledApp) {
      this.compiledApp = await this.langgraphAdapter.compile();
    }

    // 执行
    const result = await this.langgraphAdapter.run(input, threadId);

    // 发送事件
    onEvent?.({ type: 'complete', result });

    return result;
  }

  /**
   * 流式运行
   */
  async *stream(input: string, threadId?: string): AsyncGenerator<OrchestratorEvent> {
    yield { type: 'start', mode: this.mode };

    if (this.mode === 'langgraph') {
      // LangGraph 流式
      if (!this.langgraphAdapter) {
        this.langgraphAdapter = new LangGraphAdapter(this.graph, this.config.langgraph || {});
      }

      const available = await this.langgraphAdapter.isLangGraphAvailable();
      if (!available) {
        yield { type: 'error', error: 'LangGraph not available' };
        return;
      }

      try {
        for await (const event of this.langgraphAdapter.stream(input, threadId)) {
          yield {
            type: event.type as any,
            data: event.data,
          };
        }
      } catch (error: any) {
        yield { type: 'error', error: error.message };
      }
    } else {
      // 轻量级模式不支持流式，直接运行
      const result = await this.run(input, { threadId });
      yield { type: 'complete', result };
    }
  }

  /**
   * 恢复执行（仅 LangGraph 模式）
   */
  async resume(threadId: string, input?: any): Promise<ExecutionResult> {
    if (this.mode !== 'langgraph') {
      throw new Error('Resume only supported in LangGraph mode');
    }

    if (!this.langgraphAdapter) {
      this.langgraphAdapter = new LangGraphAdapter(this.graph, this.config.langgraph || {});
    }

    return this.langgraphAdapter.resume(threadId, input);
  }

  /**
   * 获取状态（仅 LangGraph 模式）
   */
  async getState(threadId: string): Promise<any> {
    if (this.mode !== 'langgraph') {
      return null;
    }

    if (!this.langgraphAdapter) {
      this.langgraphAdapter = new LangGraphAdapter(this.graph, this.config.langgraph || {});
    }

    return this.langgraphAdapter.getState(threadId);
  }

  /**
   * 更新状态（仅 LangGraph 模式）
   */
  async updateState(threadId: string, values: any): Promise<void> {
    if (this.mode !== 'langgraph') {
      throw new Error('Update state only supported in LangGraph mode');
    }

    if (!this.langgraphAdapter) {
      this.langgraphAdapter = new LangGraphAdapter(this.graph, this.config.langgraph || {});
    }

    return this.langgraphAdapter.updateState(threadId, values);
  }
  // ============ HITL 人在回路代理方法 ============

  /**
   * 提交人类决策
   */
  async submitDecision(threadId: string, decision: HumanDecision): Promise<void> {
    if (!this.hitlManager) {
      throw new Error('HITL not configured');
    }
    return this.hitlManager.submitDecision(threadId, decision);
  }

  /**
   * 获取待处理中断列表
   */
  async getPendingInterrupts(): Promise<InterruptState[]> {
    if (!this.hitlManager) return [];
    return this.hitlManager.listPendingInterrupts();
  }

  /**
   * 编辑执行状态
   */
  async editState(threadId: string, updates: Partial<GraphState>): Promise<GraphState> {
    if (!this.hitlManager) {
      throw new Error('HITL not configured');
    }
    return this.hitlManager.editState(threadId, updates);
  }

  /**
   * 获取中断状态
   */
  getInterrupt(threadId: string): InterruptState | undefined {
    if (!this.hitlManager) return undefined;
    return this.hitlManager.getInterrupt(threadId);
  }


  /**
   * 从执行日志发送事件
   */
  private sendEventFromLog(
    log: any,
    onEvent: (event: OrchestratorEvent) => void
  ): void {
    switch (log.type) {
      case 'node_enter':
        const node = this.graph.nodes.get(log.nodeId);
        onEvent({
          type: 'node_enter',
          nodeId: log.nodeId,
          nodeName: node?.name || log.nodeId,
        });
        break;

      case 'node_exit':
        onEvent({
          type: 'node_exit',
          nodeId: log.nodeId,
          result: log.data?.result || '',
        });
        break;

      case 'handoff':
        onEvent({
          type: 'handoff',
          from: log.data?.from || log.nodeId,
          to: log.data?.to || '',
          message: log.data?.message || '',
        });
        break;
    }
  }
}

/**
 * 快捷方法：创建协调器
 */
export function createOrchestrator(
  graph: Graph | AgentGraph,
  llmClient: LLMClient,
  config?: Partial<OrchestratorConfig>
): UnifiedOrchestrator {
  return new UnifiedOrchestrator(graph, {
    llmClient,
    ...config,
  });
}