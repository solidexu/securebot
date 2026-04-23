/**
 * HITL 中断持久化存储
 *
 * 提供内存和文件两种存储实现
 */

import * as fs from 'fs';
import * as path from 'path';
import { InterruptState } from './hitl-types';
import { GraphState } from './types';

// ============ 存储接口 ============

/**
 * Checkpoint 数据
 */
export interface CheckpointData {
  interrupt: InterruptState;
  graphState: GraphState;
}

/**
 * 中断存储接口
 */
export interface InterruptStore {
  /** 保存中断状态 */
  save(interrupt: InterruptState): Promise<void>;

  /** 加载中断状态 */
  load(threadId: string): Promise<InterruptState | undefined>;

  /** 删除中断状态 */
  delete(threadId: string): Promise<void>;

  /** 列出所有待处理的中断 */
  listPending(): Promise<InterruptState[]>;

  /** 保存图状态快照 */
  saveCheckpoint(threadId: string, state: GraphState): Promise<void>;

  /** 加载图状态快照 */
  loadCheckpoint(threadId: string): Promise<GraphState | undefined>;
}

// ============ 内存存储 ============

/**
 * 内存中断存储
 *
 * 适用于 CLI 单次运行和测试场景
 */
export class MemoryInterruptStore implements InterruptStore {
  private interrupts: Map<string, InterruptState> = new Map();
  private checkpoints: Map<string, GraphState> = new Map();

  async save(interrupt: InterruptState): Promise<void> {
    this.interrupts.set(interrupt.threadId, { ...interrupt });
  }

  async load(threadId: string): Promise<InterruptState | undefined> {
    const item = this.interrupts.get(threadId);
    return item ? { ...item } : undefined;
  }

  async delete(threadId: string): Promise<void> {
    this.interrupts.delete(threadId);
  }

  async listPending(): Promise<InterruptState[]> {
    return Array.from(this.interrupts.values()).filter((i) => i.pending);
  }

  async saveCheckpoint(threadId: string, state: GraphState): Promise<void> {
    // 深拷贝状态
    this.checkpoints.set(threadId, JSON.parse(JSON.stringify(state)));
  }

  async loadCheckpoint(threadId: string): Promise<GraphState | undefined> {
    const state = this.checkpoints.get(threadId);
    return state ? JSON.parse(JSON.stringify(state)) : undefined;
  }

  /** 清空所有数据（测试用） */
  clear(): void {
    this.interrupts.clear();
    this.checkpoints.clear();
  }
}

// ============ 文件存储 ============

/**
 * 文件中断存储配置
 */
export interface FileStoreConfig {
  /** 存储目录路径，默认 .securebot/hitl */
  basePath?: string;
}

/**
 * 文件中断存储
 *
 * 每个 threadId 一个 JSON 文件，支持跨会话恢复
 * 文件结构:
 *   <basePath>/
 *     <threadId>.json          - 中断状态
 *     <threadId>.checkpoint.json - 图状态快照
 */
export class FileInterruptStore implements InterruptStore {
  private basePath: string;

  constructor(config?: FileStoreConfig) {
    this.basePath = config?.basePath || path.join(process.cwd(), '.securebot', 'hitl');
    this.ensureDir();
  }

  /** 确保存储目录存在 */
  private ensureDir(): void {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  /** 中断状态文件路径 */
  private interruptPath(threadId: string): string {
    return path.join(this.basePath, `${this.sanitizeId(threadId)}.json`);
  }

  /** 状态快照文件路径 */
  private checkpointPath(threadId: string): string {
    return path.join(this.basePath, `${this.sanitizeId(threadId)}.checkpoint.json`);
  }

  /** 清理 threadId 中的非法文件名字符 */
  private sanitizeId(threadId: string): string {
    return threadId.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  async save(interrupt: InterruptState): Promise<void> {
    const filePath = this.interruptPath(interrupt.threadId);
    fs.writeFileSync(filePath, JSON.stringify(interrupt, null, 2), 'utf-8');
  }

  async load(threadId: string): Promise<InterruptState | undefined> {
    const filePath = this.interruptPath(threadId);
    if (!fs.existsSync(filePath)) {
      return undefined;
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as InterruptState;
    } catch {
      return undefined;
    }
  }

  async delete(threadId: string): Promise<void> {
    const interruptPath = this.interruptPath(threadId);
    const checkpointPath = this.checkpointPath(threadId);

    if (fs.existsSync(interruptPath)) {
      fs.unlinkSync(interruptPath);
    }
    if (fs.existsSync(checkpointPath)) {
      fs.unlinkSync(checkpointPath);
    }
  }

  async listPending(): Promise<InterruptState[]> {
    const pending: InterruptState[] = [];

    try {
      const files = fs.readdirSync(this.basePath);
      for (const file of files) {
        // 只处理 .json 文件（排除 .checkpoint.json）
        if (!file.endsWith('.json') || file.endsWith('.checkpoint.json')) {
          continue;
        }

        const filePath = path.join(this.basePath, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const interrupt = JSON.parse(content) as InterruptState;
          if (interrupt.pending) {
            pending.push(interrupt);
          }
        } catch {
          // 跳过损坏的文件
        }
      }
    } catch {
      // 目录不存在
    }

    return pending;
  }

  async saveCheckpoint(threadId: string, state: GraphState): Promise<void> {
    const filePath = this.checkpointPath(threadId);
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  async loadCheckpoint(threadId: string): Promise<GraphState | undefined> {
    const filePath = this.checkpointPath(threadId);
    if (!fs.existsSync(filePath)) {
      return undefined;
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as GraphState;
    } catch {
      return undefined;
    }
  }
}
