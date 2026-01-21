"use client";

import type { Variants } from "framer-motion";
import { motion, useAnimation, useReducedMotion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

import { cn } from "../../lib/utils";

export interface BellIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface BellIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const BellIcon = forwardRef<BellIconHandle, BellIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, isHovered, ...props }, ref) => {
    const controls = useAnimation();
    const reduceMotion = useReducedMotion();
    const isControlledRef = useRef(false);

    const start = useCallback(() => {
      if (reduceMotion) {
        void controls.start("normal");
        return;
      }
      void controls.start("animate");
    }, [controls, reduceMotion]);

    const stop = useCallback(() => {
      void controls.start("normal");
    }, [controls]);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return { startAnimation: start, stopAnimation: stop };
    });

    useEffect(() => {
      if (typeof isHovered !== "boolean") return;
      if (isHovered) start();
      else stop();
    }, [isHovered, start, stop]);

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isControlledRef.current) start();
        onMouseEnter?.(e);
      },
      [onMouseEnter, start]
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isControlledRef.current) stop();
        onMouseLeave?.(e);
      },
      [onMouseLeave, stop]
    );

    const svgVariants: Variants = {
      normal: { rotate: 0 },
      animate: { rotate: [0, -10, 10, -10, 0] },
    };

    return (
      <div className={cn(className)} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} {...props}>
        <motion.svg
          animate={controls}
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          transition={{ duration: 0.5, ease: "easeInOut" }}
          variants={svgVariants}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </motion.svg>
      </div>
    );
  }
);

BellIcon.displayName = "BellIcon";

export { BellIcon };

