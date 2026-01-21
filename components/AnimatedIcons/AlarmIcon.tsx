import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/utils";

interface AlarmIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const AlarmIcon = forwardRef<HTMLDivElement, AlarmIconProps>(
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
          transition={{ type: "keyframes", duration: 0.5, ease: "easeInOut" }}
          variants={{
            normal: {
              rotate: 0,
            },
            animate: {
              rotate: [0, -10, 10, -10, 10, 0],
            },
          }}
          viewBox="0 0 256 256"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M128,40a96,96,0,1,0,96,96A96.11,96.11,0,0,0,128,40Zm0,176a80,80,0,1,1,80-80A80.09,80.09,0,0,1,128,216ZM61.66,37.66l-32,32A8,8,0,0,1,18.34,58.34l32-32A8,8,0,0,1,61.66,37.66Zm176,32a8,8,0,0,1-11.32,0l-32-32a8,8,0,0,1,11.32-11.32l32,32A8,8,0,0,1,237.66,69.66ZM184,128a8,8,0,0,1,0,16H128a8,8,0,0,1-8-8V80a8,8,0,0,1,16,0v48Z" />
        </motion.svg>
      </div>
    );
  }
);

AlarmIcon.displayName = "AlarmIcon";

export { AlarmIcon };
