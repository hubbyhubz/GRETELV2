import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useState } from "react";
import { cn } from "../../lib/utils";

interface LucidePlusIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const LucidePlusIcon = forwardRef<HTMLDivElement, LucidePlusIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 24, isHovered: externalIsHovered, ...props }, ref) => {
    const [internalIsHovered, setInternalIsHovered] = useState(false);
    const isHovered = externalIsHovered !== undefined ? externalIsHovered : internalIsHovered;

    return (
      <div
        ref={ref}
        className={cn(className)}
        onMouseEnter={(e) => {
          onMouseEnter?.(e);
          setInternalIsHovered(true);
        }}
        onMouseLeave={(e) => {
          onMouseLeave?.(e);
          setInternalIsHovered(false);
        }}
        {...props}
      >
        <motion.svg
          animate={isHovered ? "animate" : "normal"}
          variants={{
            normal: { rotate: 0, scale: 1 },
            animate: { 
              rotate: 90, 
              scale: 1.1,
              transition: { 
                type: "spring",
                stiffness: 300,
                damping: 15
              }
            }
          }}
          viewBox="0 0 24 24"
          width={size}
          height={size}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          stroke="#DC143C"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </motion.svg>
      </div>
    );
  }
);

LucidePlusIcon.displayName = "LucidePlusIcon";

export { LucidePlusIcon };
