/**
 * LangGraph 适配器
 * 
 * 将 SecureBot 的图配置转换为 LangGraph StateGraph
 * 支持持久化、中断、恢复等高级特性
 */

import {
  AgentGraph,
  AgentNode,
  GraphEdge,
  GraphState,
  GraphMessage,
  GraphConfig,
  StateSchema,
  StateField,
  ExecutionResult,
  ExecutionLog,
  END_NODE,
} from './types';
import { Graph } from './graph';
import { HumanInteractionManager } from './hitl-manager.js';
import { HitlConfig, HitlLevel, AgentHitlConfig } from './hitl-types.js';

/**
 * LangGraph 类型定义（可选依赖）
 * 
 * 当用户安装 @langchain/langgraph 时，这些类型可用
 */
export interface LangGraphModule {
  StateGraph: any;
  END: string;
  START: string;
  MemorySaver?: any;
}

/**
 * LangGraph 适配器配置
 */
export interface LangGraphAdapterConfig {
  /** LangGraph 模块（可选，动态加载） */
  langgraph?: LangGraphModule;
  /** 检查点存储类型 */
  checkpointerType?: 'memory' | 'sqlite' | 'postgres' | 'custom';
  /** 检查点存储路径 */
  checkpointerPath?: string;
  /** 自定义检查点存储 */
  customCheckpointer?: any;
  /** 中断前回调 */
  onInterrupt?: (nodeId: string, state: GraphState) => Promise<void>;
}

/**
 * 编译后的 LangGraph 应用
 */
export interface CompiledLangGraphApp {
  invoke: (input: any, config?: any) => Promise<any>;
  stream: (input: any, config?: any) => AsyncIterable<any>;
  getState: (config: any) => Promise<any>;
  updateState: (config: any, values: any) => Promise<void>;
}

/**
 * LangGraph 适配器
 */
export class LangGraphAdapter {
  private graph: AgentGraph;
  private config: LangGraphAdapterConfig;
  private langgraphModule: LangGraphModule | null = null;
  private compiledApp: CompiledLangGraphApp | null = null;
  private hitlManager?: HumanInteractionManager;
  private hitlConfig?: HitlConfig;

  constructor(graph: Graph | AgentGraph, config: LangGraphAdapterConfig = {}) {
    this.graph = graph instanceof Graph ? graph.getRaw() : graph;
    this.config = config;
  }

  /**
   * 设置人在回路管理器
   */
  setHitl(manager: HumanInteractionManager, config: HitlConfig): this {
    this.hitlManager = manager;
    this.hitlConfig = config;
    return this;
  }

  /**
   * 检查 LangGraph 是否可用
   */
  async isLangGraphAvailable(): Promise<boolean> {
    try {
      const module = await this.loadLangGraph();
      return module !== null;
    } catch {
      return false;
    }
  }

  /**
   * 加载 LangGraph 模块
   */
  private async loadLangGraph(): Promise<LangGraphModule | null> {
    if (this.langgraphModule) {
      return this.langgraphModule;
    }

    if (this.config.langgraph) {
      this.langgraphModule = this.config.langgraph;
      return this.langgraphModule;
    }

    try {
      // 尝试动态加载 @langchain/langgraph
      const module = await import('@langchain/langgraph');
      this.langgraphModule = {
        StateGraph: module.StateGraph,
        END: module.END,
        START: module.START,
        MemorySaver: module.MemorySaver,
      };
      return this.langgraphModule;
    } catch {
      return null;
    }
  }

  /**
   * 构建 StateGraph
   */
  async buildStateGraph(): Promise<any> {
    const lg = await this.loadLangGraph();
    if (!lg) {
      throw new Error('LangGraph not available. Install @langchain/langgraph');
    }

    // 构建 State Schema
    const stateSchema = this.buildStateSchema();

    // 创建 StateGraph
    const stateGraph = new lg.StateGraph(stateSchema);

    // 添加节点
    for (const [nodeId, node] of this.graph.nodes) {
      const nodeFn = this.buildNodeFunction(node);
      stateGraph.addNode(nodeId, nodeFn);
    }

    // 设置入口点
    stateGraph.setEntryPoint(this.graph.entryPoint);

    // 添加边
    this.addEdgesToGraph(stateGraph);

    return stateGraph;
  }

