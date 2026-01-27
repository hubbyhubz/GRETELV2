import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

interface LucideAlertIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const LucideAlertIcon = forwardRef<HTMLDivElement, LucideAlertIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        animate={{
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          repeatType: "loop",
        }}
        {...props}
      >
        <AlertCircle size={size} color="var(--primary-600)" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideAlertIcon.displayName = "LucideAlertIcon";

export { LucideAlertIcon };
