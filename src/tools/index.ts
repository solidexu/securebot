/**
 * 工具注册中心
 * 
 * 管理所有可用工具的注册和查询
 */

import type { Tool, ToolContext, ToolResult, Agent, ToolPolicy } from '../core/types.js';
import { isToolAllowed, getAgentToolPolicy } from '../core/agent.js';
import { eventBus } from '../core/event-bus.js';
import { EventTypes } from '../core/events.js';
import { readTool, writeTool, editTool } from './fs.js';
import { execTool } from './exec.js';
import { ragTools } from '../rag/tools.js';
import { memoryTools } from './memory.js';
import { skillTools } from './skill.js';
import { progressiveSkillTools } from './skill-progressive.js';

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
 * 获取 Agent 可用的工具名称列表
 */
export function getAvailableToolNames(agent: Agent, globalPolicy: ToolPolicy): string[] {
  const tools = getAvailableTools(agent, globalPolicy);
  return tools.map(tool => tool.name);
}

/**
 * 执行工具调用
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const tool = getTool(name);

  if (!tool) {
    return {
      success: false,
      error: `Tool "${name}" not found`
    };
  }

  try {
    return await tool.execute(args, context);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// ============ 默认注册 ============

registerTools([
  readTool,
  writeTool,
  editTool,
  execTool,
]);

registerTools(ragTools);
registerTools(memoryTools);
registerTools(skillTools);
registerTools(progressiveSkillTools);

// ============ 导出 ============

export { readTool, writeTool, editTool, execTool };
export { ragTools };
export { memoryTools };
export { skillTools };
export { progressiveSkillTools };
export { generateToolSchema, generateToolSchemas } from "./schema.js";
