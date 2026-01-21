import React, { useEffect, useState } from 'react';
import { motion, useSpring, useAnimation } from 'framer-motion';
import '../styles/KawaiiProgressBar.css';

interface KawaiiProgressBarProps {
  progress: number;
}

export const KawaiiProgressBar: React.FC<KawaiiProgressBarProps> = ({ progress }) => {
  // Use a spring to animate the progress value smoothly
  // Stiffness 60, Damping 15 gives a smooth, slightly bouncy feel suitable for UI filling
  const springProgress = useSpring(progress, {
    stiffness: 60,
    damping: 15,
    mass: 1
  });

  const [displayProgress, setDisplayProgress] = useState(progress);
  const containerControls = useAnimation();

  useEffect(() => {
    // Subscribe to spring updates
    const unsubscribe = springProgress.on("change", (latest) => {
      setDisplayProgress(latest);
      
      // Trigger a subtle overshoot/pulse animation when reaching 100%
      // We check if we are very close to 100 and the target is 100
      if (latest >= 99.5 && progress === 100) {
        containerControls.start({
          scale: [1, 1.02, 1],
          transition: { duration: 0.3, ease: "easeOut" }
        });
      }
    });

    return () => unsubscribe();
  }, [springProgress, progress, containerControls]);

  // Update spring target when prop changes
  useEffect(() => {
    springProgress.set(progress);
  }, [progress, springProgress]);

  return (
    <motion.div 
      className="rangeWrapper" 
      style={{ height: 'auto', padding: '4px 0' }}
      animate={containerControls}
    >
      <input
        type="range"
        className="kawaii"
        min="0"
        max="100"
        step="0.01" // Enable smooth sub-pixel rendering
        value={displayProgress}
        readOnly
        style={{ pointerEvents: 'none', width: '100%', fontSize: '8px' }}
        aria-label="Daily Progress"
      />
    </motion.div>
  );
};
