/**
 * 刚性布局引擎
 * 
 * 管理固定比例的终端UI布局，防止内容变化导致区域变形
 */

import blessed from 'blessed';
import { EventEmitter } from 'node:events';

export interface LayoutRegion {
  id: string;
  top?: number | string;
  left?: number | string;
  width: number | string;
  height: number | string;
  right?: number | string;
  bottom?: number | string;
  fixed?: boolean;
}

export interface LayoutConfig {
  mainChatWidth: number;
  statusPanelWidth: number;
  mainContentHeight: number;
  inputAreaHeight: number;
}

const DEFAULT_CONFIG: LayoutConfig = {
  mainChatWidth: 70,
  statusPanelWidth: 30,
  mainContentHeight: 85,
  inputAreaHeight: 15,
};

export class RigidLayout extends EventEmitter {
  private screen: blessed.Widgets.Screen;
  private regions: Map<string, blessed.Widgets.BoxElement> = new Map();
  private config: LayoutConfig;
  private lastWidth: number = 0;
  private lastHeight: number = 0;
  private resizeDebounce: ReturnType<typeof setTimeout> | null = null;
  private initialized: boolean = false;

  constructor(config: Partial<LayoutConfig> = {}) {
    super();
    
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,
      dockBorders: true,
      ignoreDockContrictions: true,
      title: 'SecureBot TUI',
    });
    
    this.setupResizeHandler();
  }

  private setupResizeHandler(): void {
    this.screen.on('resize', () => {
      if (this.resizeDebounce) {
        clearTimeout(this.resizeDebounce);
      }
      
      this.resizeDebounce = setTimeout(() => {
        this.enforceLayout();
        this.emit('resize', {
          width: this.screen.width as number,
          height: this.screen.height as number,
        });
      }, 100);
    });
  }

  createRegion(regionConfig: LayoutRegion): blessed.Widgets.BoxElement {
    const box = blessed.box({
      parent: this.screen,
      top: regionConfig.top,
      left: regionConfig.left,
      width: regionConfig.width,
      height: regionConfig.height,
      right: regionConfig.right,
      bottom: regionConfig.bottom,
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
      },
    });
    
    this.regions.set(regionConfig.id, box);
    
    return box;
  }

  enforceLayout(): void {
    const width = this.screen.width as number;
    const height = this.screen.height as number;
    
    if (width === this.lastWidth && height === this.lastHeight) {
      return;
    }
    
    this.lastWidth = width;
    this.lastHeight = height;
    
    const mainWidth = Math.floor(width * this.config.mainChatWidth / 100);
    const statusWidth = width - mainWidth;
    const mainHeight = Math.floor(height * this.config.mainContentHeight / 100);
    const inputHeight = height - mainHeight;
    
    this.regions.forEach((box, id) => {
      switch (id) {
        case 'chat':
          box.width = mainWidth;
          box.height = mainHeight;
          break;
        case 'status':
          box.width = statusWidth;
          box.height = mainHeight;
          break;
        case 'input':
          box.width = mainWidth;
          box.height = Math.max(3, inputHeight);
          box.top = mainHeight;
          break;
        case 'agent-status':
          box.width = statusWidth;
          box.height = Math.floor(mainHeight * 0.25);
          break;
        case 'agent-list':
          box.width = statusWidth;
          box.height = Math.floor(mainHeight * 0.35);
          box.top = Math.floor(mainHeight * 0.25);
          break;
        case 'agent-log':
          box.width = statusWidth;
          box.height = mainHeight - Math.floor(mainHeight * 0.25) - Math.floor(mainHeight * 0.35);
          box.top = Math.floor(mainHeight * 0.25) + Math.floor(mainHeight * 0.35);
          break;
      }
    });
    
    this.screen.render();
  }

  getRegion(id: string): blessed.Widgets.BoxElement | undefined {
    return this.regions.get(id);
  }

  getScreen(): blessed.Widgets.Screen {
    return this.screen;
  }

  initialize(): void {
    if (this.initialized) return;
    
    this.createRegion({
      id: 'chat',
      top: 0,
      left: 0,
      width: `${this.config.mainChatWidth}%`,
      height: `${this.config.mainContentHeight}%`,
    });
    
    this.createRegion({
      id: 'status',
      top: 0,
      right: 0,
      width: `${this.config.statusPanelWidth}%`,
      height: `${this.config.mainContentHeight}%`,
    });
    
    this.createRegion({
      id: 'input',
      bottom: 0,
      left: 0,
      width: `${this.config.mainChatWidth}%`,
      height: `${this.config.inputAreaHeight}%`,
    });
    
    this.createRegion({
      id: 'agent-status',
      top: 0,
      right: 0,
      width: `${this.config.statusPanelWidth}%`,
      height: '25%',
    });
    
    this.createRegion({
      id: 'agent-list',
      top: '25%',
      right: 0,
      width: `${this.config.statusPanelWidth}%`,
      height: '35%',
    });
    
    this.createRegion({
      id: 'agent-log',
      top: '60%',
      right: 0,
      width: `${this.config.statusPanelWidth}%`,
      height: '40%',
    });
    
    this.initialized = true;
    this.enforceLayout();
  }

  setRegionLabel(id: string, label: string): void {
    const box = this.regions.get(id);
    if (box) {
      box.setLabel(label);
      this.screen.render();
    }
  }

  setRegionContent(id: string, content: string): void {
    const box = this.regions.get(id);
    if (box) {
      box.setContent(content);
      this.screen.render();
    }
  }

  getLayoutInfo(): { width: number; height: number; regions: string[] } {
    return {
      width: this.screen.width as number,
      height: this.screen.height as number,
      regions: Array.from(this.regions.keys()),
    };
  }

  destroy(): void {
    if (this.resizeDebounce) {
      clearTimeout(this.resizeDebounce);
    }
    
    this.regions.forEach(box => {
      box.destroy();
    });
    
    this.regions.clear();
    this.screen.destroy();
    this.removeAllListeners();
  }
}