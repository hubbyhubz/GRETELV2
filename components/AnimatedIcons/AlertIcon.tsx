import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/utils";

interface AlertIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const AlertIcon = forwardRef<HTMLDivElement, AlertIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 24, isHovered, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(className)}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        {...props}
      >
        <motion.svg
          animate={isHovered ? "animate" : "normal"}
          fill="#DC143C"
          height={size}
          variants={{
            normal: {
              scale: 1,
              transition: {
                repeat: 0,
              },
            },
            animate: {
              scale: 1.1,
              transition: {
                type: "spring",
                stiffness: 300,
                damping: 10,
                repeat: Infinity,
                repeatType: "reverse",
              },
            },
          }}
          viewBox="0 0 256 256"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z" />
        </motion.svg>
      </div>
    );
  }
);

AlertIcon.displayName = "AlertIcon";

export { AlertIcon };
