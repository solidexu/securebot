import { useEffect, useRef, useCallback } from 'react';

export interface MouseData {
  button: number;    // 0=left, 1=middle, 2=right, 64=wheel up, 65=wheel down
  x: number;         // 1-indexed column
  y: number;         // 1-indexed row
  press: boolean;    // true=down, false=up
}

export interface UseMouseOptions {
  onMouseEvent?: (data: MouseData) => void;
  isActive?: boolean;
}

// ============ 全局状态 ============
let originalEmit: typeof process.stdin.emit | null = null;
let wrapperActive = false;
const handlers: Set<(data: MouseData) => void> = new Set();

/** 滚轮回调（由 InputBox 注册） */
export function setWheelCallback(cb: ((deltaY: number) => void) | null): void {
  globalWheelCallback = cb;
}
let globalWheelCallback: ((deltaY: number) => void) | null = null;

/** 检查鼠标支持是否已启用 */
export function isMouseEnabled(): boolean {
  return wrapperActive;
}

// 滚轮速度检测
let lastWheelTime = 0;
const FAST_SCROLL_THRESHOLD_MS = 50;
const SLOW_SCROLL_LINES = 1;
const FAST_SCROLL_LINES = 5;

function handleEmit(event: string | symbol, ...args: unknown[]): boolean {
  if (event === 'data' && wrapperActive) {
    const data = args[0] as Buffer | string;
    const str = typeof data === 'string' ? data : data.toString();

    // 完整 SGR 鼠标序列: \x1b[<button;x;yM 或 \x1b[<button;x;ym
    const sgrRe = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/;
    const match = sgrRe.exec(str);

    if (match) {
      const button = parseInt(match[1]!, 10);
      const x = parseInt(match[2]!, 10);
      const y = parseInt(match[3]!, 10);
      const press = match[4] === 'M';

      const mouseData: MouseData = { button, x, y, press };

      // 通知所有组件处理器（如 ChatPanel 的点击）
      for (const handler of handlers) {
        handler(mouseData);
      }

      // 滚轮事件 — 调用全局滚轮回调（不传给 Ink！）
      if (button === 64 || button === 65) {
        const now = Date.now();
        const timeDelta = now - lastWheelTime;
        const isFastScroll = lastWheelTime > 0 && timeDelta < FAST_SCROLL_THRESHOLD_MS;
        const scrollLines = isFastScroll ? FAST_SCROLL_LINES : SLOW_SCROLL_LINES;
        lastWheelTime = now;

        if (button === 64) {
          globalWheelCallback?.(-scrollLines); // 向上
        } else if (button === 65) {
          globalWheelCallback?.(scrollLines);  // 向下
        }
      }

      // ★ 所有 SGR 鼠标事件完全消耗，不传给 Ink（防止乱码）
      return true;
    }

    // 不完整的 SGR 序列 — 消耗，防止字符泄漏到输入框
    if (/\x1b\[<\d*[;]?\d*[;]?\d*[Mm]?/.test(str)) {
      return true;
    }
  }

  return originalEmit!.call(process.stdin, event, ...args);
}

/**
 * 终端鼠标支持 Hook
 *
 * 拦截 process.stdin.emit 过滤 SGR 鼠标序列：
 * - 滚轮事件: 通过 setWheelCallback 回调通知 InputBox
 * - 点击事件: 通过 onMouseEvent 回调通知组件
 * - 所有鼠标事件完全消耗，不泄漏到 Ink
 */
export function useMouse(options: UseMouseOptions = {}) {
  const { onMouseEvent, isActive = true } = options;
  const optsRef = useRef(options);
  optsRef.current = options;

  const handlerRef = useCallback((data: MouseData) => {
    optsRef.current.onMouseEvent?.(data);
  }, []);

  useEffect(() => {
    if (!isActive) return;
    if (!originalEmit) {
      originalEmit = process.stdin.emit.bind(process.stdin);
      process.stdin.emit = handleEmit;
    }

    wrapperActive = true;
    handlers.add(handlerRef);

    // 启用 SGR 鼠标模式
    process.stdout.write('\x1b[?1006h\x1b[?1000h');

    return () => {
      handlers.delete(handlerRef);
      if (handlers.size === 0) {
        wrapperActive = false;
      }
    };
  }, [isActive, handlerRef]);
}
