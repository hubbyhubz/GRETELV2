import React, { useEffect, useState, useRef } from 'react';
import Lottie from 'lottie-react';
import confettiAnimationData from '../ANIMATION/Confetti.json';

interface ConfettiProps {
  trigger: boolean;
  onComplete?: () => void;
  numberOfPieces?: number;
}

const Confetti: React.FC<ConfettiProps> = ({ trigger, onComplete }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const animationRef = useRef<any>(null);

  useEffect(() => {
    if (trigger && !isPlaying) {
      setIsPlaying(true);
      
      // The animation duration is approximately 5 seconds (126 frames / 25 fps)
      const timeout = setTimeout(() => {
        setIsPlaying(false);
        onComplete?.();
      }, 5100); // Slightly longer than animation duration to ensure it finishes

      return () => clearTimeout(timeout);
    } else if (!trigger) {
      setIsPlaying(false);
    }
  }, [trigger, isPlaying, onComplete]);

  if (!isPlaying) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
      style={{ 
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh'
      }}
    >
      <Lottie
        lottieRef={animationRef}
        animationData={confettiAnimationData}
        loop={false}
        autoplay={true}
        style={{
          width: '100%',
          height: '100%',
          maxWidth: '1920px',
          maxHeight: '1080px'
        }}
      />
    </div>
  );
};

export default Confetti;
