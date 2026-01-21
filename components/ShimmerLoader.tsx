import React from 'react';

interface ShimmerLoaderProps {
  lines?: number;
  className?: string;
}

const ShimmerLoader: React.FC<ShimmerLoaderProps> = ({ lines = 3, className = '' }) => {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="space-y-2">
          <div className="h-4 shimmer rounded w-3/4"></div>
          <div className="h-3 shimmer rounded w-full"></div>
          <div className="h-3 shimmer rounded w-5/6"></div>
        </div>
      ))}
    </div>
  );
};

export default ShimmerLoader;
