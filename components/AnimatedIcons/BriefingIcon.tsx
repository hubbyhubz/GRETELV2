import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useState } from "react";
import { cn } from "../../lib/utils";

interface BriefingIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const BriefingIcon = forwardRef<HTMLDivElement, BriefingIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 24, isHovered: externalIsHovered, ...props }, ref) => {
    const [internalIsHovered, setInternalIsHovered] = useState(false);
    const isHovered = externalIsHovered !== undefined ? externalIsHovered : internalIsHovered;

    return (
      <motion.div
        ref={ref}
        className={cn("select-none p-1 rounded-md transition-colors duration-200", className)}
        onMouseEnter={(e) => {
          onMouseEnter?.(e);
          setInternalIsHovered(true);
        }}
        onMouseLeave={(e) => {
          onMouseLeave?.(e);
          setInternalIsHovered(false);
        }}
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
          fill="none"
          stroke="#DC143C"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          height={size}
          variants={{
            normal: {
              rotateY: 0,
            },
            animate: {
              rotateY: 180,
              transition: {
                duration: 0.6,
                ease: "easeInOut"
              }
            },
          }}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
          style={{ transformOrigin: "center" }}
        >
           <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
           <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </motion.svg>
      </motion.div>
    );
  }
);

BriefingIcon.displayName = "BriefingIcon";

export { BriefingIcon };
