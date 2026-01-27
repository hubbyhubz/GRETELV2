import React, { useState, useEffect } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import sendIconAnimation from './Send icon v2.json';

interface LottieSendIconProps {
  size?: number;
  onClick?: () => void;
  className?: string;
  hoverBackground?: boolean;
}

const LottieSendIcon: React.FC<LottieSendIconProps> = ({ 
  size = 56, 
  onClick,
  className,
  hoverBackground = true
}) => {
  const [dotLottie, setDotLottie] = useState<any>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    // Play animation on click
    if (dotLottie) {
      dotLottie.stop();
      dotLottie.play();
    }
    onClick?.();
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    // Play animation on hover
    if (dotLottie) {
      dotLottie.play();
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    // Stop animation when not hovering
    if (dotLottie) {
      dotLottie.stop();
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
        backgroundColor: hoverBackground && isHovered ? 'rgba(var(--primary-600-rgb), 0.1)' : 'transparent',
        borderRadius: '8px',
        transition: 'background-color 0.2s'
      }}
    >
      <DotLottieReact
        data={sendIconAnimation}
        loop={false}
        autoplay={false}
        dotLottieRefCallback={setDotLottie}
        style={{ width: size * 0.8, height: size * 0.8 }}
      />
    </div>
  );
};

export { LottieSendIcon };
