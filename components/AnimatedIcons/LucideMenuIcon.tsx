import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef, useEffect } from "react";
import { cn } from "../../lib/utils";

export interface LucideMenuIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface LucideMenuIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const LucideMenuIcon = forwardRef<LucideMenuIconHandle, LucideMenuIconProps>(
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
          <motion.line
            x1="4"
            x2="20"
            y1="12"
            y2="12"
            variants={{
              normal: { opacity: 1, x: 0 },
              animate: { opacity: 0, x: -10 }
            }}
            animate={controls}
            transition={{ duration: 0.2 }}
          />
          <motion.line
            x1="4"
            x2="20"
            y1="6"
            y2="6"
            variants={{
              normal: { y: 6, rotate: 0 },
              animate: { y: 12, rotate: 45 }
            }}
            animate={controls}
            transition={{ duration: 0.3 }}
          />
          <motion.line
            x1="4"
            x2="20"
            y1="18"
            y2="18"
            variants={{
              normal: { y: 18, rotate: 0 },
              animate: { y: 12, rotate: -45 }
            }}
            animate={controls}
            transition={{ duration: 0.3 }}
          />
        </svg>
      </div>
    );
  }
);

LucideMenuIcon.displayName = "LucideMenuIcon";

export { LucideMenuIcon };
