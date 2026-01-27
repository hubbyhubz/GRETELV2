import type { Variants } from "framer-motion";
import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";

interface CircleCheckboxIconProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  size?: number;
  checked: boolean;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const PATH_VARIANTS: Variants = {
  unchecked: {
    opacity: 0,
    pathLength: 0,
    transition: {
      duration: 0.2,
      opacity: { duration: 0.1 },
    },
  },
  checked: {
    opacity: [0, 1],
    pathLength: [0, 1],
    transition: {
      duration: 0.4,
      opacity: { duration: 0.1, delay: 0.1 },
      pathLength: { duration: 0.4, ease: "easeInOut" },
    },
  },
};

const CircleCheckboxIcon: React.FC<CircleCheckboxIconProps> = ({ 
  checked, 
  size = 16, 
  onClick,
  className,
  ...props 
}) => {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{ 
        display: 'inline-flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        cursor: 'pointer'
      }}
      {...props}
    >
      <svg
        fill="none"
        height={size}
        stroke="var(--primary-600)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="12" cy="12" r="10" />
        <motion.path
          d="m9 12 2 2 4-4"
          initial="unchecked"
          animate={checked ? "checked" : "unchecked"}
          variants={PATH_VARIANTS}
        />
      </svg>
    </div>
  );
};

CircleCheckboxIcon.displayName = "CircleCheckboxIcon";

export { CircleCheckboxIcon };
