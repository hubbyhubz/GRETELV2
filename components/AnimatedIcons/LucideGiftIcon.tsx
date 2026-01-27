import { motion } from "framer-motion";
import { Gift } from "lucide-react";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

interface LucideGiftIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const LucideGiftIcon = forwardRef<HTMLDivElement, LucideGiftIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        initial={{ y: 0, rotate: 0 }}
        whileHover={{
          y: [-2, 0, -2, 0],
          rotate: [-3, 3, -3, 3, 0],
          transition: { duration: 0.6 }
        }}
        {...props}
      >
        <Gift size={size} color="var(--primary-600)" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideGiftIcon.displayName = "LucideGiftIcon";

export { LucideGiftIcon };
