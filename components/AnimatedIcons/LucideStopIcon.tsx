import { motion } from "framer-motion";
import { Square } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { forwardRef } from "react";

type LucideStopIconProps = Omit<
  ComponentPropsWithoutRef<typeof motion.div>,
  "children"
> & {
  size?: number;
};

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
        <Square size={size} color="var(--primary-600)" strokeWidth={2} fill="var(--primary-600)" />
      </motion.div>
    );
  }
);

LucideStopIcon.displayName = "LucideStopIcon";

export { LucideStopIcon };
