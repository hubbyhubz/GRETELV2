import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef, useEffect } from "react";
import { cn } from "../../lib/utils";

export interface LucideClipboardListIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface LucideClipboardListIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const LucideClipboardListIcon = forwardRef<LucideClipboardListIconHandle, LucideClipboardListIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 24, isHovered, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    useEffect(() => {
      if (isHovered) {
        controls.start("animate");
      } else {
        controls.start("normal");
      }
    }, [isHovered, controls]);

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isControlledRef.current) {
          controls.start("animate");
          onMouseEnter?.(e);
        }
      },
      [controls, onMouseEnter]
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isControlledRef.current) {
          controls.start("normal");
          onMouseLeave?.(e);
        }
      },
      [controls, onMouseLeave]
    );

    return (
      <div
        className={cn(
          "select-none p-1 rounded-md transition-colors duration-200 flex items-center justify-center",
          className
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--primary-600)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          
          <motion.path
            d="M12 11h4"
            variants={{
              normal: { pathLength: 1, opacity: 1, x: 0 },
              animate: { pathLength: [0, 1], opacity: [0, 1], x: [0, 0] }
            }}
            transition={{ duration: 0.3, delay: 0.1 }}
            animate={controls}
          />
          <motion.path
            d="M12 16h4"
            variants={{
              normal: { pathLength: 1, opacity: 1, x: 0 },
              animate: { pathLength: [0, 1], opacity: [0, 1], x: [0, 0] }
            }}
            transition={{ duration: 0.3, delay: 0.2 }}
            animate={controls}
          />
          <motion.path
            d="M8 11h.01"
            variants={{
              normal: { scale: 1 },
              animate: { scale: [0, 1.5, 1] }
            }}
            transition={{ duration: 0.3, delay: 0.1 }}
            animate={controls}
          />
          <motion.path
            d="M8 16h.01"
            variants={{
              normal: { scale: 1 },
              animate: { scale: [0, 1.5, 1] }
            }}
            transition={{ duration: 0.3, delay: 0.2 }}
            animate={controls}
          />
        </svg>
      </div>
    );
  }
);

LucideClipboardListIcon.displayName = "LucideClipboardListIcon";

export { LucideClipboardListIcon };
