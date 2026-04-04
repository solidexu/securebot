import chokidar from 'chokidar';
import { EventEmitter } from 'node:events';

export interface FileSyncOptions {
  debounceMs?: number;
}

export class CollaborationFileSync extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceMs: number;

  constructor(options: FileSyncOptions = {}) {
    super();
    this.debounceMs = options.debounceMs || 100;
  }

  startWatching(filePath: string): void {
    if (this.watcher) {
      this.stopWatching();
    }

    this.watcher = chokidar.watch(filePath, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 50,
        pollInterval: 20
      }
    });

    this.watcher.on('change', (path) => {
      this.handleFileChange(path);
    });

    this.watcher.on('add', (path) => {
      this.handleFileChange(path);
    });
  }

  watchDelegationFile(delegationId: string, dataDir: string): void {
    const { join } = require('path');
    const delegationsDir = join(dataDir, 'delegations');
    const filePath = join(delegationsDir, `${delegationId}.json`);
    
    if (!this.watcher) {
      this.startWatching(delegationsDir);
    } else {
      this.watcher.add(delegationsDir);
    }
  }

  private handleFileChange(path: string): void {
    // 防抖处理
    const existingTimer = this.debounceTimers.get(path);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(path);
      this.emit('change', path);
    }, this.debounceMs);

    this.debounceTimers.set(path, timer);
  }

  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    // 清理所有定时器
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  isWatching(): boolean {
    return this.watcher !== null;
  }
}