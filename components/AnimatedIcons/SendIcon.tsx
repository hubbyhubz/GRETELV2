import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/utils";

interface SendIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const SendIcon = forwardRef<HTMLDivElement, SendIconProps>(
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
          fill="none"
          height={size}
          stroke="#DC143C"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          transition={{ type: "spring", stiffness: 150, damping: 12 }}
          variants={{
            normal: {
              x: 0,
              rotate: 0,
            },
            animate: {
              x: 5,
              rotate: -15,
            },
          }}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M22 2L11 13" />
          <path d="M22 2L15 22L11 13L2 9L22 2" />
        </motion.svg>
      </div>
    );
  }
);

SendIcon.displayName = "SendIcon";

export { SendIcon };
