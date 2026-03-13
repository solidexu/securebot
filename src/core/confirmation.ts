/**
 * 敏感操作确认系统
 * 
 * 管理需要用户确认的敏感操作
 */

import type { Tool, ToolContext, ToolResult } from '../core/types.js';

// ============ 类型定义 ============

/**
 * 敏感级别
 */
export type SensitivityLevel = 
  | 'safe'        // 安全操作，无需确认
  | 'low'         // 低风险，可选确认
  | 'medium'      // 中风险，建议确认
  | 'high'        // 高风险，必须确认
  | 'critical';   // 关键操作，必须确认并显示详情

/**
 * 操作类别
 */
export type OperationCategory =
  | 'read'        // 读取操作
  | 'write'       // 写入操作
  | 'delete'      // 删除操作
  | 'execute'     // 命令执行
  | 'network'     // 网络请求
  | 'system'      // 系统操作
  | 'sensitive';  // 敏感数据操作

/**
 * 敏感操作定义
 */
export interface SensitiveOperation {
  /** 工具名称 */
  tool: string;
  /** 操作类别 */
  category: OperationCategory;
  /** 敏感级别 */
  level: SensitivityLevel;
  /** 风险描述 */
  riskDescription: string;
  /** 检查函数（返回 true 表示需要确认） */
  check?: (params: Record<string, unknown>, context: ToolContext) => boolean;
  /** 生成确认消息 */
  getConfirmMessage?: (params: Record<string, unknown>, context: ToolContext) => string;
}

/**
 * 确认请求
 */
export interface ConfirmationRequest {
  /** 操作 ID */
  id: string;
  /** 工具名称 */
  tool: string;
  /** 操作类别 */
  category: OperationCategory;
  /** 敏感级别 */
  level: SensitivityLevel;
  /** 确认消息 */
  message: string;
  /** 风险描述 */
  risk: string;
  /** 操作参数 */
  params: Record<string, unknown>;
  /** 建议操作 */
  suggestions?: string[];
}

/**
 * 确认结果
 */
export interface ConfirmationResult {
  /** 是否确认 */
  confirmed: boolean;
  /** 是否记住选择 */
  remember?: boolean;
  /** 备注 */
  note?: string;
}

/**
 * 确认处理器
 */
export type ConfirmationHandler = (request: ConfirmationRequest) => Promise<ConfirmationResult>;

/**
 * 确认策略
 */
export interface ConfirmationPolicy {
  /** 确认模式 */
  mode: 'always' | 'on-risk' | 'off';
  /** 需要确认的最低级别 */
  minLevel: SensitivityLevel;
  /** 跳过确认的操作 */
  skipTools: string[];
  /** 始终需要确认的操作 */
  alwaysConfirm: string[];
}

// ============ 默认敏感操作定义 ============

/**
 * 预定义的敏感操作
 */
