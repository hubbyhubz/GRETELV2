"use client";

import type { Variants } from "framer-motion";
import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useState } from "react";

import { cn } from "../../lib/utils";

interface CircleCheckIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const PATH_VARIANTS: Variants = {
  normal: {
    y: 0,
    scale: 1,
  },
  animate: {
    y: -5,
    scale: 1.1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 10
    }
  },
};

const CircleCheckIcon = forwardRef<HTMLDivElement, CircleCheckIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, isHovered: externalIsHovered, ...props }, ref) => {
    const [internalIsHovered, setInternalIsHovered] = useState(false);
    const isHovered = externalIsHovered !== undefined ? externalIsHovered : internalIsHovered;

    return (
      <motion.div
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
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        animate={isHovered ? "animate" : "normal"}
        variants={PATH_VARIANTS}
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
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </motion.div>
    );
  }
);

CircleCheckIcon.displayName = "CircleCheckIcon";

export { CircleCheckIcon };
