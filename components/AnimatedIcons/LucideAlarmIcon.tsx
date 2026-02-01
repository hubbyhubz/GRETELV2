import { motion, type HTMLMotionProps } from "framer-motion";
import { AlarmClock } from "lucide-react";
import { forwardRef } from "react";

interface LucideAlarmIconProps extends HTMLMotionProps<"div"> {
  size?: number;
}

const LucideAlarmIcon = forwardRef<HTMLDivElement, LucideAlarmIconProps>(
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
        <AlarmClock size={size} color="var(--primary-600)" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideAlarmIcon.displayName = "LucideAlarmIcon";

export { LucideAlarmIcon };
