/**
 * 配置验证
 * 
 * 参考 LangGraph 的错误处理和 CrewAI 的配置系统
 */

import { AgentError, ValidationError, ConfigurationError } from './errors.js';

/**
 * 验证规则
 */
export interface ValidationRule {
  /** 字段名 */
  field: string;
  /** 是否必填 */
  required?: boolean;
  /** 类型检查 */
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** 最小值/长度 */
  min?: number;
  /** 最大值/长度 */
  max?: number;
  /** 正则表达式 */
  pattern?: RegExp;
  /** 自定义验证函数 */
  validate?: (value: unknown) => boolean | string;
  /** 错误消息 */
  message?: string;
}

/**
 * 验证器
 */
export class Validator {
  private rules: ValidationRule[] = [];
  private errors: string[] = [];

  /**
   * 添加验证规则
   */
  addRule(rule: ValidationRule): this {
    this.rules.push(rule);
    return this;
  }

  /**
   * 添加多个验证规则
   */
  addRules(rules: ValidationRule[]): this {
    this.rules.push(...rules);
    return this;
  }

  /**
   * 验证对象
   */
  validate(obj: Record<string, unknown>): boolean {
    this.errors = [];

    for (const rule of this.rules) {
      const value = obj[rule.field];

      // 检查必填
      if (rule.required && (value === undefined || value === null)) {
        this.errors.push(rule.message || `Field "${rule.field}" is required`);
        continue;
      }

      // 跳过空值（非必填）
      if (value === undefined || value === null) continue;

      // 类型检查
      if (rule.type) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== rule.type) {
          this.errors.push(
            rule.message || `Field "${rule.field}" must be of type ${rule.type}, got ${actualType}`
          );
          continue;
        }
      }

      // 最小值/长度检查
      if (rule.min !== undefined) {
        if (typeof value === 'number' && value < rule.min) {
          this.errors.push(
            rule.message || `Field "${rule.field}" must be at least ${rule.min}`
          );
        } else if (typeof value === 'string' && value.length < rule.min) {
          this.errors.push(
            rule.message || `Field "${rule.field}" must have at least ${rule.min} characters`
          );
        } else if (Array.isArray(value) && value.length < rule.min) {
          this.errors.push(
            rule.message || `Field "${rule.field}" must have at least ${rule.min} items`
          );
        }
      }

      // 最大值/长度检查
      if (rule.max !== undefined) {
        if (typeof value === 'number' && value > rule.max) {
          this.errors.push(
            rule.message || `Field "${rule.field}" must be at most ${rule.max}`
          );
        } else if (typeof value === 'string' && value.length > rule.max) {
          this.errors.push(
            rule.message || `Field "${rule.field}" must have at most ${rule.max} characters`
          );
        } else if (Array.isArray(value) && value.length > rule.max) {
          this.errors.push(
            rule.message || `Field "${rule.field}" must have at most ${rule.max} items`
          );
        }
      }

      // 正则表达式检查
      if (rule.pattern && typeof value === 'string') {
        if (!rule.pattern.test(value)) {
          this.errors.push(
            rule.message || `Field "${rule.field}" must match pattern ${rule.pattern}`
          );
        }
      }

      // 自定义验证
      if (rule.validate) {
        const result = rule.validate(value);
        if (result !== true) {
          this.errors.push(
            typeof result === 'string' ? result : rule.message || `Field "${rule.field}" is invalid`
          );
        }
      }
    }

    return this.errors.length === 0;
  }

  /**
   * 获取错误列表
   */
  getErrors(): string[] {
    return this.errors;
  }

  /**
   * 抛出验证错误
   */
  throwIfInvalid(): void {
    if (this.errors.length > 0) {
      throw new ValidationError('Validation failed', this.errors);
    }
  }

  /**
   * 清空规则和错误
   */
  clear(): this {
    this.rules = [];
    this.errors = [];
    return this;
  }
}

// ============================================
// 预定义验证器
// ============================================

/**
 * Agent 配置验证器
 */
export function createAgentValidator(): Validator {
  return new Validator()
    .addRules([
      { field: 'id', required: true, type: 'string', min: 1, max: 64, pattern: /^[a-zA-Z0-9_-]+$/ },
      { field: 'name', required: true, type: 'string', min: 1, max: 128 },
      { field: 'role', required: true, type: 'string', min: 1, max: 256 },
      { field: 'systemPrompt', required: true },
      { field: 'tools', type: 'array' },
      {
        field: 'behavior.timeout',
        type: 'number',
        min: 100,
        validate: (v: unknown) => {
          if (typeof v !== 'number' || v <= 0) return 'Timeout must be a positive number';
          return true;
        },
      },
      {
        field: 'behavior.retryPolicy.maxAttempts',
        type: 'number',
        min: 1,
        max: 10,
      },
    ]);
}

