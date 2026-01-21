import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useState } from "react";
import { cn } from "../../lib/utils";

interface BriefcaseIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const BriefcaseIcon = forwardRef<HTMLDivElement, BriefcaseIconProps>(
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
            animate: {
              scale: 1.05,
              transition: {
                staggerChildren: 0.2
              }
            },
          }}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          stroke="#DC143C"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          <motion.path 
            d="M4 18h16" 
            variants={{
              normal: { pathLength: 0, opacity: 0 },
              animate: { 
                pathLength: 1, 
                opacity: 1,
                transition: { duration: 0.5, ease: "easeInOut" }
              }
            }}
          />
          <motion.path 
            d="M4 14h10" 
            variants={{
              normal: { pathLength: 0, opacity: 0 },
              animate: { 
                pathLength: 1, 
                opacity: 1,
                transition: { duration: 0.5, delay: 0.2, ease: "easeInOut" }
              }
            }}
          />
        </motion.svg>
      </div>
    );
  }
);

BriefcaseIcon.displayName = "BriefcaseIcon";

export { BriefcaseIcon };
