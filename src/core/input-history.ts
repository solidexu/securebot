/**
 * 输入历史管理器
 * 
 * 负责用户输入历史的持久化和加载
 * 支持上下键浏览历史记录
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRootDir } from './config.js';

export interface InputHistoryConfig {
  maxHistorySize: number;
  storageDir: string;
}

export const DEFAULT_INPUT_HISTORY_CONFIG: InputHistoryConfig = {
  maxHistorySize: 100,
  storageDir: '',
};

const HISTORY_FILE = 'input-history.json';

export class InputHistoryManager {
  private config: InputHistoryConfig;
  private history: string[] = [];
  private initialized: boolean = false;

  constructor(config: Partial<InputHistoryConfig> = {}) {
    const rootDir = getRootDir();
    this.config = {
      maxHistorySize: config.maxHistorySize ?? DEFAULT_INPUT_HISTORY_CONFIG.maxHistorySize,
      storageDir: config.storageDir ?? join(rootDir, 'data'),
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!existsSync(this.config.storageDir)) {
      mkdirSync(this.config.storageDir, { recursive: true });
    }

    await this.loadHistory();
    this.initialized = true;
  }

  private async loadHistory(): Promise<void> {
    const filePath = this.getHistoryFilePath();
    
    if (!existsSync(filePath)) {
      this.history = [];
      return;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as string[];
      this.history = data.filter(item => item && item.trim().length > 0);
    } catch {
      this.history = [];
    }
  }

  async saveHistory(): Promise<void> {
    const filePath = this.getHistoryFilePath();
    
    try {
      writeFileSync(filePath, JSON.stringify(this.history, null, 2), 'utf-8');
    } catch (error) {
      console.error('保存输入历史失败:', error);
    }
  }

  addEntry(entry: string): void {
    if (!entry || entry.trim().length === 0) return;
    
    const trimmedEntry = entry.trim();
    
    const existingIndex = this.history.indexOf(trimmedEntry);
    if (existingIndex !== -1) {
      this.history.splice(existingIndex, 1);
    }
    
    this.history.push(trimmedEntry);
    
    if (this.history.length > this.config.maxHistorySize) {
      this.history = this.history.slice(-this.config.maxHistorySize);
    }
  }

  getHistory(): string[] {
    return [...this.history];
  }

  getHistorySize(): number {
    return this.history.length;
  }

  clearHistory(): void {
    this.history = [];
  }

  async clearHistoryAndSave(): Promise<void> {
    this.clearHistory();
    await this.saveHistory();
  }

  private getHistoryFilePath(): string {
    return join(this.config.storageDir, HISTORY_FILE);
  }
}

let globalInputHistory: InputHistoryManager | null = null;

export function getInputHistoryManager(config?: Partial<InputHistoryConfig>): InputHistoryManager {
  if (!globalInputHistory) {
    globalInputHistory = new InputHistoryManager(config);
  }
  return globalInputHistory;
}

export function resetInputHistoryManager(): void {
  globalInputHistory = null;
}