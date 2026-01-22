import type { Variants } from "framer-motion";
import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/utils";

interface XIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const PATH_VARIANTS: Variants = {
  normal: {
    opacity: 1,
    pathLength: 1,
  },
  animate: {
    opacity: [0, 1],
    pathLength: [0, 1],
  },
};

export interface XIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

const XIcon = forwardRef<HTMLDivElement, XIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 24, isHovered, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(className)}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          cursor: 'pointer',
          width: `${size}px`,
          height: `${size}px`,
          pointerEvents: 'none'
        }}
        {...props}
      >
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
          style={{
            display: 'block',
            margin: 'auto'
          }}
        >
          <motion.path
            animate={isHovered ? "animate" : "normal"}
            d="M5 5L19 19"
            variants={PATH_VARIANTS}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          />
          <motion.path
            animate={isHovered ? "animate" : "normal"}
            d="M19 5L5 19"
            transition={{ delay: 0.15, duration: 0.3, ease: "easeInOut" }}
            variants={PATH_VARIANTS}
          />
        </svg>
      </div>
    );
  }
);

XIcon.displayName = "XIcon";

export { XIcon };
