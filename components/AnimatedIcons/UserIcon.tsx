import type { Variants } from "framer-motion";
import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef, useEffect } from "react";

import { cn } from "../../lib/utils";

export interface UserIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface UserIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const BODY_VARIANTS: Variants = {
  normal: {
    y: 0,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 13,
    },
  },
  animate: {
    y: [-2, 0],
    transition: {
      delay: 0.1,
      type: "spring",
      stiffness: 200,
      damping: 13,
    },
  },
};

const HEAD_VARIANTS: Variants = {
  normal: {
    y: 0,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 13,
    },
  },
  animate: {
    y: [2, 0],
    transition: {
      delay: 0.1,
      type: "spring",
      stiffness: 200,
      damping: 13,
    },
  },
};

const UserIcon = forwardRef<UserIconHandle, UserIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, isHovered, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;

      return {
        startAnimation: () => controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    useEffect(() => {
        if (isHovered) {
            controls.start("animate");
        } else {
            controls.start("normal");
        }
    }, [isHovered, controls]);

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(e);
        } else {
          if (isHovered === undefined) {
             controls.start("animate");
          }
        }
      },
      [controls, onMouseEnter, isHovered]
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e);
        } else {
           if (isHovered === undefined) {
             controls.start("normal");
           }
        }
      },
      [controls, onMouseLeave, isHovered]
    );

    return (
      <motion.div
        className={cn("select-none p-1 rounded-md transition-colors duration-200", className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
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
          stroke="#DC143C"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.path
             d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"
             variants={BODY_VARIANTS}
             animate={controls}
             initial="normal"
          />
          <motion.circle 
             cx="12" cy="7" r="4" 
             variants={HEAD_VARIANTS}
             animate={controls}
             initial="normal"
          />
        </svg>
      </motion.div>
    );
  }
);

UserIcon.displayName = "UserIcon";

export { UserIcon };
