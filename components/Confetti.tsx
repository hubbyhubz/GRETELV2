import React, { useEffect, useState } from 'react';
import ReactConfetti from 'react-confetti';
import { useWindowSize } from 'react-use';

interface ConfettiProps {
  trigger: boolean;
  onComplete?: () => void;
  numberOfPieces?: number;
}

const Confetti: React.FC<ConfettiProps> = ({ trigger, onComplete, numberOfPieces = 200 }) => {
  const { width, height } = useWindowSize();
  const [isActive, setIsActive] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Check for mobile viewport and reduced motion preference
  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    const handleMotionChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    window.addEventListener('resize', handleResize);
    mediaQuery.addEventListener('change', handleMotionChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      mediaQuery.removeEventListener('change', handleMotionChange);
    };
  }, []);

  useEffect(() => {
    if (trigger) {
      if (prefersReducedMotion) {
        // Skip animation if user prefers reduced motion
        onComplete?.();
        return;
      }
      
      setShouldRender(true);
      setIsActive(true);
      
      // Stop generating new particles after 3 seconds
      const stopTimer = setTimeout(() => {
        setIsActive(false);
      }, 3000);

      // Remove component after 6 seconds (allowing particles to fall)
      const cleanupTimer = setTimeout(() => {
        setShouldRender(false);
        onComplete?.();
      }, 6000);

      return () => {
        clearTimeout(stopTimer);
        clearTimeout(cleanupTimer);
      };
    } else {
      setIsActive(false);
      setShouldRender(false);
    }
  }, [trigger, onComplete, prefersReducedMotion]);

  if (!shouldRender || prefersReducedMotion) {
    return null;
  }

  // Optimize particle count based on device
  const particleCount = isMobile ? Math.min(numberOfPieces, 80) : numberOfPieces;

  return (
    <div 
      className="fixed inset-0 pointer-events-none z-[100]"
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%' }}
    >
      <ReactConfetti
        width={width}
        height={height}
        numberOfPieces={isActive ? particleCount : 0}
        recycle={true}
        gravity={isMobile ? 0.25 : 0.2} // Slightly faster on mobile
        colors={['#DC143C', '#FFD700', '#4169E1', '#32CD32', '#FF69B4']}
        tweenDuration={5000}
        initialVelocityY={20} // Start higher
      />
    </div>
  );
};

export default Confetti;