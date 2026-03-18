/**
 * 内存监控模块
 * 
 * 检测内存使用，防止内存溢出崩溃
 */

// ============ 类型定义 ============

export interface MemoryThresholds {
  /** 警告阈值 (MB) */
  warning: number;
  /** 危险阈值 (MB) - 触发清理 */
  danger: number;
  /** 临界阈值 (MB) - 触发强制 GC */
  critical: number;
}

export interface MemoryStatus {
  /** 堆已用 (MB) */
  heapUsedMB: number;
  /** 堆总量 (MB) */
  heapTotalMB: number;
  /** RSS (MB) */
  rssMB: number;
  /** 外部内存 (MB) */
  externalMB: number;
  /** 使用百分比 */
  usagePercent: number;
  /** 状态级别 */
  level: 'normal' | 'warning' | 'danger' | 'critical';
}

export interface MemoryAlert {
  /** 时间戳 */
  timestamp: Date;
  /** 级别 */
  level: 'warning' | 'danger' | 'critical';
  /** 消息 */
  message: string;
  /** 当前内存状态 */
  memory: MemoryStatus;
}

export type MemoryAlertHandler = (alert: MemoryAlert) => void;

// ============ 默认阈值 ============

/**
 * 根据系统内存自动计算阈值
 */
function calculateDefaultThresholds(): MemoryThresholds {
  const os = require('node:os');
  const totalMemoryMB = os.totalmem() / 1024 / 1024;
  
  // Node.js 默认堆内存限制约为系统内存的一半，最大约 1.4GB
  // 我们设置阈值相对于堆内存限制
  const heapLimitMB = Math.min(totalMemoryMB * 0.5, 1400);
  
  return {
    warning: Math.floor(heapLimitMB * 0.6),    // 60% 警告
    danger: Math.floor(heapLimitMB * 0.8),     // 80% 危险
    critical: Math.floor(heapLimitMB * 0.9),   // 90% 临界
  };
}

// ============ 内存监控器 ============

/**
 * 内存监控器
 * 
 * 定期检查内存使用，超过阈值时发出警告
 */
export class MemoryMonitor {
  private thresholds: MemoryThresholds;
  private alertHandler: MemoryAlertHandler | null = null;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private lastAlertTime: number = 0;
  private alertCooldown: number = 30000; // 30秒冷却
  private gcAttempted: boolean = false;
  
  constructor(thresholds?: Partial<MemoryThresholds>) {
    const defaults = calculateDefaultThresholds();
    this.thresholds = { ...defaults, ...thresholds };
  }

  /**
   * 获取当前内存状态
   */
  getStatus(): MemoryStatus {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100;
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100;
    const rssMB = Math.round(usage.rss / 1024 / 1024 * 100) / 100;
    const externalMB = Math.round(usage.external / 1024 / 1024 * 100) / 100;
    
    // 计算使用百分比（相对于阈值中的 critical 值）
    const usagePercent = (heapUsedMB / this.thresholds.critical) * 100;
    
    // 确定状态级别
    let level: MemoryStatus['level'] = 'normal';
    if (heapUsedMB >= this.thresholds.critical) {
      level = 'critical';
    } else if (heapUsedMB >= this.thresholds.danger) {
      level = 'danger';
    } else if (heapUsedMB >= this.thresholds.warning) {
      level = 'warning';
    }
    
    return {
      heapUsedMB,
      heapTotalMB,
      rssMB,
      externalMB,
      usagePercent,
      level,
    };
  }

  /**
   * 设置告警处理器
   */
  setAlertHandler(handler: MemoryAlertHandler): void {
    this.alertHandler = handler;
  }

