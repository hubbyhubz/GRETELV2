import { motion } from "framer-motion";
import { Moon } from "lucide-react";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

interface LucideMoonIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const LucideMoonIcon = forwardRef<HTMLDivElement, LucideMoonIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        initial={{ rotate: 0 }}
        whileHover={{
          rotate: -15,
        }}
        transition={{ type: "spring", stiffness: 150, damping: 12 }}
        {...props}
      >
        <Moon size={size} color="#DC143C" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideMoonIcon.displayName = "LucideMoonIcon";

export { LucideMoonIcon };
