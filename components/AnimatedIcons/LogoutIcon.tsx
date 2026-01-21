import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useState } from "react";
import { cn } from "../../lib/utils";

interface LogoutIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const LogoutIcon = forwardRef<HTMLDivElement, LogoutIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 24, isHovered: externalIsHovered, ...props }, ref) => {
    const [internalIsHovered, setInternalIsHovered] = useState(false);
    const isHovered = externalIsHovered !== undefined ? externalIsHovered : internalIsHovered;

    const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
      setInternalIsHovered(true);
      onMouseEnter?.(e);
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
      setInternalIsHovered(false);
      onMouseLeave?.(e);
    };

    return (
      <motion.div
        ref={ref}
        className={cn("select-none p-1 rounded-md transition-colors duration-200", className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        whileTap={{ scale: 0.95 }}
        {...props}
      >
        <motion.svg
          animate={isHovered ? "animate" : "normal"}
          variants={{
            normal: { x: 0 },
            animate: { x: 0 }
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
          <motion.path 
            d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" 
            variants={{
                normal: { rotateY: 0, originX: 0 },
                animate: { 
                    rotateY: -25, 
                    transition: { duration: 0.5, ease: "easeInOut" }
                }
            }}
          />
          <polyline points="16 17 21 12 16 7" />
          <motion.line 
            x1="21" x2="9" y1="12" y2="12" 
            variants={{
                normal: { x: 0, opacity: 1 },
                animate: { 
                    x: 5, 
                    opacity: [1, 0, 1],
                    transition: { duration: 1, repeat: Infinity }
                }
            }}
          />
        </motion.svg>
      </motion.div>
    );
  }
);

LogoutIcon.displayName = "LogoutIcon";

export { LogoutIcon };
