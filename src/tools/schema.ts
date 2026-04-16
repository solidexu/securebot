/**
 * 工具 Schema 生成
 * 
 * 为工具生成 OpenAI Function Calling 格式的 schema
 */

import type { Tool } from '../core/types.js';

/**
 * 生成 OpenAI Function Calling schema
 */
export function generateToolSchema(tool: Tool): {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
} {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

/**
 * 批量生成 schema
 */
export function generateToolSchemas(tools: Tool[]): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}> {
  return tools.map(generateToolSchema);
}
