import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/utils";

interface AnalyticsIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const AnalyticsIcon = forwardRef<HTMLDivElement, AnalyticsIconProps>(
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
          fill="var(--primary-600)"
          height={size}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          variants={{
            normal: {
              rotateY: 0,
            },
            animate: {
              rotateY: 10,
            },
          }}
          viewBox="0 0 256 256"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M96,104a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H104A8,8,0,0,1,96,104Zm8,40h64a8,8,0,0,0,0-16H104a8,8,0,0,0,0,16Zm128,48a32,32,0,0,1-32,32H88a32,32,0,0,1-32-32V64a16,16,0,0,0-32,0c0,5.74,4.83,9.62,4.88,9.66h0A8,8,0,0,1,24,88a7.89,7.89,0,0,1-4.79-1.61h0C18.05,85.54,8,77.61,8,64A32,32,0,0,1,40,32H176a32,32,0,0,1,32,32V168h8a8,8,0,0,1,4.8,1.6C222,170.46,232,178.39,232,192ZM96.26,173.48A8.07,8.07,0,0,1,104,168h88V64a16,16,0,0,0-16-16H67.69A31.71,31.71,0,0,1,72,64V192a16,16,0,0,0,32,0c0-5.74-4.83-9.62-4.88-9.66A7.82,7.82,0,0,1,96.26,173.48ZM216,192a12.58,12.58,0,0,0-3.23-8h-94a26.92,26.92,0,0,1,1.21,8,31.82,31.82,0,0,1-4.29,16H200A16,16,0,0,0,216,192Z" />
        </motion.svg>
      </motion.div>
    );
  }
);

AnalyticsIcon.displayName = "AnalyticsIcon";

export { AnalyticsIcon };
