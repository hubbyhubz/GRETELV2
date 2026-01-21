"use client";

import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

interface EyeIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const EyeIcon = forwardRef<HTMLDivElement, EyeIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, isHovered, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={className}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        {...props}
      >
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
          style={{ color: '#DC143C' }}
        >
          <motion.path
            animate={isHovered ? "animate" : "normal"}
            d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
            style={{ originY: "50%" }}
            transition={{ type: "keyframes", duration: 0.4, ease: "easeInOut" }}
            variants={{
              normal: { scaleY: 1, opacity: 1 },
              animate: { scaleY: [1, 0.1, 1], opacity: [1, 0.3, 1] },
            }}
          />
          <motion.circle
            animate={isHovered ? "animate" : "normal"}
            cx="12"
            cy="12"
            r="3"
            transition={{ type: "keyframes", duration: 0.4, ease: "easeInOut" }}
            variants={{
              normal: { scale: 1, opacity: 1 },
              animate: { scale: [1, 0.3, 1], opacity: [1, 0.3, 1] },
            }}
          />
        </svg>
      </div>
    );
  }
);

EyeIcon.displayName = "EyeIcon";

export { EyeIcon };
