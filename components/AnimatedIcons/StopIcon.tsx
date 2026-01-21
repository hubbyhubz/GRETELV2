import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/utils";

interface StopIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const StopIcon = forwardRef<HTMLDivElement, StopIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 24, isHovered, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={cn("select-none p-1 rounded-md transition-colors duration-200", className)}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
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
        <motion.svg
          animate={isHovered ? "animate" : "normal"}
          fill="#DC143C"
          height={size}
          variants={{
            normal: { scale: 1 },
            animate: { 
              scale: 1, // Let parent handle scale, or add inner scale if needed. 
              // Original code had inner scale 1.05. If we scale parent, inner scale multiplies.
              // To match AppIcon, we scale parent. Inner scale should probably remain 1.
              // But if we want to support the original logic:
              // The original logic was: normal: scale 1, animate: scale 1.05.
              // If we do that on the container, we don't need it on the SVG.
            }
          }}
          viewBox="0 0 256 256"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M200,40H56A16,16,0,0,0,40,56V200a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm0,160H56V56H200V200Z" />
        </motion.svg>
      </motion.div>
    );
  }
);

StopIcon.displayName = "StopIcon";

export { StopIcon };
