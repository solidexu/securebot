/**
 * YAML 工作流加载器
 * 
 * 从 YAML 配置加载图结构
 */

import * as yaml from 'js-yaml';
import {
  WorkflowConfig,
  AgentConfig,
  EdgeConfig,
  AgentNode,
  GraphEdge,
  ExecutionMode,
} from './types';
import { Graph } from './graph';
import { GraphBuilder } from './builder';
import { HitlConfig, HitlLevel } from './hitl-types';

/**
 * 从 YAML 字符串加载图
 */
export function loadFromYaml(yamlContent: string): Graph {
  const config = yaml.load(yamlContent) as WorkflowConfig;
  return loadFromConfig(config);
}

/**
 * 从配置对象加载图
 */
export function loadFromConfig(config: WorkflowConfig): Graph {
  const builder = new GraphBuilder(config.id, config.name);

  // 设置执行模式
  if (config.mode) {
    builder.mode(config.mode);
  }

  // 添加节点
  const agentConfigs = config.agents || [];
  for (const agentConfig of agentConfigs) {
    const node = convertAgentConfig(agentConfig);
    builder.addAgent(node);
  }

  // 设置入口点
  if (config.entry) {
    builder.entry(config.entry);
  }

  // 添加边
  if (config.edges) {
    for (const edgeConfig of config.edges) {
      addEdgeFromConfig(builder, edgeConfig);
    }
  }

  // 添加路由（替代方式）
  if (config.routes) {
    addRoutesFromConfig(builder, config.routes);
  }

  // 设置 LangGraph 配置
  if (config.langgraph) {
    builder.setConfig(config.langgraph);
  }

  // 设置人在回路配置
  if (config.hitl) {
    const hitlConfig: HitlConfig = {
      level: (config.hitl.level as HitlLevel) || HitlLevel.FULL_AUTO,
      interruptNodes: config.hitl.interruptNodes,
      requireToolApproval: config.hitl.requireToolApproval,
      approvedTools: config.hitl.approvedTools,
      autoApproveTimeoutMs: config.hitl.autoApproveTimeoutMs,
    };
    builder.setHitlConfig(hitlConfig);
  }

  // 设置循环和迭代配置
  if (config.allowCycles) {
    builder.allowCycles(config.allowCycles);
  }
  if (config.maxIterations) {
    builder.maxIterations(config.maxIterations);
  }

  return builder.build();
}

/**
 * 转换 Agent 配置为节点
 */
function convertAgentConfig(config: AgentConfig): AgentNode {
  return {
    id: config.id,
    name: config.name,
    role: config.role,
    description: config.description,
    systemPrompt: config.systemPrompt,
    tools: config.tools,
    model: config.model,
    behavior: config.behavior,
  };
}

/**
 * 从边配置添加边
 */
function addEdgeFromConfig(builder: GraphBuilder, config: EdgeConfig): void {
  if (config.type === 'direct') {
    builder.addDirectEdge(config.source, config.target, config.metadata);
  } else {
    builder.addConditionalEdge(
      config.source,
      config.target,
      config.condition || {},
      config.metadata
    );
  }
}

/**
 * 从路由配置添加边
 */
function addRoutesFromConfig(
  builder: GraphBuilder,
  routes: Record<string, { on: Record<string, string>; default?: string; conditionFn?: string }>
): void {
  for (const [source, routeConfig] of Object.entries(routes)) {
    const on = routeConfig.on || {};
    
    for (const [event, target] of Object.entries(on)) {
      // 根据事件名生成关键词条件
      const condition = { keywords: [event] };
      
      builder.addConditionalEdge(source, target, condition, {
        label: event,
        isDefault: routeConfig.default === target,
      });
    }

    // 添加默认边
    if (routeConfig.default) {
      builder.addConditionalEdge(source, routeConfig.default, {}, {
        label: 'default',
        isDefault: true,
      });
    }
  }
}

/**
 * 验证 YAML 配置
 */
export function validateYamlConfig(yamlContent: string): {
  valid: boolean;
  errors: string[];
  config?: WorkflowConfig;
} {
  const errors: string[] = [];

  try {
    const config = yaml.load(yamlContent) as WorkflowConfig;

    // 检查必需字段
    if (!config.id) {
      errors.push('Missing required field: id');
    }
    if (!config.name) {
      errors.push('Missing required field: name');
    }
    if (!config.entry) {
      errors.push('Missing required field: entry');
    }
    if (!config.agents || config.agents.length === 0) {
      errors.push('No agents defined');
    }

    // 检查入口点是否存在
    if (config.entry && config.agents) {
      const agentIds = config.agents.map((a) => a.id);
      if (!agentIds.includes(config.entry)) {
        errors.push(`Entry agent not found: ${config.entry}`);
      }
    }

    // 检查边
    if (config.edges) {
      const agentIds = new Set(config.agents?.map((a) => a.id) || []);
      for (const edge of config.edges) {
        if (!agentIds.has(edge.source)) {
          errors.push(`Edge source not found: ${edge.source}`);
        }
        if (!agentIds.has(edge.target) && edge.target !== '__end__') {
          errors.push(`Edge target not found: ${edge.target}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      config,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [`YAML parse error: ${(error as Error).message}`],
    };
  }
}

/**
 * 从文件路径加载图
 */
export async function loadFromFile(filePath: string): Promise<Graph | null> {
  const fs = await import('node:fs/promises');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return loadFromYaml(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}