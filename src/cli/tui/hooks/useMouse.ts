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

let originalEmit: typeof process.stdin.emit | null = null;
let wrapperActive = false;
const handlers: Set<(data: MouseData) => void> = new Set();

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

      for (const handler of handlers) {
        handler(mouseData);
      }

      // 滚轮事件 (button 64/65) — 放行给 index.tsx 的 raw mouseHandler
      if (button === 64 || button === 65) {
        return originalEmit!.call(process.stdin, event, ...args);
      }

      // 其他鼠标事件 (click/drag) — 完全消耗，不传给 Ink
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
 * - 滚轮事件 (btn 64/65): 放行给 index.tsx 的滚轮处理器
 * - 点击/拖拽事件: 消耗，触发 onMouseEvent 回调
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

    // 启用 SGR 鼠标模式（如果尚未启用）
    process.stdout.write('\x1b[?1006h\x1b[?1000h');

    return () => {
      handlers.delete(handlerRef);
      if (handlers.size === 0) {
        wrapperActive = false;
        // 不主动禁用，让 index.tsx 的 cleanup 统一处理
      }
    };
  }, [isActive, handlerRef]);
}
