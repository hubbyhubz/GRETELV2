import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { motion, useAnimation, type AnimationControls, type Variants } from 'framer-motion';

export interface ImageIconHandle {
    startAnimation: () => void;
    stopAnimation: () => void;
}

const pathVariants: Variants = {
    normal: {
        pathLength: 1,
        opacity: 1,
        transition: {
            duration: 0.3,
            ease: 'easeInOut',
        },
    },
    animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: {
            duration: 0.8,
            ease: 'easeInOut',
            repeat: Infinity,
            repeatDelay: 1
        },
    },
};

const circleVariants: Variants = {
    normal: {
        scale: 1,
        opacity: 1,
        transition: {
            duration: 0.3,
            ease: 'easeInOut',
        },
    },
    animate: {
        scale: [0.8, 1.2, 1],
        opacity: [0.5, 1, 0.5],
        transition: {
            duration: 1.5,
            ease: 'easeInOut',
            repeat: Infinity,
        },
    },
};

export const ImageIcon = forwardRef<ImageIconHandle, { size?: number; className?: string }>(
    ({ size = 24, className = '' }, ref) => {
        const controls = useAnimation();
        const circleControls = useAnimation();
        const isHovered = useRef(false);

        useImperativeHandle(ref, () => ({
            startAnimation: () => {
                isHovered.current = true;
                controls.start('animate');
                circleControls.start('animate');
            },
            stopAnimation: () => {
                isHovered.current = false;
                controls.start('normal');
                circleControls.start('normal');
            },
        }));

        const handleMouseEnter = () => {
            isHovered.current = true;
            controls.start('animate');
            circleControls.start('animate');
        };

        const handleMouseLeave = () => {
            isHovered.current = false;
            controls.start('normal');
            circleControls.start('normal');
        };

        return (
            <div
                className={`cursor-pointer select-none p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors duration-200 flex items-center justify-center ${className}`}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width={size}
                    height={size}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <motion.rect 
                        width="18" 
                        height="18" 
                        x="3" 
                        y="3" 
                        rx="2" 
                        ry="2"
                        variants={pathVariants}
                        initial="normal"
                        animate={controls}
                    />
                    <motion.circle 
                        cx="9" 
                        cy="9" 
                        r="2"
                        variants={circleVariants}
                        initial="normal"
                        animate={circleControls}
                    />
                    <motion.path 
                        d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"
                        variants={pathVariants}
                        initial="normal"
                        animate={controls}
                    />
                </svg>
            </div>
        );
    }
);

ImageIcon.displayName = 'ImageIcon';