  /**
   * 开始监控
   */
  start(intervalMs: number = 10000): void {
    if (this.checkInterval) {
      this.stop();
    }
    
    this.checkInterval = setInterval(() => {
      this.check();
    }, intervalMs);
    
    // 不阻止进程退出
    if (this.checkInterval.unref) {
      this.checkInterval.unref();
    }
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * 检查内存并发出告警
   */
  check(): MemoryStatus {
    const status = this.getStatus();
    const now = Date.now();
    
    // 检查是否需要发出告警（考虑冷却时间）
    if (status.level !== 'normal' && now - this.lastAlertTime > this.alertCooldown) {
      this.lastAlertTime = now;
      
      const alert: MemoryAlert = {
        timestamp: new Date(),
        level: status.level as 'warning' | 'danger' | 'critical',
        message: this.getAlertMessage(status),
        memory: status,
      };
      
      // 触发处理器
      if (this.alertHandler) {
        this.alertHandler(alert);
      }
      
      // 危险级别尝试强制 GC
      if (status.level === 'danger' || status.level === 'critical') {
        this.attemptGC();
      }
    }
    
    return status;
  }

  /**
   * 获取告警消息
   */
  private getAlertMessage(status: MemoryStatus): string {
    switch (status.level) {
      case 'warning':
        return `内存使用较高: ${status.heapUsedMB}MB (${status.usagePercent.toFixed(1)}%)`;
      case 'danger':
        return `内存使用危险: ${status.heapUsedMB}MB (${status.usagePercent.toFixed(1)}%)，建议清理缓存`;
      case 'critical':
        return `内存即将耗尽: ${status.heapUsedMB}MB (${status.usagePercent.toFixed(1)}%)，正在尝试清理`;
      default:
        return '';
    }
  }

  /**
   * 尝试触发垃圾回收
   */
  private attemptGC(): void {
    if (this.gcAttempted) return;
    
    this.gcAttempted = true;
    
    // 检查是否可以手动触发 GC
    if (global.gc) {
      try {
        global.gc();
        console.log('[MemoryMonitor] 已触发垃圾回收');
      } catch {
        // 忽略错误
      }
    }
    
    // 5秒后重置标志
    setTimeout(() => {
      this.gcAttempted = false;
    }, 5000);
  }

  /**
   * 获取阈值配置
   */
  getThresholds(): MemoryThresholds {
    return { ...this.thresholds };
  }

  /**
   * 更新阈值
   */
  setThresholds(thresholds: Partial<MemoryThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }
}

// ============ 内存清理工具 ============

/**
 * 内存清理选项
 */
export interface CleanupOptions {
  /** 清理缓存 */
  clearCaches: boolean;
  /** 清理会话历史 */
  clearSessionHistory: boolean;
  /** 保留最近 N 条消息 */
  keepRecentMessages: number;
}

/**
 * 内存清理结果
 */
export interface CleanupResult {
  /** 清理前内存 */
  beforeMB: number;
  /** 清理后内存 */
  afterMB: number;
  /** 释放内存 */
  freedMB: number;
  /** 清理详情 */
  details: string[];
}

/**
 * 执行内存清理
 * 
 * 注意：这个函数需要传入实际的清理函数
 */
export async function performMemoryCleanup(
  options: CleanupOptions,
  cleanupFns?: {
    clearCaches?: () => Promise<void>;
    trimSessionHistory?: (keepCount: number) => Promise<void>;
  }
): Promise<CleanupResult> {
  const details: string[] = [];
  const before = process.memoryUsage().heapUsed / 1024 / 1024;
  
  // 清理缓存
  if (options.clearCaches && cleanupFns?.clearCaches) {
    await cleanupFns.clearCaches();
    details.push('已清理缓存');
  }
  
  // 裁剪会话历史
  if (options.clearSessionHistory && cleanupFns?.trimSessionHistory) {
    await cleanupFns.trimSessionHistory(options.keepRecentMessages);
    details.push(`已裁剪会话历史（保留最近 ${options.keepRecentMessages} 条）`);
  }
  
  // 尝试触发 GC
  if (global.gc) {
    global.gc();
    details.push('已触发垃圾回收');
  }
  
  const after = process.memoryUsage().heapUsed / 1024 / 1024;
  
  return {
    beforeMB: Math.round(before * 100) / 100,
    afterMB: Math.round(after * 100) / 100,
    freedMB: Math.round((before - after) * 100) / 100,
    details,
  };
}

// ============ 全局实例 ============

let globalMonitor: MemoryMonitor | null = null;

/**
 * 获取全局内存监控器
 */
export function getMemoryMonitor(thresholds?: Partial<MemoryThresholds>): MemoryMonitor {
  if (!globalMonitor) {
    globalMonitor = new MemoryMonitor(thresholds);
  }
  return globalMonitor;
}

/**
 * 格式化内存状态为字符串
 */
export function formatMemoryStatus(status: MemoryStatus): string {
  const levelEmoji = {
    normal: '✅',
    warning: '⚠️',
    danger: '🔴',
    critical: '🚨',
  };
  
  return [
    `${levelEmoji[status.level]} 内存状态: ${status.level.toUpperCase()}`,
    `  堆内存: ${status.heapUsedMB}MB / ${status.heapTotalMB}MB`,
    `  RSS: ${status.rssMB}MB`,
    `  使用率: ${status.usagePercent.toFixed(1)}%`,
  ].join('\n');
}