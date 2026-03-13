/**
 * 工具注册中心
 * 
 * 管理所有可用工具的注册和查询
 */

import type { Tool, ToolContext, ToolResult, Agent, ToolPolicy } from '../core/types.js';
import { isToolAllowed, getAgentToolPolicy } from '../core/agent.js';
import { ragTools } from '../rag/tools.js';

// ============ 工具注册表 ============

const toolRegistry = new Map<string, Tool>();

/**
 * 注册工具
 */
export function registerTool(tool: Tool): void {
  toolRegistry.set(tool.name, tool);
}

/**
 * 批量注册工具
 */
export function registerTools(tools: Tool[]): void {
  for (const tool of tools) {
    registerTool(tool);
  }
}

/**
 * 获取工具
 */
export function getTool(name: string): Tool | undefined {
  return toolRegistry.get(name);
}

/**
 * 获取所有工具
 */
export function getAllTools(): Tool[] {
  return Array.from(toolRegistry.values());
}

/**
 * 获取工具名称列表
 */
export function getToolNames(): string[] {
  return Array.from(toolRegistry.keys());
}

// ============ 工具过滤 ============

/**
 * 获取 Agent 可用的工具
 */
export function getAvailableTools(agent: Agent, globalPolicy: ToolPolicy): Tool[] {
  const policy = getAgentToolPolicy(agent, globalPolicy);
  
  return getAllTools().filter(tool => 
    isToolAllowed(tool.name, policy)
  );
}

/**
 * 获取 Agent 可用的工具名称
 */
export function getAvailableToolNames(agent: Agent, globalPolicy: ToolPolicy): string[] {
  return getAvailableTools(agent, globalPolicy).map(t => t.name);
}

// ============ 工具执行 ============

/**
 * 执行工具
 */
export async function executeTool(
  toolName: string,
  params: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const tool = getTool(toolName);
  
  if (!tool) {
    return {
      success: false,
      error: `工具不存在: ${toolName}`,
    };
  }
  
  // 检查权限
  const policy = getAgentToolPolicy(context.agent, context.session as unknown as ToolPolicy);
  if (!isToolAllowed(toolName, policy)) {
    return {
      success: false,
      error: `工具 ${toolName} 未授权`,
    };
  }
  
  try {
    const result = await tool.execute(params, context);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `工具执行失败: ${message}`,
    };
  }
}

// ============ 工具 Schema 生成 ============

/**
 * 生成工具的 OpenAI 格式 Schema
 */
export function generateToolSchema(tool: Tool): {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
} {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as unknown as Record<string, unknown>,
    },
  };
}

/**
 * 生成所有工具的 Schema
 */
export function generateAllToolSchemas(): ReturnType<typeof generateToolSchema>[] {
  return getAllTools().map(generateToolSchema);
}

// ============ 自动注册 RAG 工具 ============

// 注册 RAG 相关工具
registerTools(ragTools);