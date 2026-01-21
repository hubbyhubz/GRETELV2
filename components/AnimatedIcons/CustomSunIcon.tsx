import React from 'react';

interface CustomSunIconProps {
  size?: number;
  className?: string;
}

const CustomSunIcon: React.FC<CustomSunIconProps> = ({ size = 18, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Central circle */}
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      
      {/* 8 rays */}
      {/* Top */}
      <line x1="12" y1="1" x2="12" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Top-right */}
      <line x1="18.5" y1="5.5" x2="15.5" y2="8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Right */}
      <line x1="23" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Bottom-right */}
      <line x1="18.5" y1="18.5" x2="15.5" y2="15.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Bottom */}
      <line x1="12" y1="23" x2="12" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Bottom-left */}
      <line x1="5.5" y1="18.5" x2="8.5" y2="15.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Left */}
      <line x1="1" y1="12" x2="5" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Top-left */}
      <line x1="5.5" y1="5.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
};

export default CustomSunIcon;
