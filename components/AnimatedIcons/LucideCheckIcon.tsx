import { motion } from "framer-motion";
import { CheckSquare } from "lucide-react";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

interface LucideCheckIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const LucideCheckIcon = forwardRef<HTMLDivElement, LucideCheckIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        initial={{ scale: 1, rotate: 0 }}
        whileHover={{
          scale: [1, 1.15, 1],
          rotate: [0, -5, 5, -5, 0],
          transition: { duration: 0.4 }
        }}
        {...props}
      >
        <CheckSquare size={size} color="#DC143C" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideCheckIcon.displayName = "LucideCheckIcon";

export { LucideCheckIcon };
