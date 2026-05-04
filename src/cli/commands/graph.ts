/**
 * Graph CLI 命令
 * 
 * 管理 Agent 协作图
 */

import { Command } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  loadFromYaml,
  loadFromFile,
  validateYamlConfig,
  GraphBuilder,
  GraphExecutor,
  UnifiedOrchestrator,
  createOrchestrator,
} from '../../core/collaboration/index.js';
import { HeartbeatManager } from '../../core/heartbeat/index.js';
import { EventBroadcaster, MetricsCollector, AlertSystem, PREDEFINED_RULES } from '../../core/monitoring/index.js';

/**
 * 图管理器（全局状态）
 */
class GraphManager {
  private static instance: GraphManager;
  private graphs: Map<string, any> = new Map();
  private orchestrators: Map<string, UnifiedOrchestrator> = new Map();
  private heartbeatManager: HeartbeatManager;
  private broadcaster: EventBroadcaster;
  private collector: MetricsCollector;
  private alertSystem: AlertSystem;

  private constructor() {
    this.heartbeatManager = new HeartbeatManager();
    this.broadcaster = new EventBroadcaster();
    this.collector = new MetricsCollector();
    this.alertSystem = new AlertSystem();

    // 添加预定义告警规则
    for (const rule of PREDEFINED_RULES) {
      this.alertSystem.addRule(rule);
    }

    // 启动心跳管理器
    this.heartbeatManager.start();
  }

  static getInstance(): GraphManager {
    if (!GraphManager.instance) {
      GraphManager.instance = new GraphManager();
    }
    return GraphManager.instance;
  }

  async loadGraph(filePath: string): Promise<string> {
    const absolutePath = path.resolve(filePath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }

    // 验证 YAML
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const validation = validateYamlConfig(content);
    
    if (!validation.valid) {
      throw new Error(`Invalid YAML: ${validation.errors.join(', ')}`);
    }

    // 加载图
    const graph = await loadFromFile(absolutePath);
    const graphId = graph.getId();

    this.graphs.set(graphId, {
      graph,
      config: validation.config,
      filePath: absolutePath,
      loadedAt: Date.now(),
    });

    return graphId;
  }

  getGraph(graphId: string): any {
    return this.graphs.get(graphId);
  }

  listGraphs(): Array<{ id: string; name: string; mode: string; loadedAt: number }> {
    return Array.from(this.graphs.entries()).map(([id, data]) => ({
      id,
      name: data.graph.getName(),
      mode: data.graph.getExecutionMode(),
      loadedAt: data.loadedAt,
    }));
  }

  getHeartbeatManager(): HeartbeatManager {
    return this.heartbeatManager;
  }

  getBroadcaster(): EventBroadcaster {
    return this.broadcaster;
  }

  getCollector(): MetricsCollector {
    return this.collector;
  }

  getAlertSystem(): AlertSystem {
    return this.alertSystem;
  }
}

/**
 * 创建 LLM 客户端
 */
function createLLMClient(config?: any): any {
  // 简单的模拟客户端，实际应接入真实 LLM
  return {
    chat: async (params: any) => {
      // TODO: 接入实际 LLM
      return {
        content: `Response from LLM for: ${params.messages[params.messages.length - 1]?.content || 'input'}`,
      };
    },
  };
}

/**
 * 注册 Graph 命令
 */
