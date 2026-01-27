import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { forwardRef } from "react";

type LucideTrashIconProps = Omit<
  ComponentPropsWithoutRef<typeof motion.div>,
  "children"
> & {
  size?: number;
};

const LucideTrashIcon = forwardRef<HTMLDivElement, LucideTrashIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        initial={{ y: 0, rotate: 0 }}
        whileHover={{
          y: -2,
          rotate: [0, -5, 5, -5, 5, 0],
          transition: { duration: 0.5 }
        }}
        {...props}
      >
        <Trash2 size={size} color="var(--primary-600)" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideTrashIcon.displayName = "LucideTrashIcon";

export { LucideTrashIcon };
