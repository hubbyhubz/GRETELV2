import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/utils";

interface ProjectIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const ProjectIcon = forwardRef<HTMLDivElement, ProjectIconProps>(
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
          fill="var(--primary-600)"
          height={size}
          transition={{ type: "spring", stiffness: 180, damping: 15 }}
          variants={{
            normal: {
              y: 0,
            },
            animate: {
              y: -3,
            },
          }}
          viewBox="0 0 256 256"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M232,64V48a16,16,0,0,0-16-16H40A16,16,0,0,0,24,48V64A16,16,0,0,0,40,80v96H32a8,8,0,0,0,0,16h88v17.38a24,24,0,1,0,16,0V192h88a8,8,0,0,0,0-16h-8V80A16,16,0,0,0,232,64ZM128,240a8,8,0,1,1,8-8A8,8,0,0,1,128,240ZM40,48H216V64H40ZM200,176H56V80H200Z" />
        </motion.svg>
      </div>
    );
  }
);

ProjectIcon.displayName = "ProjectIcon";

export { ProjectIcon };
