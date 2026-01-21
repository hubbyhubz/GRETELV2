import React from 'react';

interface CustomLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const CustomLoader: React.FC<CustomLoaderProps> = ({ size = 'md', className = '' }) => {
  const sizeClass = size === 'sm' ? 'custom-loader-sm' : size === 'lg' ? 'custom-loader-lg' : 'custom-loader';
  
  return <div className={`${sizeClass} ${className}`}></div>;
};