  /**
   * 构建 State Schema
   */
  private buildStateSchema(): Record<string, any> {
    const schema = this.graph.config?.stateSchema;
    const channels: Record<string, any> = {
      // 默认字段
      messages: {
        value: (x: GraphMessage[], y: GraphMessage[]) => x.concat(y),
        default: () => [],
      },
      currentNode: {
        value: (x: string, y: string) => y ?? x,
        default: () => '',
      },
      context: {
        value: (x: any, y: any) => ({ ...x, ...y }),
        default: () => ({}),
      },
    };

    // 添加自定义字段
    if (schema?.fields) {
      for (const [fieldName, field] of Object.entries(schema.fields)) {
        channels[fieldName] = this.buildFieldChannel(field);
      }
    }

    return { channels };
  }

  /**
   * 构建字段通道
   */
  private buildFieldChannel(field: StateField): any {
    const reducers: Record<string, (x: any, y: any) => any> = {
      append: (x, y) => Array.isArray(x) ? [...x, y] : [x, y],
      replace: (x, y) => y ?? x,
      merge: (x, y) => ({ ...x, ...y }),
      last: (x, y) => y ?? x,
    };

    return {
      value: reducers[field.reducer || 'last'],
      default: () => field.default,
    };
  }

  /**
   * 构建节点函数
   */
  private buildNodeFunction(node: AgentNode): (state: any) => Promise<any> {
    return async (state: any) => {
      // 构建系统提示
      const systemPrompt = typeof node.systemPrompt === 'function'
        ? node.systemPrompt({ state, message: '' })
        : node.systemPrompt;

      // 构建上下文
      const context: any = {
        nodeId: node.id,
        nodeName: node.name,
        role: node.role,
        systemPrompt,
        state,
      };

      // 返回状态更新（由执行器填充实际内容）
      return {
        currentNode: node.id,
        _context: context,
      };
    };
  }

  /**
   * 添加边到图
   */
  private addEdgesToGraph(stateGraph: any): void {
    const lg = this.langgraphModule;
    if (!lg) return;

    // 按源节点分组边
    const edgesBySource = new Map<string, GraphEdge[]>();
    for (const edge of this.graph.edges) {
      if (!edgesBySource.has(edge.source)) {
        edgesBySource.set(edge.source, []);
      }
      edgesBySource.get(edge.source)!.push(edge);
    }

    // 添加边
    for (const [source, edges] of edgesBySource) {
      const conditionalEdges = edges.filter((e) => e.type === 'conditional');
      const directEdges = edges.filter((e) => e.type === 'direct');

      // 条件边
      if (conditionalEdges.length > 0) {
        const conditionFn = this.buildConditionFunction(conditionalEdges);
        const pathMap = this.buildPathMap(conditionalEdges);
        stateGraph.addConditionalEdges(source, conditionFn, pathMap);
      }

      // 直接边（只取第一个）
      if (directEdges.length > 0 && conditionalEdges.length === 0) {
        const edge = directEdges[0];
        if (edge.target === END_NODE) {
          stateGraph.addEdge(source, lg.END);
        } else {
          stateGraph.addEdge(source, edge.target);
        }
      }
    }
  }

  /**
   * 构建条件函数
   */
  private buildConditionFunction(edges: GraphEdge[]): (state: any) => string {
    return (state: any) => {
      // 检查上下文中的 handoff 目标
      if (state._handoffTarget) {
        return state._handoffTarget;
      }

      // 检查最后消息中的关键词
      const lastMessage = state.messages?.[state.messages.length - 1];
      if (lastMessage?.content) {
        for (const edge of edges) {
          if (edge.condition?.keywords) {
            const matched = edge.condition.keywords.some((kw) =>
              lastMessage.content.includes(kw)
            );
            if (matched) {
              return edge.target;
            }
          }
        }
      }

      // 检查条件表达式（使用安全解析）
      for (const edge of edges) {
        if (edge.condition?.expression) {
          // 安全解析：不使用 new Function()
          const result = this.evaluateConditionExpression(edge.condition.expression, state);
          if (result) {
            return edge.target;
          }
        }
      }

      // 返回默认边
      const defaultEdge = edges.find((e) => e.metadata?.isDefault);
      return defaultEdge?.target || END_NODE;
    };
  }

