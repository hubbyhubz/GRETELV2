import { motion } from "framer-motion";
import { Send } from "lucide-react";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

interface LucideSendIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  color?: string;
}

const LucideSendIcon = forwardRef<HTMLDivElement, LucideSendIconProps>(
  ({ className, size = 24, color = "#DC143C", ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        initial={{ x: 0, rotate: 0 }}
        whileHover={{
          x: 3,
          rotate: -15,
        }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 150, damping: 12 }}
        {...props}
      >
        <Send size={size} color={color} strokeWidth={1.8} />
      </motion.div>
    );
  }
);

LucideSendIcon.displayName = "LucideSendIcon";

export { LucideSendIcon };