export function registerGraphCommand(program: Command): void {
  const graphCmd = program.command('graph')
    .description('Manage agent collaboration graphs');

  // 加载图
  graphCmd
    .command('load <file>')
    .description('Load a graph from YAML file')
    .action(async (file: string) => {
      try {
        const manager = GraphManager.getInstance();
        const graphId = await manager.loadGraph(file);
        const graph = manager.getGraph(graphId);

        console.log(`✅ Graph loaded successfully`);
        console.log(`   ID: ${graphId}`);
        console.log(`   Name: ${graph.graph.getName()}`);
        console.log(`   Mode: ${graph.graph.getExecutionMode()}`);
        console.log(`   Agents: ${graph.graph.getNodes().size}`);
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
      }
    });

  // 列出已加载的图
  graphCmd
    .command('list')
    .description('List loaded graphs')
    .action(() => {
      const manager = GraphManager.getInstance();
      const graphs = manager.listGraphs();

      if (graphs.length === 0) {
        console.log('No graphs loaded. Use `graph load <file>` to load a graph.');
        return;
      }

      console.log('\nLoaded Graphs:');
      console.log('─'.repeat(60));
      
      for (const g of graphs) {
        const date = new Date(g.loadedAt).toLocaleString();
        console.log(`  ${g.id}`);
        console.log(`    Name: ${g.name}`);
        console.log(`    Mode: ${g.mode}`);
        console.log(`    Loaded: ${date}`);
        console.log();
      }
    });

  // 运行图
  graphCmd
    .command('run <graphId> [input]')
    .description('Run a graph with input')
    .option('-t, --thread <threadId>', 'Thread ID for LangGraph mode')
    .option('--stream', 'Enable streaming output')
    .action(async (graphId: string, input: string = '', options: any) => {
      try {
        const manager = GraphManager.getInstance();
        const graphData = manager.getGraph(graphId);

        if (!graphData) {
          console.error(`❌ Graph not found: ${graphId}`);
          console.log('Use `graph list` to see loaded graphs.');
          process.exit(1);
        }

        // 创建 LLM 客户端
        const llmClient = createLLMClient();

        // 创建协调器
        const orchestrator = createOrchestrator(graphData.graph, llmClient, {
          mode: graphData.graph.getExecutionMode(),
        });

        // 设置事件发射器
        const broadcaster = manager.getBroadcaster();
        const collector = manager.getCollector();
        const alertSystem = manager.getAlertSystem();

        // 执行器设置事件发射器
        // (如果使用 executor 直接)

        console.log(`\n🚀 Running graph: ${graphId}`);
        console.log(`   Mode: ${orchestrator.getMode()}`);
        console.log(`   Input: ${input || '(none)'}`);
        console.log('─'.repeat(60));

        // 运行
        const result = await orchestrator.run(input, {
          threadId: options.thread,
          onEvent: (event) => {
            // 收集指标
            collector.recordEvent(event as any);
            
            // 检查告警
            alertSystem.checkEvent(event as any);
            
            // 打印事件
            printEvent(event);
          },
        });

        console.log('─'.repeat(60));
        
        if (result.success) {
          console.log(`\n✅ Completed`);
          if (result.result) {
            console.log(`\nResult:\n${result.result}`);
          }
          if (result.threadId) {
            console.log(`\nThread ID: ${result.threadId}`);
          }
        } else {
          console.log(`\n❌ Failed: ${result.error}`);
        }
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
      }
    });

  // 获取状态
  graphCmd
    .command('status <graphId>')
    .description('Get graph status')
    .option('-t, --thread <threadId>', 'Thread ID')
    .action(async (graphId: string, options: any) => {
      try {
        const manager = GraphManager.getInstance();
        const graphData = manager.getGraph(graphId);

        if (!graphData) {
          console.error(`❌ Graph not found: ${graphId}`);
          process.exit(1);
        }

        const collector = manager.getCollector();

        console.log(`\n📊 Graph Status: ${graphId}`);
        console.log('─'.repeat(60));

        // 系统指标
        const systemMetrics = collector.getSystemMetrics();
        console.log('\nSystem Metrics:');
        console.log(`  Total Events: ${systemMetrics.totalEvents}`);
        console.log(`  Total Tokens: ${systemMetrics.totalTokens}`);
        console.log(`  Avg Latency: ${systemMetrics.avgLatency.toFixed(2)}ms`);
        console.log(`  Error Rate: ${(systemMetrics.errorRate * 100).toFixed(2)}%`);

        // Agent 指标
        const agentMetrics = collector.getAllAgentMetrics();
        if (agentMetrics.length > 0) {
          console.log('\nAgent Metrics:');
          for (const m of agentMetrics) {
            console.log(`  ${m.agentId}:`);
            console.log(`    Calls: ${m.callCount}`);
            console.log(`    Success: ${m.successCount}`);
            console.log(`    Errors: ${m.errorCount}`);
            console.log(`    Avg Duration: ${m.avgDuration.toFixed(2)}ms`);
          }
        }

        // 心跳状态
        const heartbeatManager = manager.getHeartbeatManager();
        const agentStates = heartbeatManager.getAllAgentStates();
        if (agentStates.length > 0) {
          console.log('\nHeartbeat Status:');
          for (const state of agentStates) {
            const status = state.status === 'online' ? '🟢' : 
                           state.status === 'busy' ? '🟡' :
                           state.status === 'offline' ? '🔴' : '⚪';
            console.log(`  ${status} ${state.agentId}: ${state.status}`);
            console.log(`     Last seen: ${new Date(state.lastSeenAt).toLocaleString()}`);
          }
        }

        // LangGraph 状态
        if (options.thread && graphData.graph.getExecutionMode() === 'langgraph') {
          console.log('\n📝 Thread State:');
          // TODO: 获取 LangGraph 状态
          console.log(`  Thread ID: ${options.thread}`);
        }

      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
      }
    });

  // 恢复执行
  graphCmd
    .command('resume <graphId>')
    .description('Resume a paused graph execution')
    .requiredOption('-t, --thread <threadId>', 'Thread ID')
    .option('-i, --input <json>', 'Input values as JSON')
    .action(async (graphId: string, options: any) => {
      try {
        const manager = GraphManager.getInstance();
        const graphData = manager.getGraph(graphId);

        if (!graphData) {
          console.error(`❌ Graph not found: ${graphId}`);
          process.exit(1);
        }

        if (graphData.graph.getExecutionMode() !== 'langgraph') {
          console.error('❌ Resume only supported in LangGraph mode');
          process.exit(1);
        }

        const llmClient = createLLMClient();
        const orchestrator = createOrchestrator(graphData.graph, llmClient, {
          mode: 'langgraph',
        });

        // 解析输入
        let inputValues: any = undefined;
        if (options.input) {
          try {
            inputValues = JSON.parse(options.input);
          } catch {
            console.error('❌ Invalid JSON input');
            process.exit(1);
          }
        }

        console.log(`\n🔄 Resuming graph: ${graphId}`);
        console.log(`   Thread: ${options.thread}`);
        console.log('─'.repeat(60));

        const result = await orchestrator.resume(options.thread, inputValues);

        console.log('─'.repeat(60));
        
        if (result.success) {
          console.log(`\n✅ Completed`);
          if (result.result) {
            console.log(`\nResult:\n${result.result}`);
          }
        } else {
          console.log(`\n❌ Failed: ${result.error}`);
        }
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
      }
    });

  // 导出指标
  graphCmd
    .command('metrics <graphId>')
    .description('Export metrics for a graph')
    .option('-o, --output <file>', 'Output file (JSON)')
    .action((graphId: string, options: any) => {
      const manager = GraphManager.getInstance();
      const collector = manager.getCollector();

      const metrics = collector.export();

      const output = JSON.stringify(metrics, null, 2);

      if (options.output) {
        fs.writeFileSync(options.output, output);
        console.log(`✅ Metrics exported to ${options.output}`);
      } else {
        console.log(output);
      }
    });

  // 显示图结构
  graphCmd
    .command('show <graphId>')
    .description('Show graph structure')
    .option('--dot', 'Output in DOT format for visualization')
    .action((graphId: string, options: any) => {
      const manager = GraphManager.getInstance();
      const graphData = manager.getGraph(graphId);

      if (!graphData) {
        console.error(`❌ Graph not found: ${graphId}`);
        process.exit(1);
      }

      if (options.dot) {
        console.log(graphData.graph.toDot());
      } else {
        console.log('\n📋 Graph Structure:');
        console.log('─'.repeat(60));
        console.log(`ID: ${graphId}`);
        console.log(`Name: ${graphData.graph.getName()}`);
        console.log(`Mode: ${graphData.graph.getExecutionMode()}`);
        console.log(`Entry: ${graphData.graph.getEntryPoint()}`);

        console.log('\nAgents:');
        for (const [id, node] of graphData.graph.getNodes()) {
          console.log(`  - ${id}: ${node.name} (${node.role})`);
        }

        console.log('\nEdges:');
        for (const edge of graphData.graph.getEdges()) {
          const type = edge.type === 'conditional' ? '?→' : '→';
          const label = edge.metadata?.label || '';
          console.log(`  ${edge.source} ${type} ${edge.target}${label ? ` (${label})` : ''}`);
        }
      }
    });
  // 注册 HITL 人在回路命令
  registerHitlCommands(graphCmd);

}

