import { motion, type HTMLMotionProps } from "framer-motion";
import { Briefcase } from "lucide-react";
import { forwardRef } from "react";

interface LucideBriefcaseIconProps extends HTMLMotionProps<"div"> {
  size?: number;
}

const LucideBriefcaseIcon = forwardRef<HTMLDivElement, LucideBriefcaseIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        initial={{ y: 0, scale: 1 }}
        whileHover={{
          y: -2,
          scale: 1.05,
        }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        {...props}
      >
        <Briefcase size={size} color="var(--primary-600)" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideBriefcaseIcon.displayName = "LucideBriefcaseIcon";

export { LucideBriefcaseIcon };
