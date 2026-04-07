/**
 * 滚动控制 Hook
 */
import { useCallback, useRef } from 'react';
import { MESSAGE_WINDOW_HEIGHT } from '../constants/index.js';

interface UseScrollOptions {
  setScroll: (offset: number) => void;
  windowHeight?: number;
}

export function useScroll(options: UseScrollOptions) {
  const { setScroll, windowHeight = MESSAGE_WINDOW_HEIGHT } = options;

  // 滚动状态
  const scrollRef = useRef(0);

  // 向上滚动
  const scrollUp = useCallback(
    (step: number = 1) => {
      const newOffset = Math.max(0, scrollRef.current - step);
      scrollRef.current = newOffset;
      setScroll(newOffset);
    },
    [setScroll]
  );

  // 向下滚动
  const scrollDown = useCallback(
    (step: number = 1, maxLines?: number) => {
      const maxOffset = maxLines ? Math.max(0, maxLines - windowHeight) : Infinity;
      const newOffset = Math.min(maxOffset, scrollRef.current + step);
      scrollRef.current = newOffset;
      setScroll(newOffset);
    },
    [setScroll, windowHeight]
  );

  // 翻页上
  const pageUp = useCallback(
    () => scrollUp(windowHeight),
    [scrollUp, windowHeight]
  );

  // 翻页下
  const pageDown = useCallback(
    (maxLines?: number) => scrollDown(windowHeight, maxLines),
    [scrollDown, windowHeight]
  );

  // 滚动到底部
  const scrollToBottom = useCallback(
    (maxLines?: number) => {
      const maxOffset = maxLines ? Math.max(0, maxLines - windowHeight) : 0;
      scrollRef.current = maxOffset;
      setScroll(maxOffset);
    },
    [setScroll, windowHeight]
  );

  // 滚动到顶部
  const scrollToTop = useCallback(() => {
    scrollRef.current = 0;
    setScroll(0);
  }, [setScroll]);

  // 设置滚动位置
  const setScrollPosition = useCallback(
    (offset: number) => {
      scrollRef.current = offset;
      setScroll(offset);
    },
    [setScroll]
  );

  // 获取当前滚动位置
  const getScrollPosition = useCallback(() => scrollRef.current, []);

  return {
    scrollUp,
    scrollDown,
    pageUp,
    pageDown,
    scrollToTop,
    scrollToBottom,
    setScrollPosition,
    getScrollPosition,
  };
}