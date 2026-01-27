import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef, useEffect } from "react";
import { cn } from "../../lib/utils";

export interface LucideMessageCircleIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface LucideMessageCircleIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const LucideMessageCircleIcon = forwardRef<LucideMessageCircleIconHandle, LucideMessageCircleIconProps>(
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
          <motion.path
            d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"
            variants={{
              normal: { scale: 1, rotate: 0 },
              animate: { 
                scale: [1, 1.05, 1],
                rotate: [0, -2, 2, 0],
                transition: { duration: 0.5, ease: "easeInOut" }
              }
            }}
            animate={controls}
            style={{ originX: "50%", originY: "50%" }}
          />
        </svg>
      </div>
    );
  }
);

LucideMessageCircleIcon.displayName = "LucideMessageCircleIcon";

export { LucideMessageCircleIcon };
