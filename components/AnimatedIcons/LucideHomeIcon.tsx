import { motion } from "framer-motion";
import { Home } from "lucide-react";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

interface LucideHomeIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const LucideHomeIcon = forwardRef<HTMLDivElement, LucideHomeIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        initial={{ scale: 1, y: 0 }}
        whileHover={{
          scale: 1.05,
          y: -1,
        }}
        transition={{ type: "spring", stiffness: 150, damping: 12 }}
        {...props}
      >
        <Home size={size} color="#DC143C" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideHomeIcon.displayName = "LucideHomeIcon";

export { LucideHomeIcon };
