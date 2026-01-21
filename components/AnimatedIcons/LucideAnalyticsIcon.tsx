import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

interface LucideAnalyticsIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const LucideAnalyticsIcon = forwardRef<HTMLDivElement, LucideAnalyticsIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        initial={{ rotateY: 0, scale: 1 }}
        whileHover={{
          rotateY: 10,
          scale: 1.05,
        }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        {...props}
      >
        <TrendingUp size={size} color="#DC143C" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideAnalyticsIcon.displayName = "LucideAnalyticsIcon";

export { LucideAnalyticsIcon };
