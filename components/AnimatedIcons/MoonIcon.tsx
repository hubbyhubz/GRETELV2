import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/utils";

interface MoonIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const MoonIcon = forwardRef<HTMLDivElement, MoonIconProps>(
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
          transition={{ type: "spring", stiffness: 150, damping: 12 }}
          variants={{
            normal: {
              rotate: 0,
            },
            animate: {
              rotate: -15,
            },
          }}
          viewBox="0 0 256 256"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M233.54,142.23a8,8,0,0,0-8-2,88.08,88.08,0,0,1-109.8-109.8,8,8,0,0,0-10-10,104.84,104.84,0,0,0-52.91,37A104,104,0,0,0,136,224a103.09,103.09,0,0,0,62.52-20.88,104.84,104.84,0,0,0,37-52.91A8,8,0,0,0,233.54,142.23ZM188.9,190.34A88,88,0,0,1,65.66,67.11a89,89,0,0,1,31.4-26A106,106,0,0,0,96,56,104.11,104.11,0,0,0,200,160a106,106,0,0,0,14.92-1.06A89,89,0,0,1,188.9,190.34Z" />
        </motion.svg>
      </motion.div>
    );
  }
);

MoonIcon.displayName = "MoonIcon";

export { MoonIcon };
