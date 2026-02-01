import type { Variants } from "framer-motion";
import { motion, useAnimation, type HTMLMotionProps } from "framer-motion";
import { forwardRef, useCallback, useImperativeHandle, useRef, useEffect } from "react";

import { cn } from "../../lib/utils";

export interface SecurityIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface SecurityIconProps extends HTMLMotionProps<"div"> {
  size?: number;
  isHovered?: boolean;
}

const CHECK_VARIANTS: Variants = {
  normal: {
    pathLength: 1,
    opacity: 1,
  },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: {
      duration: 0.3,
      ease: "easeInOut",
    },
  },
};

const SecurityIcon = forwardRef<SecurityIconHandle, SecurityIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, isHovered, ...props }, ref) => {
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
        if (isControlledRef.current) {
          onMouseEnter?.(e);
        } else {
          if (isHovered === undefined) {
             controls.start("animate");
          }
        }
      },
      [controls, onMouseEnter, isHovered]
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e);
        } else {
           if (isHovered === undefined) {
             controls.start("normal");
           }
        }
      },
      [controls, onMouseLeave, isHovered]
    );

    return (
      <motion.div
        className={cn("select-none p-1 rounded-md transition-colors duration-200", className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        animate={isHovered ? "hover" : "normal"}
        whileTap="tap"
        variants={{
          normal: { scale: 1, filter: "brightness(1)" },
          hover: { 
            scale: 1.05, 
            filter: "brightness(1.1)", 
            transition: { duration: 0.3, ease: "easeInOut" }
          },
          tap: { scale: 0.95 }
        }}
        {...props}
      >
        <svg
          fill="none"
          height={size}
          stroke="var(--primary-600)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          <motion.path 
            d="m9 12 2 2 4-4" 
            variants={CHECK_VARIANTS}
            animate={controls}
            initial="normal"
          />
        </svg>
      </motion.div>
    );
  }
);

SecurityIcon.displayName = "SecurityIcon";

export { SecurityIcon };