export const SENSITIVE_OPERATIONS: SensitiveOperation[] = [
  // 文件写入
  {
    tool: 'write',
    category: 'write',
    level: 'medium',
    riskDescription: '将写入或覆盖文件内容',
    check: (_params) => {
      // 检查是否覆盖已存在的文件可以在这里实现
      return true;
    },
    getConfirmMessage: (params) => {
      const path = params['path'] as string;
      const content = params['content'] as string;
      const preview = content && content.length > 100 
        ? content.slice(0, 100) + '...' 
        : content;
      return `写入文件: ${path}\n内容预览: ${preview ?? '(空)'}`;
    },
  },
  
  // 文件编辑
  {
    tool: 'edit',
    category: 'write',
    level: 'medium',
    riskDescription: '将修改文件内容',
    getConfirmMessage: (params) => {
      const path = params['path'] as string;
      const oldText = params['oldText'] as string;
      const newText = params['newText'] as string;
      return `编辑文件: ${path}\n替换: "${oldText?.slice(0, 50) ?? ''}"\n为: "${newText?.slice(0, 50) ?? ''}"`;
    },
  },
  
  // 命令执行
  {
    tool: 'exec',
    category: 'execute',
    level: 'high',
    riskDescription: '将执行系统命令',
    check: (params, context) => {
      // 白名单内的命令不需要确认
      const policy = context.agent.tools?.exec;
      if (policy?.security === 'allowlist') {
        const command = params['command'] as string;
        const allowlist = policy.allowlist ?? [];
        // 检查是否在白名单
        const isAllowed = allowlist.some(pattern => {
          if (pattern.endsWith('*')) {
            return command.startsWith(pattern.slice(0, -1));
          }
          return command === pattern;
        });
        if (isAllowed && policy.ask === 'off') {
          return false;
        }
      }
      return true;
    },
    getConfirmMessage: (params) => {
      const command = params['command'] as string;
      return `执行命令: ${command}`;
    },
  },
  
  // RAG 索引
  {
    tool: 'rag_index',
    category: 'read',
    level: 'low',
    riskDescription: '将索引文件到知识库',
    getConfirmMessage: (params) => {
      const path = params['path'] as string;
      return `索引目录/文件: ${path}`;
    },
  },
  
  // 敏感文件读取
  {
    tool: 'read',
    category: 'read',
    level: 'low',
    riskDescription: '读取文件内容',
    check: (params) => {
      const path = params['path'] as string;
      // 检查是否是敏感文件
      const sensitivePatterns = [
        /\.env/i,
        /secret/i,
        /password/i,
        /key.*\.pem$/i,
        /id_rsa/i,
        /\.pem$/i,
        /credentials/i,
      ];
      return sensitivePatterns.some(p => p.test(path));
    },
    getConfirmMessage: (params) => {
      const path = params['path'] as string;
      return `读取敏感文件: ${path}\n⚠️ 该文件可能包含敏感信息`;
    },
  },
];

// ============ 确认管理器 ============

/**
 * 敏感操作确认管理器
 */
export class ConfirmationManager {
  private operations: Map<string, SensitiveOperation> = new Map();
  private policy: ConfirmationPolicy;
  private handler: ConfirmationHandler | null = null;
  private rememberedDecisions: Map<string, boolean> = new Map();

  constructor(policy: Partial<ConfirmationPolicy> = {}) {
    this.policy = {
      mode: 'on-risk',
      minLevel: 'medium',
      skipTools: [],
      alwaysConfirm: [],
      ...policy,
    };

    // 注册默认操作
    for (const op of SENSITIVE_OPERATIONS) {
      this.operations.set(op.tool, op);
    }
  }

  /**
   * 设置确认处理器
   */
  setHandler(handler: ConfirmationHandler): void {
    this.handler = handler;
  }

  /**
   * 注册敏感操作
   */
  registerOperation(operation: SensitiveOperation): void {
    this.operations.set(operation.tool, operation);
  }

  /**
   * 更新确认策略
   */
  updatePolicy(policy: Partial<ConfirmationPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }

  /**
   * 检查操作是否需要确认
   */
  needsConfirmation(
    tool: string,
    params: Record<string, unknown>,
    context: ToolContext
  ): boolean {
    // 检查确认模式
    if (this.policy.mode === 'off') {
      return false;
    }

    // 检查跳过列表
    if (this.policy.skipTools.includes(tool)) {
      return false;
    }

    // 检查始终确认列表
    if (this.policy.alwaysConfirm.includes(tool)) {
      return true;
    }

    // 检查记住的决定
    const decisionKey = this.getDecisionKey(tool, params);
    if (this.rememberedDecisions.has(decisionKey)) {
      return false;
    }

    // 检查操作定义
    const operation = this.operations.get(tool);
    if (!operation) {
      // 未定义的工具，根据级别判断
      return this.policy.mode === 'always';
    }

    // 检查级别
    if (!this.shouldConfirmLevel(operation.level)) {
      return false;
    }

    // 检查自定义条件
    if (operation.check) {
      return operation.check(params, context);
    }

    return true;
  }

