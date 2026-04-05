/**
 * 双缓冲渲染引擎
 * 
 * 实现内容缓冲区和脏区域标记机制，减少界面闪烁
 */

import type blessed from 'blessed';
import { EventEmitter } from 'node:events';

export interface RenderRegion {
  id: string;
  content: string;
  lastRenderTime: number;
  needsUpdate: boolean;
}

export interface RenderOptions {
  maxFps?: number;
  batchSize?: number;
  debounceMs?: number;
}

const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  maxFps: 60,
  batchSize: 5,
  debounceMs: 16,
};

export class RenderEngine extends EventEmitter {
  private screen: blessed.Widgets.Screen;
  private buffer: Map<string, string> = new Map();
  private pendingContent: Map<string, string> = new Map();
  private dirtyRegions: Set<string> = new Set();
  private lastRenderTime: number = 0;
  private renderScheduled: boolean = false;
  private options: RenderOptions;
  private renderQueue: Array<{ regionId: string; content: string }> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private stats = {
    totalUpdates: 0,
    skippedUpdates: 0,
    batchUpdates: 0,
    averageRenderTime: 0,
  };

  constructor(screen: blessed.Widgets.Screen, options: Partial<RenderOptions> = {}) {
    super();
    this.screen = screen;
    this.options = { ...DEFAULT_RENDER_OPTIONS, ...options };
  }

  queueContent(regionId: string, content: string): void {
    const now = Date.now();
    const minInterval = 1000 / this.options.maxFps!;
    
    this.pendingContent.set(regionId, content);
    this.dirtyRegions.add(regionId);
    this.stats.totalUpdates++;
    
    if (!this.renderScheduled) {
      const timeSinceLastRender = now - this.lastRenderTime;
      
      if (timeSinceLastRender >= minInterval) {
        this.scheduleImmediateRender();
      } else {
        this.scheduleDelayedRender(minInterval - timeSinceLastRender);
      }
    }
  }

  appendContent(regionId: string, newContent: string): void {
    const existingContent = this.buffer.get(regionId) || '';
    const combinedContent = existingContent + newContent;
    
    this.queueContent(regionId, combinedContent);
  }

  private scheduleImmediateRender(): void {
    this.renderScheduled = true;
    
    setImmediate(() => {
      this.flush();
      this.renderScheduled = false;
    });
  }

  private scheduleDelayedRender(delay: number): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    
    this.renderScheduled = true;
    
    this.flushTimer = setTimeout(() => {
      this.flush();
      this.renderScheduled = false;
      this.flushTimer = null;
    }, delay);
  }

  flush(): void {
    const startTime = Date.now();
    
    if (this.dirtyRegions.size === 0) {
      return;
    }
    
    const regionsToUpdate = Array.from(this.dirtyRegions);
    
    if (regionsToUpdate.length > this.options.batchSize!) {
      this.processBatchUpdate(regionsToUpdate);
      this.stats.batchUpdates++;
    } else {
      this.processIndividualUpdates(regionsToUpdate);
    }
    
    const renderTime = Date.now() - startTime;
    this.updateStats(renderTime);
    
    this.lastRenderTime = Date.now();
    this.dirtyRegions.clear();
    
    this.screen.render();
    
    this.emit('render', {
      regionsUpdated: regionsToUpdate.length,
      renderTime,
    });
  }

  private processBatchUpdate(regions: string[]): void {
    for (const regionId of regions) {
      const content = this.pendingContent.get(regionId);
      if (content !== undefined) {
        this.buffer.set(regionId, content);
        this.updateRegionBox(regionId, content);
      }
    }
  }

  private processIndividualUpdates(regions: string[]): void {
    for (const regionId of regions) {
      const content = this.pendingContent.get(regionId);
      if (content !== undefined) {
        this.buffer.set(regionId, content);
        this.updateRegionBox(regionId, content);
      }
    }
  }

  private updateRegionBox(regionId: string, content: string): void {
    const box = this.screen.children.find(
      (child: any) => child.options?.id === regionId || child.options?.label?.includes(regionId)
    ) as blessed.Widgets.BoxElement | undefined;
    
    if (box && typeof box.setContent === 'function') {
      box.setContent(content);
      
      if (box.options?.scrollable) {
        box.setScrollPerc(100);
      }
    }
  }

  private updateStats(renderTime: number): void {
    const count = this.stats.totalUpdates;
    this.stats.averageRenderTime = 
      (this.stats.averageRenderTime * (count - 1) + renderTime) / count;
  }

  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  getBufferContent(regionId: string): string | undefined {
    return this.buffer.get(regionId);
  }

  clearBuffer(regionId?: string): void {
    if (regionId) {
      this.buffer.delete(regionId);
      this.pendingContent.delete(regionId);
      this.dirtyRegions.delete(regionId);
    } else {
      this.buffer.clear();
      this.pendingContent.clear();
      this.dirtyRegions.clear();
    }
  }

  forceRender(): void {
    this.flush();
  }

  setMaxFps(fps: number): void {
    this.options.maxFps = fps;
  }

  destroy(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    
    this.buffer.clear();
    this.pendingContent.clear();
    this.dirtyRegions.clear();
    this.removeAllListeners();
  }
}