import { motion, type HTMLMotionProps } from "framer-motion";
import { LogOut } from "lucide-react";
import { forwardRef } from "react";

interface LucideLogoutIconProps extends HTMLMotionProps<"div"> {
  size?: number;
}

const LucideLogoutIcon = forwardRef<HTMLDivElement, LucideLogoutIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        initial={{ x: 0 }}
        whileHover={{
          x: 3,
        }}
        transition={{ type: "spring", stiffness: 150, damping: 12 }}
        {...props}
      >
        <LogOut size={size} color="var(--primary-600)" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideLogoutIcon.displayName = "LucideLogoutIcon";

export { LucideLogoutIcon };
