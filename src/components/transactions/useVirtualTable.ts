import { useState, useEffect, useRef, useCallback } from 'react';

interface UseVirtualTableOptions {
  itemCount: number;
  itemHeight?: number;
  overscan?: number;
  minItemsToVirtualize?: number;
}

export function useVirtualTable({
  itemCount,
  itemHeight = 54,
  overscan = 6,
  minItemsToVirtualize = 40,
}: UseVirtualTableOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  // Monitor resize of container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      if (container) {
        setViewportHeight(container.clientHeight || 600);
      }
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(() => {
      updateHeight();
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Handle scroll events with requestAnimationFrame throttling
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    window.requestAnimationFrame(() => {
      setScrollTop(container.scrollTop);
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // If item count is small, don't virtualize to avoid any layout jitter
  const isVirtual = itemCount >= minItemsToVirtualize;

  if (!isVirtual) {
    return {
      containerRef,
      startIndex: 0,
      endIndex: itemCount,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      isVirtual: false,
    };
  }

  const rawStartIndex = Math.floor(scrollTop / itemHeight);
  const startIndex = Math.max(0, rawStartIndex - overscan);

  const visibleCount = Math.ceil(viewportHeight / itemHeight);
  const endIndex = Math.min(itemCount, rawStartIndex + visibleCount + overscan);

  const topSpacerHeight = startIndex * itemHeight;
  const bottomSpacerHeight = Math.max(0, (itemCount - endIndex) * itemHeight);

  return {
    containerRef,
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
    isVirtual: true,
  };
}
