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

/** 滚轮回调（由 InputBox 注册） */
export function setWheelCallback(cb: ((deltaY: number) => void) | null): void {
  globalWheelCallback = cb;
}
let globalWheelCallback: ((deltaY: number) => void) | null = null;

/** 检查鼠标支持是否已启用 */
export function isMouseEnabled(): boolean {
  return mouseHandlers.size > 0;
}

// 滚轮速度检测
let lastWheelTime = 0;
const FAST_SCROLL_THRESHOLD_MS = 50;
const SLOW_SCROLL_LINES = 1;
const FAST_SCROLL_LINES = 5;

// 鼠标事件处理器
const mouseHandlers = new Set<(data: MouseData) => void>();

// SGR 缓冲区
let sgrBuffer = '';
let collectingMouse = false;
let collectTimer: ReturnType<typeof setTimeout> | null = null;
const COLLECT_TIMEOUT_MS = 200;

function abortCollect() {
  collectingMouse = false;
  sgrBuffer = '';
  if (collectTimer) { clearTimeout(collectTimer); collectTimer = null; }
}

/** 处理数据块，提取并处理 SGR 鼠标序列 */
function processChunk(str: string) {
  if (collectingMouse) {
    sgrBuffer += str;
  } else {
    const idx = str.indexOf('\x1b[<');
    if (idx >= 0) {
      sgrBuffer = str.slice(idx);
      collectingMouse = true;
      collectTimer = setTimeout(abortCollect, COLLECT_TIMEOUT_MS);
    } else {
      return; // 无鼠标数据
    }
  }

  // 匹配完整 SGR: \x1b[<button;x;yM 或 \x1b[<button;x;ym
  const sgrRe = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/;
  const match = sgrRe.exec(sgrBuffer);

  if (match) {
    const button = parseInt(match[1]!, 10);
    const x = parseInt(match[2]!, 10);
    const y = parseInt(match[3]!, 10);
    const press = match[4] === 'M';

    const consumedEnd = match.index + match[0].length;
    const remaining = sgrBuffer.slice(consumedEnd);
    abortCollect();

    const mouseData: MouseData = { button, x, y, press };
    for (const handler of mouseHandlers) {
      handler(mouseData);
    }

    // 滚轮
    if (button === 64 || button === 65) {
      const now = Date.now();
      const timeDelta = now - lastWheelTime;
      const isFastScroll = lastWheelTime > 0 && timeDelta < FAST_SCROLL_THRESHOLD_MS;
      const scrollLines = isFastScroll ? FAST_SCROLL_LINES : SLOW_SCROLL_LINES;
      lastWheelTime = now;
      if (button === 64) globalWheelCallback?.(-scrollLines);
      else if (button === 65) globalWheelCallback?.(scrollLines);
    }

    // 递归处理剩余
    if (remaining && remaining.includes('\x1b[<')) {
      processChunk(remaining);
    }
    return;
  }

  // 不完整序列，继续收集
  if (sgrBuffer.length > 50) abortCollect();
}

// 保存原始 push 方法
let originalPush: typeof process.stdin.push | null = null;

/**
 * 终端鼠标支持 Hook
 *
 * ★ 拦截 process.stdin.push() —— 数据进入流的唯一入口
 *
 * 数据流: 终端输入 → push(chunk) → buffer → read() → emit('data', chunk)
 *
 * 拦截 push() 可以在数据进入缓冲区之前过滤 SGR 序列，
 * 确保 Ink 的 keypress 解析器永远不会看到鼠标事件数据。
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

    mouseHandlers.add(handlerRef);

    if (mouseHandlers.size === 1) {
      // 第一个处理器：拦截 push()
      if (!originalPush) {
        originalPush = process.stdin.push.bind(process.stdin);

        process.stdin.push = function (this: typeof process.stdin, chunk: Buffer | string | null): boolean {
          if (!chunk) return originalPush!.call(process.stdin, chunk);

          const str = typeof chunk === 'string' ? chunk : chunk.toString();

          // 检测 SGR 鼠标序列
          const mouseIdx = str.indexOf('\x1b[<');
          if (mouseIdx >= 0) {
            // 有鼠标序列
            if (mouseIdx > 0) {
              // 前面有非鼠标数据，正常 push
              const prefix = str.slice(0, mouseIdx);
              originalPush!.call(process.stdin, prefix);
            }
            // 处理鼠标序列（消耗掉，不 push 给 Ink）
            const mousePart = str.slice(mouseIdx);
            processChunk(mousePart);
            return true;
          }

          // 无鼠标数据，正常 push
          return originalPush!.call(process.stdin, chunk);
        };
      }

      // 启用 SGR 鼠标模式
      process.stdout.write('\x1b[?1006h\x1b[?1000h');
    }

    return () => {
      mouseHandlers.delete(handlerRef);
      if (mouseHandlers.size === 0) {
        if (originalPush) {
          process.stdin.push = originalPush;
        }
        process.stdout.write('\x1b[?1000l\x1b[?1006l');
        abortCollect();
      }
    };
  }, [isActive, handlerRef]);
}
