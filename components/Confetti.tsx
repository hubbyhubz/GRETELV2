import React from 'react';
import ReactConfetti from 'react-confetti';
import { useWindowSize } from 'react-use';

interface ConfettiProps {
  trigger: boolean;
  onComplete?: () => void;
  numberOfPieces?: number;
  recycle?: boolean;
  gravity?: number;
}

const Confetti: React.FC<ConfettiProps> = ({ 
  trigger, 
  onComplete, 
  numberOfPieces = 300, 
  recycle = false, 
  gravity = 0.3 
}) => {
  const { width, height } = useWindowSize();

  if (!trigger) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
      style={{ zIndex: 9999 }} // Ensure it's on top
    >
      <ReactConfetti
        width={width}
        height={height}
        numberOfPieces={numberOfPieces}
        recycle={recycle}
        gravity={gravity}
        onConfettiComplete={onComplete}
        initialVelocityX={4}
        initialVelocityY={10}
      />
    </div>
  );
};

export default Confetti;
