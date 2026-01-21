import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useState } from "react";
import { cn } from "../../lib/utils";

interface FeedbackIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const FeedbackIcon = forwardRef<HTMLDivElement, FeedbackIconProps>(
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
            normal: { x: 0, y: 0, opacity: 1 },
            animate: {
              x: 20,
              y: -20,
              opacity: 0,
              transition: {
                duration: 0.6,
                ease: "easeIn",
                repeat: Infinity,
                repeatDelay: 0.2
              }
            }
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
          <path d="m22 2-7 20-4-9-9-4Z" />
          <path d="M22 2 11 13" />
        </motion.svg>
      </motion.div>
    );
  }
);

FeedbackIcon.displayName = "FeedbackIcon";

export { FeedbackIcon };
