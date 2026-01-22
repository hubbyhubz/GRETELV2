import { useRef } from "react";

type SwipeHandlers = {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
};

type UseSwipeOptions = {
  threshold?: number;
  onSwipeMove?: (dx: number, dy: number) => void;
  onSwipeEnd?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
};

export function useSwipe(options: UseSwipeOptions = {}): SwipeHandlers {
  const {
    threshold = 50,
    onSwipeMove,
    onSwipeEnd,
    onSwipeLeft,
    onSwipeRight,
  } = options;

  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const lastDxRef = useRef(0);
  const lastDyRef = useRef(0);

  return {
    onTouchStart: (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      lastDxRef.current = 0;
      lastDyRef.current = 0;
    },
    onTouchMove: (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      if (startXRef.current === null || startYRef.current === null) return;

      const dx = touch.clientX - startXRef.current;
      const dy = touch.clientY - startYRef.current;
      lastDxRef.current = dx;
      lastDyRef.current = dy;
      onSwipeMove?.(dx, dy);
    },
    onTouchEnd: () => {
      const dx = lastDxRef.current;
      const dy = lastDyRef.current;

      startXRef.current = null;
      startYRef.current = null;
      lastDxRef.current = 0;
      lastDyRef.current = 0;

      if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) onSwipeRight?.();
        else onSwipeLeft?.();
      }

      onSwipeEnd?.();
    },
  };
}

