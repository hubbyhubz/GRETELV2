import { motion } from "framer-motion";
import { MessageSquare } from "lucide-react";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

interface LucideFeedbackIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const LucideFeedbackIcon = forwardRef<HTMLDivElement, LucideFeedbackIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        initial={{ y: 0 }}
        whileHover={{
          y: [-2, 0, -1, 0],
          transition: { duration: 0.4 }
        }}
        {...props}
      >
        <MessageSquare size={size} color="var(--primary-600)" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideFeedbackIcon.displayName = "LucideFeedbackIcon";

export { LucideFeedbackIcon };