  /**
   * 构建路径映射
   */
  private buildPathMap(edges: GraphEdge[]): Record<string, string> {
    const lg = this.langgraphModule;
    const pathMap: Record<string, string> = {};

    for (const edge of edges) {
      pathMap[edge.target] = edge.target === END_NODE ? lg.END : edge.target;
    }
    pathMap[END_NODE] = lg.END;

    return pathMap;
  }

  /**
   * 创建检查点存储
   */
  private async createCheckpointer(): Promise<any> {
    const lg = this.langgraphModule;
    if (!lg) return null;

    const checkpointerConfig = this.graph.config?.checkpointer;

    if (!checkpointerConfig) {
      // 默认使用内存存储
      return new lg.MemorySaver();
    }

    switch (checkpointerConfig.type) {
      case 'memory':
        return new lg.MemorySaver();

      case 'sqlite':
        // 需要安装 @langchain/langgraph-checkpoint-sqlite
        try {
          const { SqliteSaver } = await import('@langchain/langgraph-checkpoint-sqlite');
          return SqliteSaver.fromConnString(checkpointerConfig.path || ':memory:');
        } catch {
          console.warn('SQLite checkpointer not available, using memory');
          return new lg.MemorySaver();
        }

      case 'postgres':
        // 需要安装 @langchain/langgraph-checkpoint-postgres
        try {
          const { PostgresSaver } = await import('@langchain/langgraph-checkpoint-postgres');
          return PostgresSaver.fromConnString(checkpointerConfig.path);
        } catch {
          console.warn('Postgres checkpointer not available, using memory');
          return new lg.MemorySaver();
        }

      case 'custom':
        return this.config.customCheckpointer;

      default:
        return new lg.MemorySaver();
    }
  }

  /**
   * 编译图
   */
  async compile(): Promise<CompiledLangGraphApp> {
    if (this.compiledApp) {
      return this.compiledApp;
    }

    const stateGraph = await this.buildStateGraph();
    const checkpointer = await this.createCheckpointer();

    // 构建编译配置
    const compileConfig: any = {
      checkpointer,
    };

    // 中断配置
    if (this.graph.config?.interrupts) {
      if (this.graph.config.interrupts.before) {
        compileConfig.interruptBefore = this.graph.config.interrupts.before;
      }
      if (this.graph.config.interrupts.after) {
        compileConfig.interruptAfter = this.graph.config.interrupts.after;
      }
    }

    // HITL 中断配置
    if (this.hitlConfig && this.hitlConfig.level !== HitlLevel.FULL_AUTO) {
      const nodes = Array.from(this.graph.nodes.keys());
      if (this.hitlConfig.level === HitlLevel.STEP_THROUGH) {
        compileConfig.interruptBefore = nodes;
      } else if (this.hitlConfig.interruptNodes?.length) {
        compileConfig.interruptBefore = this.hitlConfig.interruptNodes;
      }
      // interruptAfter from agentConfig
      const after: string[] = [];
      if (this.hitlConfig.agentConfig) {
        for (const [nid, cfg] of Object.entries(this.hitlConfig.agentConfig)) {
          if ((cfg as AgentHitlConfig).interruptAfter) after.push(nid);
        }
      }
      if (after.length) compileConfig.interruptAfter = after;
    }

    // 编译
    this.compiledApp = stateGraph.compile(compileConfig);

    return this.compiledApp;
  }