/**
 * 打印事件
 */
function printEvent(event: any): void {
  const timestamp = new Date(event.timestamp).toLocaleTimeString();
  
  switch (event.type) {
    case 'workflow_start':
      console.log(`\n[${timestamp}] 🚀 Workflow started`);
      break;
    case 'node_enter':
      console.log(`[${timestamp}] 📍 Enter: ${event.nodeName}`);
      break;
    case 'node_exit':
      console.log(`[${timestamp}] ✅ Exit: ${event.nodeId} (${event.duration}ms)`);
      break;
    case 'handoff':
      console.log(`[${timestamp}] 🔄 Handoff: ${event.from} → ${event.to}`);
      break;
    case 'workflow_complete':
      console.log(`[${timestamp}] 🏁 Workflow completed`);
      break;
    case 'node_error':
      console.log(`[${timestamp}] ❌ Error in ${event.nodeId}: ${event.error}`);
      break;
    default:
      console.log(`[${timestamp}] ${event.type}`);
  }
}
// ============ HITL 人在回路命令 ============

import {
  HumanInteractionManager,
  MemoryInterruptStore,
  HitlLevel,
} from '../../core/collaboration/index.js';
import { HitlCli, formatPendingInterrupts } from '../hitl-interaction.js';

/**
 * 全局 HITL 管理器（单例）
 */
