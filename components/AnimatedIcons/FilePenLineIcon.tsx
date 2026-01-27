import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/utils";

interface FilePenLineIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const FilePenLineIcon = forwardRef<HTMLDivElement, FilePenLineIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 24, isHovered, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={cn("select-none p-1 rounded-md transition-colors duration-200 flex items-center justify-center", className)}
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
        <svg
          fill="none"
          height={size}
          stroke="var(--primary-600)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Static paper elements */}
          <path d="M3 21h.01" />
          <path d="M3 8a2 2 0 0 1 2-2h10" />
          <path d="M19 21H5a2 2 0 0 1-2-2v-5" />
          <path d="M12 11h.01" />
          <path d="M12 14h2" />
          <path d="M12 17h6" />
          <path d="M8 11h.01" />
          <path d="M8 14h.01" />
          <path d="M8 17h.01" />
          
          {/* Animated pen elements */}
          <motion.g
            variants={{
              normal: { x: 0, y: 0, rotate: 0 },
              hover: {
                x: [0, -1, 1, -1, 0],
                y: [0, 1, -1, 1, 0],
                rotate: [0, -2, 2, -2, 0],
                transition: {
                  duration: 0.5,
                  repeat: Infinity,
                  repeatType: "loop",
                  ease: "easeInOut",
                },
              },
            }}
          >
            <path d="m18 3 3 3" />
            <path d="m13 14 5-5 3-3c.4-.4.3-1.1-.3-1.6l-1.1-1.1c-.6-.6-1.2-.6-1.6 0l-3 3-5 5 2 2Z" />
          </motion.g>
        </svg>
      </motion.div>
    );
  }
);

FilePenLineIcon.displayName = "FilePenLineIcon";

export { FilePenLineIcon };
