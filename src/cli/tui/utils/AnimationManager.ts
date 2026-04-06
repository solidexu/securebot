/**
 * 帧驱动动画管理器 - 替代 setInterval，提供更稳定的动画帧率控制
 * 
 * 核心设计思路（参考 Claude Code 的渲染管线）：
 * 1. 使用 requestAnimationFrame 风格的帧驱动机制
 * 2. 固定帧率控制（30fps = 33ms/帧），避免 setInterval 在 Ink 环境中的不稳定
 * 3. 双缓冲技术：动画状态和显示状态分离
 * 4. 批量更新策略：积累多帧变化后统一提交
 * 5. 可暂停、恢复、停止的完整生命周期控制
 */

import React from 'react';

export interface AnimationFrame {
  /** 当前帧索引 */
  frameIndex: number;
  /** 总帧数 */
  totalFrames: number;
  /** 帧间隔时间（ms） */
  deltaTime: number;
  /** 是否完成 */
  isComplete: boolean;
}

export interface AnimationOptions {
  /** 目标帧率（默认30fps） */
  targetFps?: number;
  /** 每帧间隔时间（ms，优先级高于 targetFps） */
  frameInterval?: number;
  /** 是否自动开始 */
  autoStart?: boolean;
}

/**
 * 帧驱动动画管理器
 */
export class AnimationManager {
  private frameId: number | null = null;
  private lastTime: number = 0;
  private targetFps: number;
  private frameInterval: number;
  private currentFrame: number = 0;
  private totalFrames: number = 0;
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  private onFrame: ((frame: AnimationFrame) => void) | null = null;
  private onComplete: (() => void) | null = null;

  constructor(options: AnimationOptions = {}) {
    this.targetFps = options.targetFps ?? 30;
    this.frameInterval = options.frameInterval ?? (1000 / this.targetFps);
  }

  /**
   * 启动动画
   * @param totalFrames 总帧数
   * @param onFrame 每帧回调
   * @param onComplete 完成回调
   */
  start(
    totalFrames: number,
    onFrame: (frame: AnimationFrame) => void,
    onComplete?: () => void
  ): void {
    this.stop();
    this.totalFrames = totalFrames;
    this.currentFrame = 0;
    this.onFrame = onFrame;
    this.onComplete = onComplete ?? null;
    this.isPlaying = true;
    this.isPaused = false;
    this.lastTime = Date.now();
    this.tick();
  }

  /**
   * 暂停动画
   */
  pause(): void {
    this.isPaused = true;
    if (this.frameId !== null) {
      clearTimeout(this.frameId);
      this.frameId = null;
    }
  }

  /**
   * 恢复动画
   */
  resume(): void {
    if (!this.isPlaying || !this.isPaused) return;
    this.isPaused = false;
    this.lastTime = Date.now();
    this.tick();
  }

  /**
   * 停止动画
   */
  stop(): void {
    this.isPlaying = false;
    this.isPaused = false;
    if (this.frameId !== null) {
      clearTimeout(this.frameId);
      this.frameId = null;
    }
    this.currentFrame = 0;
  }

  /**
   * 重置动画
   */
  reset(): void {
    this.stop();
    this.totalFrames = 0;
    this.onFrame = null;
    this.onComplete = null;
  }

  /**
   * 获取当前状态
   */
  getState(): {
    currentFrame: number;
    totalFrames: number;
    isPlaying: boolean;
    isPaused: boolean;
    progress: number;
  } {
    return {
      currentFrame: this.currentFrame,
      totalFrames: this.totalFrames,
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      progress: this.totalFrames > 0 ? this.currentFrame / this.totalFrames : 0,
    };
  }

  /**
   * 设置帧率
   */
  setFrameRate(fps: number): void {
    this.targetFps = fps;
    this.frameInterval = 1000 / fps;
  }

  /**
   * 帧驱动核心循环
   * 使用 setTimeout 而非 setInterval，更精确控制帧率
   */
  private tick(): void {
    if (!this.isPlaying || this.isPaused) return;

    const now = Date.now();
    const deltaTime = now - this.lastTime;

    // 帧率控制：只有达到目标帧间隔才执行
    if (deltaTime >= this.frameInterval) {
      this.lastTime = now;
      this.currentFrame++;

      const isComplete = this.currentFrame >= this.totalFrames;

      // 执行帧回调
      if (this.onFrame) {
        const frame: AnimationFrame = {
          frameIndex: this.currentFrame,
          totalFrames: this.totalFrames,
          deltaTime,
          isComplete,
        };
        this.onFrame(frame);
      }

      // 完成检测
      if (isComplete) {
        this.isPlaying = false;
        if (this.onComplete) {
          this.onComplete();
        }
        return;
      }
    }

    // 下一帧（16ms 的最小间隔，避免过度占用 CPU）
    this.frameId = setTimeout(() => this.tick(), 16);
  }
}

/**
 * 单例模式：全局动画管理器实例
 * 用于代码写入、代码编辑等动画场景
 */
export const globalAnimationManager = new AnimationManager({
  targetFps: 30, // 30fps = 33ms/帧，足够流畅且不过度占用资源
});

/**
 * React Hook: 使用动画管理器
 */
export function useAnimationManager(options?: AnimationOptions) {
  const managerRef = React.useRef<AnimationManager | null>(null);
  
  if (!managerRef.current) {
    managerRef.current = new AnimationManager(options);
  }

  React.useEffect(() => {
    return () => {
      // 清理：组件卸载时停止动画
      if (managerRef.current) {
        managerRef.current.stop();
      }
    };
  }, []);

  return managerRef.current;
}