let globalHitlManager: HumanInteractionManager | null = null;

function getHitlManager(): HumanInteractionManager {
  if (!globalHitlManager) {
    globalHitlManager = new HumanInteractionManager(new MemoryInterruptStore());
  }
  return globalHitlManager;
}

function createHitlCliForManager(manager: HumanInteractionManager): HitlCli {
  return new HitlCli(manager, { nonInteractive: !process.stdin.isTTY });
}

/**
 * 注册 HITL 子命令
 */
function registerHitlCommands(graphCmd: Command): void {
  const hitlCmd = graphCmd.command('hitl')
    .description('Human-in-the-loop 人在回路管理');

  // graph hitl status - 查看待处理中断
  hitlCmd
    .command('status')
    .description('查看待处理的中断')
    .action(async () => {
      try {
        const manager = getHitlManager();
        const cli = createHitlCliForManager(manager);
        console.log(await cli.status());
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
      }
    });

  // graph hitl approve <threadId> - 快速批准
  hitlCmd
    .command('approve <threadId>')
    .description('批准指定线程的中断并继续执行')
    .action(async (threadId: string) => {
      try {
        const manager = getHitlManager();
        const cli = createHitlCliForManager(manager);
        console.log(await cli.approve(threadId));
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
      }
    });

  // graph hitl reject <threadId> - 快速拒绝
  hitlCmd
    .command('reject <threadId>')
    .description('拒绝指定线程的中断')
    .option('-g, --goto <nodeId>', '跳转到指定节点')
    .action(async (threadId: string, options: any) => {
      try {
        const manager = getHitlManager();
        const cli = createHitlCliForManager(manager);
        console.log(await cli.reject(threadId, options.goto));
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
      }
    });

  // graph hitl skip <threadId> - 快速跳过
  hitlCmd
    .command('skip <threadId>')
    .description('跳过指定线程的当前节点')
    .action(async (threadId: string) => {
      try {
        const manager = getHitlManager();
        const cli = createHitlCliForManager(manager);
        console.log(await cli.skip(threadId));
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
      }
    });

  // graph hitl abort <threadId> - 终止
  hitlCmd
    .command('abort <threadId>')
    .description('终止指定线程的执行')
    .action(async (threadId: string) => {
      try {
        const manager = getHitlManager();
        const cli = createHitlCliForManager(manager);
        console.log(await cli.abort(threadId));
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
      }
    });

  // graph hitl decide <threadId> - 交互式决策
  hitlCmd
    .command('decide <threadId>')
    .description('交互式处理中断决策')
    .action(async (threadId: string) => {
      try {
        const manager = getHitlManager();
        const cli = createHitlCliForManager(manager);
        console.log(await cli.decide(threadId));
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
      }
    });

  // graph hitl edit <threadId> - 编辑状态
  hitlCmd
    .command('edit <threadId>')
    .description('编辑指定线程的状态')
    .requiredOption('-v, --values <json>', '状态值 (JSON 格式)')
    .action(async (threadId: string, options: any) => {
      try {
        const manager = getHitlManager();
        const cli = createHitlCliForManager(manager);
        console.log(await cli.editState(threadId, options.values));
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
      }
    });

  // graph hitl list - 列出所有中断历史
  hitlCmd
    .command('list')
    .description('列出所有中断记录')
    .option('--all', '包括已处理的')
    .action(async (options: any) => {
      try {
        const manager = getHitlManager();
        const interrupts = await manager.listPendingInterrupts();
        console.log(formatPendingInterrupts(interrupts));
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
      }
    });
}