  /**
   * 请求确认
   */
  async requestConfirmation(
    tool: string,
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ConfirmationResult> {
    // 检查是否需要确认
    if (!this.needsConfirmation(tool, params, context)) {
      return { confirmed: true };
    }

    // 检查记住的决定
    const decisionKey = this.getDecisionKey(tool, params);
    const remembered = this.rememberedDecisions.get(decisionKey);
    if (remembered !== undefined) {
      return { confirmed: remembered, remember: true };
    }

    // 生成确认请求
    const request = this.createRequest(tool, params, context);

    // 调用处理器
    if (!this.handler) {
      // 没有处理器，默认拒绝
      console.warn('没有设置确认处理器，敏感操作被拒绝');
      return { confirmed: false };
    }

    const result = await this.handler(request);

    // 记住决定
    if (result.remember) {
      this.rememberedDecisions.set(decisionKey, result.confirmed);
    }

    return result;
  }

  /**
   * 清除记住的决定
   */
  clearRememberedDecisions(): void {
    this.rememberedDecisions.clear();
  }

  /**
   * 获取操作定义
   */
  getOperation(tool: string): SensitiveOperation | undefined {
    return this.operations.get(tool);
  }

  // ============ 私有方法 ============

  private shouldConfirmLevel(level: SensitivityLevel): boolean {
    const levels: SensitivityLevel[] = ['safe', 'low', 'medium', 'high', 'critical'];
    const minIndex = levels.indexOf(this.policy.minLevel);
    const levelIndex = levels.indexOf(level);
    return levelIndex >= minIndex;
  }

  private getDecisionKey(tool: string, params: Record<string, unknown>): string {
    // 生成唯一键
    const relevantKeys = ['path', 'command', 'url'];
    const parts = [tool];
    for (const key of relevantKeys) {
      if (params[key] !== undefined) {
        parts.push(`${key}=${params[key]}`);
      }
    }
    return parts.join(':');
  }

  private createRequest(
    tool: string,
    params: Record<string, unknown>,
    context: ToolContext
  ): ConfirmationRequest {
    const operation = this.operations.get(tool);
    
    const level = operation?.level ?? 'medium';
    const category = operation?.category ?? 'sensitive';
    const risk = operation?.riskDescription ?? '该操作可能存在风险';
    
    let message = `确认执行工具: ${tool}`;
    if (operation?.getConfirmMessage) {
      message = operation.getConfirmMessage(params, context);
    }

    // 添加建议
    const suggestions: string[] = [];
    if (level === 'high' || level === 'critical') {
      suggestions.push('请仔细检查操作参数');
      suggestions.push('建议先备份相关数据');
    }
    if (category === 'execute') {
      suggestions.push('确保命令来源可信');
    }
    if (category === 'network') {
      suggestions.push('检查目标地址是否安全');
    }

    return {
      id: `confirm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tool,
      category,
      level,
      message,
      risk,
      params,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }
}

// ============ 工具包装器 ============

/**
 * 创建带确认的工具包装器
 */
export function createConfirmableTool(
  tool: Tool,
  confirmationManager: ConfirmationManager
): Tool {
  return {
    ...tool,
    async execute(
      params: Record<string, unknown>,
      context: ToolContext
    ): Promise<ToolResult> {
      // 请求确认
      const result = await confirmationManager.requestConfirmation(
        tool.name,
        params,
        context
      );

      if (!result.confirmed) {
        return {
          success: false,
          error: '用户取消了操作',
          metadata: { cancelled: true },
        };
      }

      // 执行原工具
      return tool.execute(params, context);
    },
  };
}

// ============ 全局实例 ============

let globalConfirmationManager: ConfirmationManager | null = null;

/**
 * 获取全局确认管理器
 */
export function getConfirmationManager(
  policy?: Partial<ConfirmationPolicy>
): ConfirmationManager {
  if (!globalConfirmationManager) {
    globalConfirmationManager = new ConfirmationManager(policy);
  }
  return globalConfirmationManager;
}

/**
 * 重置全局实例
 */
export function resetConfirmationManager(): void {
  globalConfirmationManager = null;
}