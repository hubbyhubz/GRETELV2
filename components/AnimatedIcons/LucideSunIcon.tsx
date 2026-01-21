import { motion } from "framer-motion";
import { Sun } from "lucide-react";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

interface LucideSunIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const LucideSunIcon = forwardRef<HTMLDivElement, LucideSunIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        initial={{ rotate: 0, scale: 1 }}
        animate={{ 
          rotate: 360,
          scale: [1, 1.1, 1],
        }}
        transition={{ 
          rotate: { duration: 0.6, ease: "easeInOut" },
          scale: { duration: 0.3 }
        }}
        whileHover={{
          rotate: 180,
          scale: 1.1,
        }}
        {...props}
      >
        <Sun size={size} color="#DC143C" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideSunIcon.displayName = "LucideSunIcon";

export { LucideSunIcon };
