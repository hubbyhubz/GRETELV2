import { motion } from "framer-motion";
import { Square } from "lucide-react";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

interface LucideStopIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const LucideStopIcon = forwardRef<HTMLDivElement, LucideStopIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        initial={{ scale: 1 }}
        whileHover={{
          scale: [1, 0.95, 1],
          transition: { duration: 0.3 }
        }}
        {...props}
      >
        <Square size={size} color="#DC143C" strokeWidth={2} fill="#DC143C" />
      </motion.div>
    );
  }
);

LucideStopIcon.displayName = "LucideStopIcon";

export { LucideStopIcon };
