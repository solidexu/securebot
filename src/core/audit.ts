/**
 * 审计日志系统
 * 
 * 记录所有工具调用，支持追溯和分析
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ============ 类型定义 ============

/**
 * 审计日志条目
 */
export interface AuditEntry {
  /** 时间戳 */
  timestamp: string;
  /** Agent ID */
  agentId: string;
  /** 会话 Key */
  sessionKey: string;
  /** 工具名称 */
  tool: string;
  /** 操作类别 */
  category: 'read' | 'write' | 'execute' | 'network' | 'other';
  /** 参数摘要 */
  params: Record<string, unknown>;
  /** 执行结果 */
  result: 'success' | 'failure' | 'cancelled';
  /** 错误信息 */
  error?: string;
  /** 执行时长 (ms) */
  duration?: number;
}

/**
 * 审计日志配置
 */
export interface AuditConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 日志文件路径 */
  logPath: string;
  /** 保留天数 */
  retentionDays: number;
  /** 是否记录参数详情 */
  logParams: boolean;
}

// ============ 默认配置 ============

const DEFAULT_AUDIT_DIR = join(homedir(), '.securebot', 'audit');
const DEFAULT_LOG_PATH = join(DEFAULT_AUDIT_DIR, 'audit.log');

// ============ 审计日志类 ============

class AuditLogger {
  private config: AuditConfig;
  private enabled: boolean;

  constructor(config: Partial<AuditConfig> = {}) {
    this.config = {
      enabled: true,
      logPath: DEFAULT_LOG_PATH,
      retentionDays: 30,
      logParams: true,
      ...config,
    };
    this.enabled = this.config.enabled;
    this.ensureLogDir();
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogDir(): void {
    const logDir = join(this.config.logPath, '..');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * 记录审计日志
   */
  log(entry: Omit<AuditEntry, 'timestamp'>): void {
    if (!this.enabled) return;

    const fullEntry: AuditEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    // 过滤敏感参数
    if (!this.config.logParams) {
      fullEntry.params = this.sanitizeParams(entry.params);
    }

    const logLine = JSON.stringify(fullEntry);
    
    try {
      appendFileSync(this.config.logPath, logLine + '\n', 'utf-8');
    } catch (error) {
      console.error('审计日志写入失败:', error);
    }
  }

  /**
   * 记录工具调用
   */
  logToolCall(
    agentId: string,
    sessionKey: string,
    tool: string,
    params: Record<string, unknown>,
    result: 'success' | 'failure' | 'cancelled',
    error?: string,
    duration?: number
  ): void {
    const category = this.getToolCategory(tool);
    
    this.log({
      agentId,
      sessionKey,
      tool,
      category,
      params: this.sanitizeParams(params),
      result,
      error,
      duration,
    });
  }

  /**
   * 获取工具类别
   */
  private getToolCategory(tool: string): AuditEntry['category'] {
    if (['read', 'write', 'edit'].includes(tool)) return 'read';
    if (tool === 'exec') return 'execute';
    if (['web_search', 'web_fetch', 'browser'].includes(tool)) return 'network';
    return 'other';
  }

  /**
   * 过滤敏感参数
   */
  private sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential'];

    for (const [key, value] of Object.entries(params)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(s => lowerKey.includes(s))) {
        sanitized[key] = '***REDACTED***';
      } else if (typeof value === 'string' && value.length > 200) {
        sanitized[key] = value.slice(0, 200) + '...[truncated]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * 读取最近的审计日志
   */
  readRecent(limit: number = 50): AuditEntry[] {
    if (!existsSync(this.config.logPath)) {
      return [];
    }

    try {
      const content = readFileSync(this.config.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      
      return lines
        .slice(-limit)
        .map(line => {
          try {
            return JSON.parse(line) as AuditEntry;
          } catch {
            return null;
          }
        })
        .filter((e): e is AuditEntry => e !== null);
    } catch {
      return [];
    }
  }

  /**
   * 按条件搜索日志
   */
  search(filter: {
    agentId?: string;
    tool?: string;
    result?: 'success' | 'failure' | 'cancelled';
    since?: Date;
  }): AuditEntry[] {
    const entries = this.readRecent(1000);
    
    return entries.filter(entry => {
      if (filter.agentId && entry.agentId !== filter.agentId) return false;
      if (filter.tool && entry.tool !== filter.tool) return false;
      if (filter.result && entry.result !== filter.result) return false;
      if (filter.since && new Date(entry.timestamp) < filter.since) return false;
      return true;
    });
  }

  /**
   * 获取统计信息
   */
  getStats(since?: Date): {
    totalCalls: number;
    successRate: number;
    byTool: Record<string, number>;
    byAgent: Record<string, number>;
  } {
    const entries = this.readRecent(1000).filter(e => 
      !since || new Date(e.timestamp) >= since
    );

    const totalCalls = entries.length;
    const successCount = entries.filter(e => e.result === 'success').length;
    
    const byTool: Record<string, number> = {};
    const byAgent: Record<string, number> = {};

    for (const entry of entries) {
      byTool[entry.tool] = (byTool[entry.tool] ?? 0) + 1;
      byAgent[entry.agentId] = (byAgent[entry.agentId] ?? 0) + 1;
    }

    return {
      totalCalls,
      successRate: totalCalls > 0 ? successCount / totalCalls : 0,
      byTool,
      byAgent,
    };
  }

  /**
   * 启用/禁用审计
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * 检查是否启用
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// ============ 全局实例 ============

let globalAuditLogger: AuditLogger | null = null;

/**
 * 获取审计日志实例
 */
export function getAuditLogger(config?: Partial<AuditConfig>): AuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger(config);
  }
  return globalAuditLogger;
}

/**
 * 重置审计日志实例（测试用）
 */
export function resetAuditLogger(): void {
  globalAuditLogger = null;
}