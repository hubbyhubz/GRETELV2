import { motion } from "framer-motion";
import { Bell } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { forwardRef } from "react";

type LucideReminderIconProps = Omit<
  ComponentPropsWithoutRef<typeof motion.div>,
  "children"
> & {
  size?: number;
};

const LucideReminderIcon = forwardRef<HTMLDivElement, LucideReminderIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        initial={{ rotate: 0 }}
        whileHover={{
          rotate: [0, -10, 10, -10, 10, 0],
          transition: { duration: 0.5 }
        }}
        {...props}
      >
        <Bell size={size} color="var(--primary-600)" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideReminderIcon.displayName = "LucideReminderIcon";

export { LucideReminderIcon };
