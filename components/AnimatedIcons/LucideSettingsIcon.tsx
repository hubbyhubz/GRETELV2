import { motion, type HTMLMotionProps } from "framer-motion";
import { Settings } from "lucide-react";
import { forwardRef } from "react";

interface LucideSettingsIconProps extends HTMLMotionProps<"div"> {
  size?: number;
}

const LucideSettingsIcon = forwardRef<HTMLDivElement, LucideSettingsIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        whileHover={{
          rotate: 180,
        }}
        transition={{ type: "spring", stiffness: 50, damping: 10 }}
        {...props}
      >
        <Settings size={size} color="var(--primary-600)" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideSettingsIcon.displayName = "LucideSettingsIcon";

export { LucideSettingsIcon };
