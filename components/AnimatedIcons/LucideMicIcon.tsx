import { motion } from "framer-motion";
import { Mic } from "lucide-react";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

interface LucideMicIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isRecording?: boolean;
}

const LucideMicIcon = forwardRef<HTMLDivElement, LucideMicIconProps>(
  ({ className, size = 24, isRecording = false, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        initial={{ scale: 1 }}
        animate={isRecording ? { scale: [1, 1.1, 1] } : { scale: 1 }}
        transition={{
          duration: 1,
          repeat: isRecording ? Infinity : 0,
          repeatType: "loop",
        }}
        whileHover={{ scale: isRecording ? 1.15 : 1.1 }}
        {...props}
      >
        <Mic size={size} color="#DC143C" strokeWidth={2} />
      </motion.div>
    );
  }
);

LucideMicIcon.displayName = "LucideMicIcon";

export { LucideMicIcon };
