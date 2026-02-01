import { motion, type HTMLMotionProps } from "framer-motion";
import { CalendarCheck } from "lucide-react";
import { forwardRef } from "react";

interface LucideCalendarIconProps extends HTMLMotionProps<"div"> {
  size?: number;
}

const LucideCalendarIcon = forwardRef<HTMLDivElement, LucideCalendarIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        initial={{ rotateY: 0 }}
        whileHover={{
          rotateY: 15,
        }}
        transition={{ type: "spring", stiffness: 180, damping: 15 }}
        {...props}
      >
        <CalendarCheck size={size} color="var(--primary-600)" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideCalendarIcon.displayName = "LucideCalendarIcon";

export { LucideCalendarIcon };
