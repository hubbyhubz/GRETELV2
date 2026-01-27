import { motion } from "framer-motion";
import { FolderOpen } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { forwardRef } from "react";

type LucideProjectIconProps = Omit<
  ComponentPropsWithoutRef<typeof motion.div>,
  "children"
> & {
  size?: number;
};

const LucideProjectIcon = forwardRef<HTMLDivElement, LucideProjectIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        initial={{ y: 0 }}
        whileHover={{
          y: -3,
        }}
        transition={{ type: "spring", stiffness: 180, damping: 15 }}
        {...props}
      >
        <FolderOpen size={size} color="var(--primary-600)" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideProjectIcon.displayName = "LucideProjectIcon";

export { LucideProjectIcon };
