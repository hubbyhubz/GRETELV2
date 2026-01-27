import { motion } from "framer-motion";
import { Play } from "lucide-react";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

interface LucidePlayIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const LucidePlayIcon = forwardRef<HTMLDivElement, LucidePlayIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        initial={{ scale: 1 }}
        whileHover={{
          scale: 1.1,
        }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 150, damping: 10 }}
        {...props}
      >
        <Play size={size} color="var(--primary-600)" strokeWidth={2} fill="var(--primary-600)" />
      </motion.div>
    );
  }
);

LucidePlayIcon.displayName = "LucidePlayIcon";

export { LucidePlayIcon };
