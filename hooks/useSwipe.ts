import { useState } from 'react';

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeMove?: (dx: number, dy: number) => void;
  onSwipeEnd?: () => void;
  threshold?: number; // Minimum distance to trigger swipe
  maxVerticalRatio?: number; // Max vertical movement allowed relative to horizontal
  ignoreScrollable?: boolean; // Whether to ignore swipes on horizontally scrollable elements
}

export const useSwipe = ({
  onSwipeLeft,
  onSwipeRight,
  onSwipeMove,
  onSwipeEnd,
  threshold = 50,
  maxVerticalRatio = 0.8, // Increased tolerance for vertical movement slightly
  ignoreScrollable = true,
}: SwipeOptions) => {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);

  // Helper to detect if an element or its parents are horizontally scrollable
  const isScrollable = (element: HTMLElement | null): boolean => {
    if (!element || element === document.body || element === document.documentElement) return false;
    
    const style = window.getComputedStyle(element);
    const overflowX = style.overflowX;
    const isScrollableX = overflowX === 'auto' || overflowX === 'scroll';
    
    // If explicitly scrollable and content actually overflows
    if (isScrollableX && element.scrollWidth > element.clientWidth) {
      return true;
    }
    
    return isScrollable(element.parentElement);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    // We only care about single touch
    if (e.targetTouches.length !== 1) return;

    if (ignoreScrollable && isScrollable(e.target as HTMLElement)) {
      // Don't track if we are on a scrollable element
      setTouchStart(null);
      return;
    }

    setTouchEnd(null);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    });
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return;
    
    const currentX = e.targetTouches[0].clientX;
    const currentY = e.targetTouches[0].clientY;

    setTouchEnd({
      x: currentX,
      y: currentY,
    });

    if (onSwipeMove) {
      onSwipeMove(currentX - touchStart.x, currentY - touchStart.y);
    }
  };

  const onTouchEnd = () => {
    if (onSwipeEnd) onSwipeEnd();
    
    if (!touchStart || !touchEnd) {
      setTouchStart(null);
      setTouchEnd(null);
      return;
    }

    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = touchStart.y - touchEnd.y;
    const absDistanceX = Math.abs(distanceX);
    const absDistanceY = Math.abs(distanceY);

    // Validate if it's a horizontal swipe
    // 1. Must exceed threshold
    // 2. Horizontal distance must be significantly larger than vertical distance
    if (absDistanceX > threshold && absDistanceY / absDistanceX < maxVerticalRatio) {
      if (distanceX > 0) {
        // Swiped Left
        onSwipeLeft && onSwipeLeft();
      } else {
        // Swiped Right
        onSwipeRight && onSwipeRight();
      }
    }
    
    setTouchStart(null);
    setTouchEnd(null);
  };

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
};
