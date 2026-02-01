import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef, useState } from "react";
import { cn } from "../../lib/utils";

interface ReminderIconProps extends HTMLMotionProps<"div"> {
  size?: number;
  isHovered?: boolean;
}

const ReminderIcon = forwardRef<HTMLDivElement, ReminderIconProps>(
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
        {...props}
      >
        <motion.svg
          animate={isHovered ? "hover" : "normal"}
          variants={{
            normal: { rotate: 0 },
            hover: {
              rotate: [0, -20, 20, -20, 20, 0],
              transition: {
                duration: 0.5,
                ease: "easeInOut"
              }
            }
          }}
          viewBox="0 0 24 24"
          width={size}
          height={size}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          stroke="var(--primary-600)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </motion.svg>
      </motion.div>
    );
  }
);

ReminderIcon.displayName = "ReminderIcon";

export { ReminderIcon };
