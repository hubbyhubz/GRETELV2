import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useState } from "react";
import { cn } from "../../lib/utils";

interface TrashIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const TrashIcon = forwardRef<HTMLDivElement, TrashIconProps>(
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
            normal: { y: 0 },
            animate: { y: -2 }
          }}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          stroke="var(--primary-600)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <motion.path 
            d="M3 6h18" 
            variants={{
              normal: { rotate: 0, originX: "50%", originY: "50%" },
              animate: { 
                rotate: -15, 
                originX: "100%", 
                y: -2,
                transition: { duration: 0.3 }
              }
            }}
          />
          <motion.path 
            d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" 
            variants={{
              normal: { rotate: 0, originX: "50%", originY: "100%" },
              animate: { 
                rotate: -15, 
                originX: "100%", 
                y: -2,
                transition: { duration: 0.3 }
              }
            }}
          />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </motion.svg>
      </div>
    );
  }
);

TrashIcon.displayName = "TrashIcon";

export { TrashIcon };
