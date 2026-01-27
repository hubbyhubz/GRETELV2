import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useState } from "react";
import { cn } from "../../lib/utils";

interface CalendarIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const CalendarIcon = forwardRef<HTMLDivElement, CalendarIconProps>(
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
          fill="var(--primary-600)"
          height={size}
          variants={{
            normal: { scale: 1, opacity: 1 },
            animate: {
              scale: [1, 1.1, 1],
              opacity: [1, 0.8, 1],
              transition: {
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }
            },
          }}
          viewBox="0 0 256 256"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Zm-96-88v64a8,8,0,0,1-16,0V132.94l-4.42,2.22a8,8,0,0,1-7.16-14.32l16-8A8,8,0,0,1,112,120Zm59.16,30.45L152,176h16a8,8,0,0,1,0,16H136a8,8,0,0,1-6.4-12.8l28.78-38.37A8,8,0,1,0,145.07,132a8,8,0,1,1-13.85-8A24,24,0,0,1,176,136,23.76,23.76,0,0,1,171.16,150.45Z" />
        </motion.svg>
      </div>
    );
  }
);

CalendarIcon.displayName = "CalendarIcon";

export { CalendarIcon };
