import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { forwardRef } from "react";

type LucideWarningIconProps = Omit<
  ComponentPropsWithoutRef<typeof motion.div>,
  "children"
> & {
  size?: number;
};

const LucideWarningIcon = forwardRef<HTMLDivElement, LucideWarningIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        animate={{
          scale: [1, 1.08, 1],
        }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          repeatType: "loop",
        }}
        {...props}
      >
        <AlertTriangle size={size} color="var(--primary-600)" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideWarningIcon.displayName = "LucideWarningIcon";

export { LucideWarningIcon };
