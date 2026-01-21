import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useState } from "react";
import { cn } from "../../lib/utils";

interface GiftIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isHovered?: boolean;
}

const GiftIcon = forwardRef<HTMLDivElement, GiftIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 24, isHovered: externalIsHovered, ...props }, ref) => {
    const [internalIsHovered, setInternalIsHovered] = useState(false);
    const isHovered = externalIsHovered !== undefined ? externalIsHovered : internalIsHovered;

    const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
      setInternalIsHovered(true);
      onMouseEnter?.(e);
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
      setInternalIsHovered(false);
      onMouseLeave?.(e);
    };

    return (
      <motion.div
        ref={ref}
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
        <motion.svg
          animate={isHovered ? "animate" : "normal"}
          variants={{
            normal: { scale: 1 },
            animate: {
              scale: 1.05,
              transition: {
                staggerChildren: 0.1
              }
            },
          }}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          stroke="#DC143C"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="8" width="18" height="4" rx="1" />
          <path d="M12 8v13" />
          <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
          <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
          <motion.path
            d="m19 5-1.9 5.8a2 2 0 0 1-1.2 1.2L10 14l5.8 1.9a2 2 0 0 1 1.2 1.2L19 23l1.9-5.8a2 2 0 0 1 1.2-1.2L28 14l-5.8-1.9a2 2 0 0 1-1.2-1.2Z"
            variants={{
                normal: { scale: 0, opacity: 0 },
                animate: { 
                    scale: [0, 0.5, 0], 
                    opacity: [0, 1, 0],
                    rotate: [0, 45, 90],
                    x: -2,
                    y: -5,
                    transition: { duration: 1, repeat: Infinity } 
                }
            }}
            fill="#DC143C"
            stroke="none"
          />
        </motion.svg>
      </motion.div>
    );
  }
);

GiftIcon.displayName = "GiftIcon";

export { GiftIcon };
