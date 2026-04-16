/**
 * 工具集定义
 * 
 * 参考 Hermes Agent 的 TOOLSETS 设计
 * 将工具分组为逻辑集合，支持技能的条件激活
 */

// ============ 工具集定义 ============

/**
 * 工具集分组
 * 
 * 每个工具集包含一组相关工具
 */
export const TOOLSETS: Record<string, ToolsetDefinition> = {
  // Web 相关
  'web': {
    description: 'Web 搜索和内容获取工具',
    tools: ['web_search', 'web_fetch'],
    includes: [],
  },
  
  // 文件操作
  'file': {
    description: '文件读写编辑工具',
    tools: ['read', 'write', 'edit'],
    includes: [],
  },
  
  // 执行环境
  'exec': {
    description: '命令执行和进程管理',
    tools: ['exec', 'process'],
    includes: [],
  },
  
  // RAG 检索
  'rag': {
    description: '知识库检索和查询',
    tools: ['rag_search', 'rag_query', 'rag_index'],
    includes: [],
  },
  
  // 记忆系统
  'memory': {
    description: '长期记忆管理',
    tools: ['remember', 'recall', 'add_fact', 'get_facts', 'delete_fact', 'clean_facts', 'set_user_info', 'get_user_info', 'memory_stats'],
    includes: [],
  },
  
  // 技能系统
  'skills': {
    description: '技能创建和管理',
    tools: ['create_skill', 'skills_list', 'skill_view', 'skill_manage'],
    includes: [],
  },
  
  // 浏览器自动化
  'browser': {
    description: '浏览器控制自动化',
    tools: ['browser_navigate', 'browser_snapshot', 'browser_click', 'browser_type'],
    includes: [],
  },
  
  // 消息发送
  'messaging': {
    description: '跨平台消息发送',
    tools: ['message', 'send_message', 'tts'],
    includes: [],
  },
  
  // 图协作（Agent 协作）
  'collaboration': {
    description: 'Agent 图协作工具',
    tools: ['graph_load', 'graph_run', 'graph_status', 'graph_resume'],
    includes: [],
  },
  
  // 基础工具集（最小可用）
  'basic': {
    description: '基础工具集（最小可用配置）',
    tools: [],
    includes: ['file', 'memory'],
  },
  
  // 标准工具集（推荐配置）
  'standard': {
    description: '标准工具集（推荐配置）',
    tools: [],
    includes: ['basic', 'web', 'exec', 'skills'],
  },
  
  // 完整工具集（全部工具）
  'full_stack': {
    description: '完整工具集（全部可用工具）',
    tools: [],
    includes: ['standard', 'rag', 'browser', 'messaging', 'collaboration'],
  },
};

// ============ 类型定义 ============

/**
 * 工具集定义
 */
export interface ToolsetDefinition {
  /** 工具集描述 */
  description: string;
  
  /** 直接包含的工具 */
  tools: string[];
  
  /** 包含的其他工具集（组合） */
  includes: string[];
}

/**
 * 工具集配置
 */
export interface ToolsetConfig {
  /** 启用的工具集 */
  enabled?: string[];
  
  /** 禁用的工具集 */
  disabled?: string[];
}

// ============ 工具集解析 ============

/**
 * 解析工具集，获取所有工具名称
 * 
 * 递归解析 includes，返回完整工具列表
 */
export function resolveToolset(toolset: string): string[] {
  const definition = TOOLSETS[toolset];
  if (!definition) {
    console.warn(`Unknown toolset: ${toolset}`);
    return [];
  }
  
  const tools = new Set<string>();
  
  // 添加直接包含的工具
  for (const tool of definition.tools) {
    tools.add(tool);
  }
  
  // 递归解析 includes
  for (const included of definition.includes) {
    const includedTools = resolveToolset(included);
    for (const tool of includedTools) {
      tools.add(tool);
    }
  }
  
  return Array.from(tools);
}

/**
 * 获取所有工具集名称
 */
export function getAllToolsetNames(): string[] {
  return Object.keys(TOOLSETS);
}

/**
 * 获取工具所属的工具集
 */
export function getToolsetForTool(tool: string): string | null {
  for (const [toolset, definition] of Object.entries(TOOLSETS)) {
    const allTools = resolveToolset(toolset);
    if (allTools.includes(tool)) {
      return toolset;
    }
  }
  return null;
}

/**
 * 验证工具集名称
 */
export function validateToolset(toolset: string): boolean {
  return toolset in TOOLSETS;
}

/**
 * 获取可用工具列表
 * 
 * 根据 enabled/disabled 配置计算最终可用工具
 */
export function getAvailableTools(config: ToolsetConfig): string[] {
  const tools = new Set<string>();
  
  if (config.enabled && config.enabled.length > 0) {
    // 启用模式：只包含 enabled 工具集
    for (const toolset of config.enabled) {
      if (validateToolset(toolset)) {
        const resolved = resolveToolset(toolset);
        for (const tool of resolved) {
          tools.add(tool);
        }
      } else {
        console.warn(`Unknown toolset in enabled list: ${toolset}`);
      }
    }
  } else if (config.disabled && config.disabled.length > 0) {
    // 禁用模式：包含所有工具集，排除 disabled
    for (const toolset of getAllToolsetNames()) {
      if (!config.disabled.includes(toolset)) {
        const resolved = resolveToolset(toolset);
        for (const tool of resolved) {
          tools.add(tool);
        }
      }
    }
  } else {
    // 默认：包含所有工具
    for (const toolset of getAllToolsetNames()) {
      const resolved = resolveToolset(toolset);
      for (const tool of resolved) {
        tools.add(tool);
      }
    }
  }
  
  return Array.from(tools);
}

/**
 * 获取可用工具集列表
 * 
 * 根据 enabled/disabled 配置计算最终可用工具集
 */
export function getAvailableToolsets(config: ToolsetConfig): string[] {
  if (config.enabled && config.enabled.length > 0) {
    // 启用模式：返回 enabled 列表（验证后）
    return config.enabled.filter(validateToolset);
  } else if (config.disabled && config.disabled.length > 0) {
    // 禁用模式：返回所有工具集，排除 disabled
    return getAllToolsetNames().filter(ts => !config.disabled!.includes(ts));
  } else {
    // 默认：返回所有工具集
    return getAllToolsetNames();
  }
}

// ============ 工具映射表 ============

/**
 * 工具到工具集的映射（缓存）
 */
let _toolToToolsetMap: Map<string, string> | null = null;

/**
 * 获取工具到工具集的映射表
 */
export function getToolToToolsetMap(): Map<string, string> {
  if (!_toolToToolsetMap) {
    _toolToToolsetMap = new Map();
    for (const toolset of getAllToolsetNames()) {
      for (const tool of resolveToolset(toolset)) {
        // 优先记录到最具体的工具集
        if (!_toolToToolsetMap.has(tool)) {
          _toolToToolsetMap.set(tool, toolset);
        }
      }
    }
  }
  return _toolToToolsetMap;
}
