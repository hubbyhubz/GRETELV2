import { motion } from "framer-motion";
import { FileText } from "lucide-react";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

interface LucideBriefingIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const LucideBriefingIcon = forwardRef<HTMLDivElement, LucideBriefingIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        initial={{ rotateY: 0 }}
        whileHover={{
          rotateY: 180,
        }}
        transition={{ type: "spring", stiffness: 180, damping: 15 }}
        {...props}
      >
        <FileText size={size} color="var(--primary-600)" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideBriefingIcon.displayName = "LucideBriefingIcon";

export { LucideBriefingIcon };
