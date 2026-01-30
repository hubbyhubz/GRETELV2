import React, { useId } from 'react';
import { useTheme } from './ThemeContext';
import '../styles/theme-toggle.css';

interface ThemeToggleButtonProps {
    position?: 'fixed' | 'static';
}

const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({ position = 'fixed' }) => {
    const { theme, toggleTheme } = useTheme();
    const uniqueId = useId(); // Generate unique ID for this instance
    const checkboxId = `theme-toggle-checkbox-${uniqueId}`;

    const positionClasses = position === 'fixed' ? "fixed top-4 right-4" : "";

    const handleToggle = () => {
        toggleTheme();
    };

    return (
        <div 
            className={positionClasses}
            style={{ 
                zIndex: position === 'fixed' ? 60 : 'auto',
                position: position === 'fixed' ? 'fixed' : 'static',
                top: position === 'fixed' ? '1rem' : undefined,
                right: position === 'fixed' ? '1rem' : undefined,
            }}
        >
            <label 
                className="switch" 
                htmlFor={checkboxId}
                style={{ pointerEvents: 'auto' }}
            >
                <input 
                    id={checkboxId}
                    type="checkbox" 
                    checked={theme === 'dark'}
                    onChange={(e) => {
                        e.stopPropagation();
                        handleToggle();
                    }}
                    aria-label="Toggle theme"
                />
                <span className="slider" aria-hidden="true" />
            </label>
        </div>
    );
};

export default ThemeToggleButton;
