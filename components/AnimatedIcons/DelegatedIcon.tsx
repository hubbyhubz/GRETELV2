import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useState } from "react";
import { cn } from "../../lib/utils";

export type DelegatedIconHandle = HTMLDivElement;

interface DelegatedIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const DelegatedIcon = forwardRef<HTMLDivElement, DelegatedIconProps>(
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
            normal: { scale: 1 },
            animate: { scale: 1.05 }
          }}
          viewBox="0 0 24 24"
          width={size}
          height={size}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          stroke="#DC143C"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* User 1 (Left) */}
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          
          {/* User 2 (Right, appearing) */}
          <motion.path
            d="M22 21v-2a4 4 0 0 0-3-3.87"
            variants={{
              normal: { opacity: 0.5, x: 0 },
              animate: { opacity: 1, x: 2, transition: { duration: 0.3 } }
            }}
          />
          <motion.path
            d="M16 3.13a4 4 0 0 1 0 7.75"
            variants={{
              normal: { opacity: 0.5, x: 0 },
              animate: { opacity: 1, x: 2, transition: { duration: 0.3 } }
            }}
          />

          {/* Hand-off Arrow */}
          <motion.path 
            d="M13 12h6m-3-3 3 3-3 3" 
            variants={{
              normal: { pathLength: 0, opacity: 0, x: -5 },
              animate: { 
                pathLength: 1, 
                opacity: 1, 
                x: 0,
                transition: { duration: 0.5, delay: 0.2 } 
              }
            }}
          />
        </motion.svg>
      </div>
    );
  }
);

DelegatedIcon.displayName = "DelegatedIcon";

export { DelegatedIcon };