  /**
   * 运行图
   */
  async run(
    input: string,
    threadId?: string
  ): Promise<ExecutionResult> {
    const app = await this.compile();

    const initialState = {
      messages: [{ role: 'user', content: input, timestamp: Date.now() }],
      currentNode: this.graph.entryPoint,
      context: {},
    };

    const config = {
      configurable: {
        thread_id: threadId || `thread_${Date.now()}`,
      },
    };

    try {
      const result = await app.invoke(initialState, config);

      const lastMessage = result.messages?.[result.messages.length - 1];

      return {
        success: true,
        result: lastMessage?.content || 'Completed',
        state: result,
        history: [],
        threadId: config.configurable.thread_id,
        mode: 'langgraph',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        state: initialState,
        history: [],
        mode: 'langgraph',
      };
    }
  }

  /**
   * 流式运行
   */
  async *stream(
    input: string,
    threadId?: string
  ): AsyncGenerator<{ type: string; data: any }> {
    const app = await this.compile();

    const initialState = {
      messages: [{ role: 'user', content: input, timestamp: Date.now() }],
      currentNode: this.graph.entryPoint,
      context: {},
    };

    const config = {
      configurable: {
        thread_id: threadId || `thread_${Date.now()}`,
      },
    };

    try {
      for await (const event of app.stream(initialState, config)) {
        yield {
          type: 'event',
          data: event,
        };
      }
    } catch (error: any) {
      yield {
        type: 'error',
        data: { error: error.message },
      };
    }
  }

  /**
   * 获取状态
   */
  async getState(threadId: string): Promise<any> {
    const app = await this.compile();
    return app.getState({
      configurable: { thread_id: threadId },
    });
  }

  /**
   * 更新状态
   */
  async updateState(threadId: string, values: any): Promise<void> {
    const app = await this.compile();
    await app.updateState(
      { configurable: { thread_id: threadId } },
      values
    );
  }

  /**
   * 恢复执行
   */
  async resume(threadId: string, input?: any): Promise<ExecutionResult> {
    const app = await this.compile();

    const config = {
      configurable: { thread_id: threadId },
    };

    // 如果有输入，更新状态
    if (input) {
      await app.updateState(config, input);
    }

    try {
      // 继续执行（传入 null 表示从当前状态继续）
      const result = await app.invoke(null, config);

      const lastMessage = result.messages?.[result.messages.length - 1];

      return {
        success: true,
        result: lastMessage?.content || 'Completed',
        state: result,
        history: [],
        threadId,
        mode: 'langgraph',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        state: {},
        history: [],
        threadId,
        mode: 'langgraph',
      };
    }
  }

  /**
   * 编辑状态（LangGraph 原生 update_state 支持）
   */
  async editState(threadId: string, values: any): Promise<GraphState> {
    const app = await this.compile();
    const config = { configurable: { thread_id: threadId } };
    await app.updateState(config, values);
    const state = await app.getState(config);
    return state.values;
  }

  /**
   * 安全表达式解析器
   * 复用与 executor.ts 相同的安全逻辑
   */
  private evaluateConditionExpression(expression: string, state: any): boolean {
    // 白名单验证：只允许安全的表达式模式
    const safePattern = /^[\w\s.]+\s*(===|==|!==|!=|>|<|>=|<=|&&|\|\|)\s*[\w\s.'"]+$|^[\w\s.]+\s*(===|==|!==|!=|>|<|>=|<=|&&|\|\|)\s*[\w\s.'"]+\s*(&&|\|\|)\s*[\w\s.]+\s*(===|==|!==|!=|>|<|>=|<=)\s*[\w\s.'"]+$/;
    
    if (!safePattern.test(expression)) {
      return false;
    }

    try {
      // 替换 state.property 为实际值
      const sanitizedExpr = expression
        .replace(/state\.(\w+)/g, (_, prop) => {
          const value = state[prop];
          if (value === undefined) return 'undefined';
          if (typeof value === 'string') return `"${value.replace(/"/g, '\\"')}"`;
          if (typeof value === 'number') return String(value);
          if (typeof value === 'boolean') return String(value);
          return 'undefined';
        });

      // 直接解析而非 eval
      return this.parseSimpleExpression(sanitizedExpr);
    } catch {
      return false;
    }
  }

  /**
   * 解析简单比较表达式
   */
  private parseSimpleExpression(expr: string): boolean {
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
  private compareValues(left: string, right: string, op: string): boolean {
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
  private parseValue(str: string): string | number | boolean | undefined {
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
}