/**
 * 图配置验证器
 */
export function createGraphValidator(): Validator {
  return new Validator()
    .addRules([
      { field: 'id', required: true, type: 'string', min: 1, max: 64 },
      { field: 'name', required: true, type: 'string', min: 1, max: 128 },
      { field: 'executionMode', required: true, type: 'string' },
      { field: 'entryPoint', required: true, type: 'string' },
      { field: 'nodes', required: true, type: 'array', min: 1 },
      { field: 'edges', required: true, type: 'array' },
      {
        field: 'executionMode',
        validate: (v: unknown) => {
          if (v !== 'lightweight' && v !== 'langgraph') {
            return `Execution mode must be "lightweight" or "langgraph", got "${v}"`;
          }
          return true;
        },
      },
    ]);
}

/**
 * 边配置验证器
 */
export function createEdgeValidator(): Validator {
  return new Validator()
    .addRules([
      { field: 'source', required: true, type: 'string' },
      { field: 'target', required: true, type: 'string' },
      { field: 'type', required: true, type: 'string' },
      {
        field: 'type',
        validate: (v: unknown) => {
          if (v !== 'direct' && v !== 'conditional') {
            return `Edge type must be "direct" or "conditional", got "${v}"`;
          }
          return true;
        },
      },
      { field: 'condition.keywords', type: 'array' },
      { field: 'condition.expression', type: 'string' },
    ]);
}

/**
 * 心跳配置验证器
 */
export function createHeartbeatValidator(): Validator {
  return new Validator()
    .addRules([
      { field: 'intervalMs', type: 'number', min: 1000, max: 60000 },
      { field: 'timeoutMs', type: 'number', min: 1000, max: 120000 },
      { field: 'checkIntervalMs', type: 'number', min: 100, max: 10000 },
      { field: 'maxMissedHeartbeats', type: 'number', min: 1, max: 10 },
    ]);
}

// ============================================
// 配置验证函数
// ============================================

/**
 * 验证完整配置
 */
export function validateConfig(config: unknown): void {
  if (!config || typeof config !== 'object') {
    throw new ConfigurationError('Config must be an object');
  }

  const obj = config as Record<string, unknown>;

  // 验证图配置
  const graphValidator = createGraphValidator();
  if (!graphValidator.validate(obj)) {
    throw new ValidationError('Graph config validation failed', graphValidator.getErrors());
  }

  // 验证节点
  const nodes = obj.nodes as Array<Record<string, unknown>>;
  const agentValidator = createAgentValidator();
  for (const node of nodes) {
    if (!agentValidator.validate(node)) {
      throw new ValidationError(
        `Agent "${node.id}" validation failed`,
        agentValidator.getErrors()
      );
    }
  }

  // 验证边
  const edges = obj.edges as Array<Record<string, unknown>>;
  const edgeValidator = createEdgeValidator();
  for (const edge of edges) {
    if (!edgeValidator.validate(edge)) {
      throw new ValidationError(
        `Edge from "${edge.source}" to "${edge.target}" validation failed`,
        edgeValidator.getErrors()
      );
    }
  }

  // 检查入口节点是否存在
  const nodeIds = nodes.map(n => n.id);
  if (!nodeIds.includes(obj.entryPoint)) {
    throw new ConfigurationError(
      `Entry point "${obj.entryPoint}" not found in nodes`,
      'entryPoint'
    );
  }

  // 检查边引用的节点是否存在
  for (const edge of edges) {
    if (!nodeIds.includes(edge.source)) {
      throw new ConfigurationError(
        `Edge source "${edge.source}" not found in nodes`,
        'edge.source'
      );
    }
    if (edge.target !== 'END' && !nodeIds.includes(edge.target)) {
      throw new ConfigurationError(
        `Edge target "${edge.target}" not found in nodes`,
        'edge.target'
      );
    }
  }
}

/**
 * 安全解析配置
 */
export function safeParseConfig(config: unknown): {
  success: boolean;
  data?: Record<string, unknown>;
  errors?: string[];
} {
  try {
    validateConfig(config);
    return { success: true, data: config as Record<string, unknown> };
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return { success: false, errors: error.errors };
    }
    if (error instanceof ConfigurationError) {
      return { success: false, errors: [error.message] };
    }
    return { success: false, errors: [error.message] };
  }
}