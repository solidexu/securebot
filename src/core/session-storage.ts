/**
 * 会话持久化
 * 
 * 负责会话的保存、加载和管理
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Session, Message } from './types.js';
import { getSessionsDir } from './config.js';

// ============ 类型定义 ============

/**
 * 持久化的会话数据
 */
export interface PersistedSession {
  /** 会话 Key */
  sessionKey: string;
  /** Agent ID */
  agentId: string;
  /** 对话历史 */
  history: Message[];
  /** 创建时间 (ISO 字符串) */
  createdAt: string;
  /** 更新时间 (ISO 字符串) */
  updatedAt: string;
  /** 会话版本 */
  version: number;
}

/**
 * 会话存储配置
 */
export interface SessionStorageConfig {
  /** 存储目录 */
  storageDir: string;
  /** 是否自动保存 */
  autoSave: boolean;
  /** 最大历史长度 (0 = 无限制) */
  maxHistoryLength: number;
  /** 自动清理天数 (0 = 不清理) */
  autoCleanupDays: number;
}

// ============ 默认配置 ============

export const DEFAULT_SESSION_STORAGE_CONFIG: SessionStorageConfig = {
  storageDir: getSessionsDir(),
  autoSave: true,
  maxHistoryLength: 100,
  autoCleanupDays: 30,
};

/** 当前版本 */
const SESSION_VERSION = 1;

// ============ 会话存储类 ============

/**
 * 会话存储管理器
 */
export class SessionStorage {
  private config: SessionStorageConfig;
  private cache: Map<string, PersistedSession> = new Map();
  private dirty: Set<string> = new Set();
  private initialized: boolean = false;

  constructor(config: Partial<SessionStorageConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_STORAGE_CONFIG, ...config };
  }

  /**
   * 初始化存储
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 确保目录存在
    if (!existsSync(this.config.storageDir)) {
      mkdirSync(this.config.storageDir, { recursive: true });
    }

    // 自动清理过期会话
    if (this.config.autoCleanupDays > 0) {
      await this.cleanupOldSessions();
    }

    this.initialized = true;
  }

  /**
   * 保存会话
   */
  async saveSession(session: Session): Promise<void> {
    if (!this.initialized) await this.initialize();

    const persisted: PersistedSession = {
      sessionKey: session.sessionKey,
      agentId: session.agentId,
      history: this.trimHistory([...session.history]),
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      version: SESSION_VERSION,
    };

    // 更新缓存
    this.cache.set(session.sessionKey, persisted);
    this.dirty.add(session.sessionKey);

    // 写入文件
    const filePath = this.getSessionFilePath(session.sessionKey);
    writeFileSync(filePath, JSON.stringify(persisted, null, 2), 'utf-8');
  }

  /**
   * 加载会话
   */
  async loadSession(sessionKey: string): Promise<Session | null> {
    if (!this.initialized) await this.initialize();

    // 先检查缓存
    const cached = this.cache.get(sessionKey);
    if (cached) {
      return this.toSession(cached);
    }

    // 从文件加载
    const filePath = this.getSessionFilePath(sessionKey);
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const persisted = JSON.parse(content) as PersistedSession;
      
      // 验证版本
      if (persisted.version !== SESSION_VERSION) {
        console.warn(`会话版本不匹配: ${persisted.version} vs ${SESSION_VERSION}`);
        // 尝试迁移
      }

      // 更新缓存
      this.cache.set(sessionKey, persisted);
      
      return this.toSession(persisted);
    } catch (error) {
      console.error(`加载会话失败: ${sessionKey}`, error);
      return null;
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionKey: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();

    // 从缓存移除
    this.cache.delete(sessionKey);
    this.dirty.delete(sessionKey);

    // 删除文件
    const filePath = this.getSessionFilePath(sessionKey);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      return true;
    }
    return false;
  }

  /**
   * 列出所有会话
   */
  async listSessions(): Promise<Array<{
    sessionKey: string;
    agentId: string;
    messageCount: number;
    updatedAt: Date;
  }>> {
    if (!this.initialized) await this.initialize();

    const sessions: Array<{
      sessionKey: string;
      agentId: string;
      messageCount: number;
      updatedAt: Date;
    }> = [];

    const files = readdirSync(this.config.storageDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = join(this.config.storageDir, file);
      try {
        const content = readFileSync(filePath, 'utf-8');
        const persisted = JSON.parse(content) as PersistedSession;
        
        sessions.push({
          sessionKey: persisted.sessionKey,
          agentId: persisted.agentId,
          messageCount: persisted.history.length,
          updatedAt: new Date(persisted.updatedAt),
        });
      } catch {
        // 忽略无效文件
      }
    }

    // 按更新时间排序
    sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    
    return sessions;
  }

  /**
   * 保存所有脏会话
   */
  async saveAll(): Promise<number> {
    let count = 0;
    for (const sessionKey of this.dirty) {
      const persisted = this.cache.get(sessionKey);
      if (persisted) {
        const filePath = this.getSessionFilePath(sessionKey);
        writeFileSync(filePath, JSON.stringify(persisted, null, 2), 'utf-8');
        count++;
      }
    }
    this.dirty.clear();
    return count;
  }

  /**
   * 清除所有会话
   */
  async clearAll(): Promise<number> {
    if (!this.initialized) await this.initialize();

    let count = 0;
    const files = readdirSync(this.config.storageDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = join(this.config.storageDir, file);
      unlinkSync(filePath);
      count++;
    }

    this.cache.clear();
    this.dirty.clear();
    
    return count;
  }

  /**
   * 获取存储路径
   */
  getStorageDir(): string {
    return this.config.storageDir;
  }

  // ============ 私有方法 ============

  /**
   * 获取会话文件路径
   */
  private getSessionFilePath(sessionKey: string): string {
    // 将 sessionKey 转换为安全的文件名
    const safeName = sessionKey.replace(/[:/]/g, '_') + '.json';
    return join(this.config.storageDir, safeName);
  }

  /**
   * 将持久化数据转换为 Session
   */
  private toSession(persisted: PersistedSession): Session {
    return {
      sessionKey: persisted.sessionKey,
      agentId: persisted.agentId,
      history: persisted.history,
      createdAt: new Date(persisted.createdAt),
      updatedAt: new Date(persisted.updatedAt),
    };
  }

  /**
   * 裁剪历史记录
   */
  private trimHistory(history: Message[]): Message[] {
    const max = this.config.maxHistoryLength;
    if (max <= 0 || history.length <= max) {
      return history;
    }
    // 保留最近的 N 条消息
    return history.slice(-max);
  }

  /**
   * 清理过期会话
   */
  private async cleanupOldSessions(): Promise<number> {
    const cutoff = Date.now() - this.config.autoCleanupDays * 24 * 60 * 60 * 1000;
    let cleaned = 0;

    const files = readdirSync(this.config.storageDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = join(this.config.storageDir, file);
      const stat = statSync(filePath);
      
      if (stat.mtime.getTime() < cutoff) {
        unlinkSync(filePath);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// ============ 全局实例 ============

let globalStorage: SessionStorage | null = null;

/**
 * 获取全局会话存储实例
 */
export function getSessionStorage(config?: Partial<SessionStorageConfig>): SessionStorage {
  if (!globalStorage) {
    globalStorage = new SessionStorage(config);
  }
  return globalStorage;
}

/**
 * 重置全局实例（测试用）
 */
export function resetSessionStorage(): void {
  globalStorage = null;
}