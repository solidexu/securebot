/**
 * 进度动画模块
 * 
 * 在长时间操作时显示加载动画
 */

import chalk from 'chalk';

// 动画帧
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class ProgressAnimation {
  private frameIndex = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private message: string;
  private startTime = 0;
  private abortSignal?: AbortSignal;
  private stopped = false;
  private abortHandler?: () => void;
  private hintShown = false; // 是否已显示提示
  private hintInterval: ReturnType<typeof setInterval> | null = null;
  
  constructor(message: string = '思考中', abortSignal?: AbortSignal) {
    this.message = message;
    this.abortSignal = abortSignal;
  }
  
  /**
   * 开始动画
   */
  start(): void {
    if (this.stopped) return;
    
    this.startTime = Date.now();
    this.frameIndex = 0;
    
    // 隐藏光标
    process.stdout.write('\x1B[?25l');
    
    // 监听 abort 信号（保存 handler 以便清理）
    if (this.abortSignal) {
      this.abortHandler = () => {
        this.stop();
      };
      this.abortSignal.addEventListener('abort', this.abortHandler);
    }
    
    this.interval = setInterval(() => {
      // 检查是否已被中断
      if (this.abortSignal?.aborted) {
        this.stop();
        return;
      }
      this.render();
    }, 80);
    
    // 30秒后显示提示
    this.hintInterval = setInterval(() => {
      if (!this.hintShown && Date.now() - this.startTime > 30000) {
        this.hintShown = true;
        console.log(chalk.gray('\n  提示: 按 Ctrl+C 可中断当前操作'));
      }
    }, 10000);
    
    // 立即显示第一帧
    this.render();
  }
  
  /**
   * 更新消息
   */
  update(message: string): void {
    this.message = message;
    if (!this.stopped) {
      this.render();
    }
  }
  
  /**
   * 渲染当前帧
   */
  private render(): void {
    if (this.stopped) return;
    
    const frame = SPINNER_FRAMES[this.frameIndex];
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    
    // 清除当前行并写入新内容
    process.stdout.write('\r' + chalk.cyan(frame) + ' ' + chalk.gray(this.message) + ' ' + chalk.gray(`(${elapsed}s)`));
    
    this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
  }
  
  /**
   * 停止动画
   */
  stop(finalMessage?: string): void {
    if (this.stopped) return;
    this.stopped = true;
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    if (this.hintInterval) {
      clearInterval(this.hintInterval);
      this.hintInterval = null;
    }
    
    // ★ 移除 abort 监听器
    if (this.abortSignal && this.abortHandler) {
      this.abortSignal.removeEventListener('abort', this.abortHandler);
      this.abortHandler = undefined;
    }
    
    // 显示光标
    process.stdout.write('\x1B[?25h');
    
    // 清除当前行
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
    
    // 显示最终消息
    if (finalMessage) {
      console.log(finalMessage);
    }
  }
  
  /**
   * 停止并显示成功
   */
  success(message: string = '完成'): void {
    this.stop(chalk.green('✓ ') + message);
  }
  
  /**
   * 停止并显示错误
   */
  error(message: string = '失败'): void {
    this.stop(chalk.red('✗ ') + message);
  }
}

/**
 * 进度条
 */
export class ProgressBar {
  private total: number;
  private current = 0;
  private width = 30;
  private startTime = 0;
  
  constructor(total: number, width = 30) {
    this.total = total;
    this.width = width;
  }
  
  /**
   * 开始进度条
   */
  start(): void {
    this.current = 0;
    this.startTime = Date.now();
    this.render();
  }
  
  /**
   * 更新进度
   */
  update(current: number): void {
    this.current = Math.min(current, this.total);
    this.render();
    
    if (this.current >= this.total) {
      process.stdout.write('\n');
    }
  }
  
  /**
   * 增加
   */
  increment(): void {
    this.update(this.current + 1);
  }
  
  /**
   * 渲染进度条
   */
  private render(): void {
    const percent = Math.floor((this.current / this.total) * 100);
    const filled = Math.floor((this.current / this.total) * this.width);
    const empty = this.width - filled;
    
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    
    const bar = chalk.cyan('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    
    process.stdout.write(
      `\r${bar} ${chalk.bold(`${percent}%`)} ${chalk.gray(`(${this.current}/${this.total})`)} ${chalk.gray(`${elapsed}s`)}`
    );
  }
}

/**
 * 简单的加载指示器
 */
export function showLoadingIndicator(message: string = '加载中'): ProgressAnimation {
  const animation = new ProgressAnimation(message);
  animation.start();
  return animation;
}

/**
 * 带进度的任务执行
 */
export async function withProgress<T>(
  message: string,
  task: () => Promise<T>
): Promise<T> {
  const animation = new ProgressAnimation(message);
  animation.start();
  
  try {
    const result = await task();
    animation.success();
    return result;
  } catch (error) {
    animation.error();
    throw error;
  }
}