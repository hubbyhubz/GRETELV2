import React, { useRef, useState } from 'react';
import Lottie, { LottieRefCurrentProps } from 'lottie-react';
import sendIconAnimation from './Send icon v2.json';

interface LottieSendIconProps {
  size?: number;
  onClick?: () => void;
  className?: string;
}

const LottieSendIcon: React.FC<LottieSendIconProps> = ({ 
  size = 56, 
  onClick,
  className 
}) => {
  const lottieRef = useRef<LottieRefCurrentProps>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    // Play animation on click
    if (lottieRef.current) {
      lottieRef.current.goToAndPlay(0, true);
    }
    onClick?.();
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    // Play animation on hover
    if (lottieRef.current) {
      lottieRef.current.goToAndPlay(0, true);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    // Stop animation when not hovering
    if (lottieRef.current) {
      lottieRef.current.stop();
    }
  };

  return (
    <div 
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={className}
      style={{ 
        width: size, 
        height: size, 
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isHovered ? 'rgba(220, 20, 60, 0.1)' : 'transparent',
        borderRadius: '8px',
        transition: 'background-color 0.2s'
      }}
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={sendIconAnimation}
        loop={false}
        autoplay={false}
        style={{ width: size * 0.8, height: size * 0.8 }}
      />
    </div>
  );
};

export { LottieSendIcon };
